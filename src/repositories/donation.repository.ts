// ─────────────────────────────────────────────────────────────────────────────
// Donation Repository
//
// All DynamoDB access for the donations table lives here.  Handlers never
// import DynamoDB directly – they call this repository.  This makes the
// business logic testable without a real database.
//
// Tables used:
//   dharm-donations-{env}   PK: donationId
//   GSI: status-createdAt-index   (list by status, sorted by creation time)
// ─────────────────────────────────────────────────────────────────────────────

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Donation, DonationStatus } from '../types';

// ── DynamoDB client (module-level singleton, reused across warm invocations) ──

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Table / index names come from environment variables ───────────────────────

function getTableName(): string {
  const name = process.env['DONATIONS_TABLE'];
  if (!name) throw new Error('DONATIONS_TABLE environment variable is not set.');
  return name;
}

const STATUS_INDEX = 'status-createdAt-index';

// ── Repository interface ──────────────────────────────────────────────────────
// Exposing an interface lets tests inject a mock without touching DynamoDB.

export interface DonationRepository {
  create(donation: Donation): Promise<void>;
  getById(donationId: string): Promise<Donation | null>;
  listByStatus(
    status: DonationStatus,
    limit: number,
    nextToken?: string,
  ): Promise<{ items: Donation[]; nextToken?: string }>;
  updateStatus(
    donationId: string,
    newStatus: DonationStatus,
    expectedCurrentStatus: DonationStatus,
  ): Promise<void>;
}

// ── DynamoDB implementation ───────────────────────────────────────────────────

export class DynamoDbDonationRepository implements DonationRepository {
  /**
   * Persist a new donation.
   *
   * Uses a conditional write to prevent overwriting an existing item with the
   * same donationId (should be impossible with UUID v4, but defence in depth).
   */
  async create(donation: Donation): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: getTableName(),
        Item: donation,
        ConditionExpression: 'attribute_not_exists(donationId)',
      }),
    );
  }

  /**
   * Retrieve a single donation by primary key.
   * Returns null if not found.
   */
  async getById(donationId: string): Promise<Donation | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: getTableName(),
        Key: { donationId },
      }),
    );
    return (result.Item as Donation | undefined) ?? null;
  }

  /**
   * List donations by status using the GSI.
   * Results are sorted by createdAt descending (newest first).
   *
   * Pagination uses DynamoDB's LastEvaluatedKey serialised as a base64 JSON
   * string (nextToken).  This is safe to return to the caller because DynamoDB
   * keys contain no sensitive data.
   */
  async listByStatus(
    status: DonationStatus,
    limit: number,
    nextToken?: string,
  ): Promise<{ items: Donation[]; nextToken?: string }> {
    // Decode pagination cursor
    let exclusiveStartKey: Record<string, unknown> | undefined;
    if (nextToken) {
      try {
        exclusiveStartKey = JSON.parse(
          Buffer.from(nextToken, 'base64').toString('utf-8'),
        ) as Record<string, unknown>;
      } catch {
        // Treat a malformed token as "start from beginning"
        exclusiveStartKey = undefined;
      }
    }

    const result = await docClient.send(
      new QueryCommand({
        TableName: getTableName(),
        IndexName: STATUS_INDEX,
        KeyConditionExpression: '#s = :status',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ScanIndexForward: false,      // newest first
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    // Encode next page cursor
    let outToken: string | undefined;
    if (result.LastEvaluatedKey) {
      outToken = Buffer.from(
        JSON.stringify(result.LastEvaluatedKey),
        'utf-8',
      ).toString('base64');
    }

    return {
      items: (result.Items ?? []) as Donation[],
      nextToken: outToken,
    };
  }

  /**
   * Atomically transition a donation's status.
   *
   * Uses a conditional update: if the current status doesn't match
   * expectedCurrentStatus the update is rejected (ConditionalCheckFailedException).
   * The caller should catch that and return HTTP 409.
   */
  async updateStatus(
    donationId: string,
    newStatus: DonationStatus,
    expectedCurrentStatus: DonationStatus,
  ): Promise<void> {
    const now = new Date().toISOString();
    await docClient.send(
      new UpdateCommand({
        TableName: getTableName(),
        Key: { donationId },
        UpdateExpression: 'SET #status = :new, updatedAt = :now',
        ConditionExpression: '#status = :expected',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':new': newStatus,
          ':expected': expectedCurrentStatus,
          ':now': now,
        },
      }),
    );
  }
}

// ── Default singleton instance ────────────────────────────────────────────────
// Handlers import this.  Tests replace it with a mock.

export const donationRepository: DonationRepository = new DynamoDbDonationRepository();
