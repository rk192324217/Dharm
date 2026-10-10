// ─────────────────────────────────────────────────────────────────────────────
// Request Repository
//
// All DynamoDB access for the requests table.  The critical operation here is
// acceptRequest(), which uses a DynamoDB TransactWrite to atomically:
//   1. Transition the request from PENDING → ACCEPTED
//   2. Transition the donation from AVAILABLE → RESERVED
//
// If either condition fails (e.g. another receiver already got accepted, or the
// donation is no longer AVAILABLE) the entire transaction is rolled back and
// DynamoDB throws a TransactionCanceledException.  The handler maps that to
// HTTP 409 Conflict.
//
// Tables used:
//   dharm-requests-{env}   PK: requestId
//     GSI: donationId-index    (find requests for a donation)
//     GSI: receiverId-index    (find requests by a receiver)
//   dharm-donations-{env}  PK: donationId  (updated inside transactions)
// ─────────────────────────────────────────────────────────────────────────────

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DonationRequest, RequestStatus } from '../types';

// ── DynamoDB clients ──────────────────────────────────────────────────────────

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Environment helpers ───────────────────────────────────────────────────────

function getRequestsTable(): string {
  const name = process.env['REQUESTS_TABLE'];
  if (!name) throw new Error('REQUESTS_TABLE environment variable is not set.');
  return name;
}

function getDonationsTable(): string {
  const name = process.env['DONATIONS_TABLE'];
  if (!name) throw new Error('DONATIONS_TABLE environment variable is not set.');
  return name;
}

const DONATION_ID_INDEX = 'donationId-index';
const RECEIVER_ID_INDEX = 'receiverId-index';

// ── Repository interface ──────────────────────────────────────────────────────

export interface RequestRepository {
  create(request: DonationRequest): Promise<void>;
  getById(requestId: string): Promise<DonationRequest | null>;
  listByDonation(donationId: string): Promise<DonationRequest[]>;
  listByReceiver(receiverId: string): Promise<DonationRequest[]>;

  /**
   * Atomically accept a request and reserve the donation.
   *
   * Uses DynamoDB TransactWrite:
   *   - request:  PENDING  → ACCEPTED  (conditional)
   *   - donation: AVAILABLE → RESERVED (conditional)
   *
   * Throws ConflictError if either condition fails.
   */
  acceptRequest(requestId: string, donationId: string): Promise<DonationRequest>;

  /**
   * Decline a single request (PENDING → DECLINED).
   * Conditional on current status being PENDING.
   */
  declineRequest(requestId: string): Promise<DonationRequest>;

  /**
   * Record collection or failure (ACCEPTED → COLLECTED | FAILED).
   * Also updates the donation status accordingly.
   * Conditional on request being in ACCEPTED state.
   */
  updateCollectionStatus(
    requestId: string,
    donationId: string,
    newStatus: 'COLLECTED' | 'FAILED',
  ): Promise<DonationRequest>;

  /**
   * Decline all PENDING requests for a donation except the accepted one.
   * Called after acceptRequest() succeeds.  Non-atomic — best effort.
   */
  declineOtherPendingRequests(donationId: string, acceptedRequestId: string): Promise<void>;
}

// ── Custom error types ────────────────────────────────────────────────────────

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

// ── DynamoDB implementation ───────────────────────────────────────────────────

export class DynamoDbRequestRepository implements RequestRepository {

  async create(request: DonationRequest): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: getRequestsTable(),
        Item: request,
        // Prevent duplicate requestIds (defence in depth with UUID v4)
        ConditionExpression: 'attribute_not_exists(requestId)',
      }),
    );
  }

  async getById(requestId: string): Promise<DonationRequest | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: getRequestsTable(),
        Key: { requestId },
      }),
    );
    return (result.Item as DonationRequest | undefined) ?? null;
  }

  async listByDonation(donationId: string): Promise<DonationRequest[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: getRequestsTable(),
        IndexName: DONATION_ID_INDEX,
        KeyConditionExpression: 'donationId = :did',
        ExpressionAttributeValues: { ':did': donationId },
      }),
    );
    return (result.Items ?? []) as DonationRequest[];
  }

  async listByReceiver(receiverId: string): Promise<DonationRequest[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: getRequestsTable(),
        IndexName: RECEIVER_ID_INDEX,
        KeyConditionExpression: 'receiverId = :rid',
        ExpressionAttributeValues: { ':rid': receiverId },
      }),
    );
    return (result.Items ?? []) as DonationRequest[];
  }

  /**
   * CRITICAL: Atomic accept using DynamoDB TransactWrite.
   *
   * Both conditions must hold simultaneously:
   *   - The request is still PENDING (nobody else declined/accepted it)
   *   - The donation is still AVAILABLE (nobody else got accepted for it)
   *
   * If either fails, TransactionCanceledException is thrown, which we
   * re-raise as ConflictError → HTTP 409.
   */
  async acceptRequest(requestId: string, donationId: string): Promise<DonationRequest> {
    const now = new Date().toISOString();

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            // 1. Transition the request: PENDING → ACCEPTED
            {
              Update: {
                TableName: getRequestsTable(),
                Key: { requestId },
                UpdateExpression: 'SET #s = :accepted, updatedAt = :now, acceptedAt = :now',
                ConditionExpression: '#s = :pending AND attribute_exists(requestId)',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: {
                  ':accepted': 'ACCEPTED' as RequestStatus,
                  ':pending': 'PENDING' as RequestStatus,
                  ':now': now,
                },
              },
            },
            // 2. Transition the donation: AVAILABLE → RESERVED
            {
              Update: {
                TableName: getDonationsTable(),
                Key: { donationId },
                UpdateExpression: 'SET #s = :reserved, updatedAt = :now',
                ConditionExpression: '#s = :available AND attribute_exists(donationId)',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: {
                  ':reserved': 'RESERVED',
                  ':available': 'AVAILABLE',
                  ':now': now,
                },
              },
            },
          ],
        }),
      );
    } catch (e) {
      // TransactionCanceledException means one of the conditions failed.
      // This is expected when two requests race to be accepted.
      const error = e as { name?: string; message?: string };
      if (error.name === 'TransactionCanceledException') {
        throw new ConflictError(
          'This donation has already been reserved or this request is no longer pending.',
        );
      }
      throw e;
    }

    // Fetch the updated request to return its current state
    const updated = await this.getById(requestId);
    if (!updated) throw new NotFoundError(`Request ${requestId} not found after accept.`);
    return updated;
  }

  async declineRequest(requestId: string): Promise<DonationRequest> {
    const now = new Date().toISOString();
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: getRequestsTable(),
          Key: { requestId },
          UpdateExpression: 'SET #s = :declined, updatedAt = :now',
          ConditionExpression: '#s = :pending AND attribute_exists(requestId)',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':declined': 'DECLINED' as RequestStatus,
            ':pending': 'PENDING' as RequestStatus,
            ':now': now,
          },
        }),
      );
    } catch (e) {
      const error = e as { name?: string };
      if (error.name === 'ConditionalCheckFailedException') {
        throw new ConflictError('Request is not in PENDING state and cannot be declined.');
      }
      throw e;
    }

    const updated = await this.getById(requestId);
    if (!updated) throw new NotFoundError(`Request ${requestId} not found after decline.`);
    return updated;
  }

  async updateCollectionStatus(
    requestId: string,
    donationId: string,
    newStatus: 'COLLECTED' | 'FAILED',
  ): Promise<DonationRequest> {
    const now = new Date().toISOString();

    // Derive the donation's new status:
    //   COLLECTED → donation becomes COLLECTED
    //   FAILED    → donation goes back to AVAILABLE (re-open for other requests)
    const donationNewStatus = newStatus === 'COLLECTED' ? 'COLLECTED' : 'AVAILABLE';

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            // 1. Transition request: ACCEPTED → COLLECTED | FAILED
            {
              Update: {
                TableName: getRequestsTable(),
                Key: { requestId },
                UpdateExpression:
                  'SET #s = :new, updatedAt = :now, collectedAt = :now',
                ConditionExpression: '#s = :accepted AND attribute_exists(requestId)',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: {
                  ':new': newStatus as RequestStatus,
                  ':accepted': 'ACCEPTED' as RequestStatus,
                  ':now': now,
                },
              },
            },
            // 2. Update donation status
            {
              Update: {
                TableName: getDonationsTable(),
                Key: { donationId },
                UpdateExpression: 'SET #s = :new, updatedAt = :now',
                ConditionExpression: '#s = :reserved AND attribute_exists(donationId)',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: {
                  ':new': donationNewStatus,
                  ':reserved': 'RESERVED',
                  ':now': now,
                },
              },
            },
          ],
        }),
      );
    } catch (e) {
      const error = e as { name?: string };
      if (error.name === 'TransactionCanceledException') {
        throw new ConflictError(
          'Request is not in ACCEPTED state or donation is not RESERVED. Cannot update status.',
        );
      }
      throw e;
    }

    const updated = await this.getById(requestId);
    if (!updated) throw new NotFoundError(`Request ${requestId} not found after status update.`);
    return updated;
  }

  /**
   * Decline all remaining PENDING requests for a donation after one is accepted.
   *
   * This is best-effort and non-atomic (runs after the accept transaction).
   * If an individual decline fails we log a warning but do not fail the overall
   * operation — the donation is already reserved, so those pending requests are
   * effectively dead anyway.
   */
  async declineOtherPendingRequests(
    donationId: string,
    acceptedRequestId: string,
  ): Promise<void> {
    const allRequests = await this.listByDonation(donationId);
    const pending = allRequests.filter(
      (r) => r.status === 'PENDING' && r.requestId !== acceptedRequestId,
    );

    const results = await Promise.allSettled(
      pending.map((r) => this.declineRequest(r.requestId)),
    );

    for (const [i, r] of results.entries()) {
      if (r.status === 'rejected') {
        // Log and continue — do not let this undo the accept
        console.warn(
          `declineOtherPendingRequests: failed to decline requestId=${pending[i]?.requestId}`,
          r.reason,
        );
      }
    }
  }
}

// ── Default singleton ─────────────────────────────────────────────────────────

export const requestRepository: RequestRepository = new DynamoDbRequestRepository();
