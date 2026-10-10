// ─────────────────────────────────────────────────────────────────────────────
// Request Handlers
//
// Routes:
//   POST /api/donations/{donationId}/requests     → createRequest
//   POST /api/requests/{requestId}/accept         → acceptRequest
//   POST /api/requests/{requestId}/decline        → declineRequest
//   POST /api/requests/{requestId}/status         → updateRequestStatus
//
// Authorization model (Phase 2 – pre-Cognito):
//   - Caller identity is taken from the request body (donorId / receiverId).
//   - Phase 3 will derive identity from the Cognito JWT sub claim only.
//   - Do NOT rely on body-supplied IDs as a security boundary in production.
//
// Ownership rules enforced:
//   - Only the donation donor may accept or decline requests.
//   - Only the receiver who submitted the request may update its
//     collection status (COLLECTED / FAILED).
//   - A receiver may not request a donation they already have a PENDING
//     or ACCEPTED request for.
// ─────────────────────────────────────────────────────────────────────────────

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import type { ApiErrorResponse, ApiSuccessResponse, DonationRequest } from '../types';
import { validateCreateRequest, validateStatusUpdate } from '../validation/request.validation';
import type { DonationRepository } from '../repositories/donation.repository';
import { donationRepository as defaultDonationRepo } from '../repositories/donation.repository';
import type { RequestRepository } from '../repositories/request.repository';
import {
  requestRepository as defaultRequestRepo,
  ConflictError,
  NotFoundError,
} from '../repositories/request.repository';

// ── Shared HTTP helpers ───────────────────────────────────────────────────────

function ok<T>(data: T, status = 200): APIGatewayProxyResultV2 {
  const body: ApiSuccessResponse<T> = { success: true, data };
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function err(statusCode: number, code: string, message: string): APIGatewayProxyResultV2 {
  const body: ApiErrorResponse = { success: false, error: { code, message } };
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> | null {
  if (!event.body) return null;
  try { return JSON.parse(event.body) as Record<string, unknown>; }
  catch { return null; }
}

// ── Dependencies type ─────────────────────────────────────────────────────────
// Handlers accept both repos so tests can inject mocks cleanly.

interface Deps {
  donationRepo: DonationRepository;
  requestRepo: RequestRepository;
}

const defaultDeps: Deps = {
  donationRepo: defaultDonationRepo,
  requestRepo: defaultRequestRepo,
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/donations/{donationId}/requests
// ─────────────────────────────────────────────────────────────────────────────

export async function createRequest(
  event: APIGatewayProxyEventV2,
  deps: Deps = defaultDeps,
): Promise<APIGatewayProxyResultV2> {
  const donationId = event.pathParameters?.['donationId'];
  if (!donationId) return err(400, 'MISSING_PARAM', 'donationId path parameter is required.');

  const body = parseBody(event);
  if (!body) return err(400, 'INVALID_JSON', 'Request body must be valid JSON.');

  const { result, input } = validateCreateRequest(body as Record<string, never>);
  if (!result.valid || !input) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body.', details: result.errors },
      }),
    };
  }

  // ── Load the donation ────────────────────────────────────────────────────
  let donation;
  try {
    donation = await deps.donationRepo.getById(donationId);
  } catch (e) {
    console.error('createRequest: failed to load donation', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to retrieve donation.');
  }

  if (!donation) return err(404, 'NOT_FOUND', `Donation ${donationId} not found.`);

  // ── Eligibility checks ───────────────────────────────────────────────────
  if (donation.status !== 'AVAILABLE') {
    return err(409, 'DONATION_NOT_AVAILABLE',
      `Donation is ${donation.status} and cannot accept new requests.`);
  }

  // Deadline must not have passed
  if (new Date(donation.pickupDeadline).getTime() <= Date.now()) {
    return err(409, 'DONATION_EXPIRED', 'Donation pickup deadline has passed.');
  }

  // Receiver cannot request their own donated food (would only matter when
  // donor/receiver distinction comes from body IDs — Phase 3 enforces via JWT)
  if (input.receiverId === donation.donorId) {
    return err(403, 'FORBIDDEN', 'A donor cannot request their own donation.');
  }

  // Receiver must not already have a PENDING or ACCEPTED request for this donation
  let existingRequests: DonationRequest[] = [];
  try {
    existingRequests = await deps.requestRepo.listByDonation(donationId);
  } catch (e) {
    console.error('createRequest: failed to list existing requests', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to check existing requests.');
  }

  const duplicate = existingRequests.find(
    (r) =>
      r.receiverId === input.receiverId &&
      (r.status === 'PENDING' || r.status === 'ACCEPTED'),
  );
  if (duplicate) {
    return err(409, 'DUPLICATE_REQUEST',
      'You already have an active request for this donation.');
  }

  // ── Create the request ───────────────────────────────────────────────────
  const now = new Date().toISOString();
  const request: DonationRequest = {
    requestId: randomUUID(),
    donationId,
    donorId: donation.donorId,
    receiverId: input.receiverId,
    requestedQuantity: input.requestedQuantity,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await deps.requestRepo.create(request);
  } catch (e) {
    console.error('createRequest: failed to save request', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to create request.');
  }

  return ok(request, 201);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/requests/{requestId}/accept
// ─────────────────────────────────────────────────────────────────────────────

export async function acceptRequest(
  event: APIGatewayProxyEventV2,
  deps: Deps = defaultDeps,
): Promise<APIGatewayProxyResultV2> {
  const requestId = event.pathParameters?.['requestId'];
  if (!requestId) return err(400, 'MISSING_PARAM', 'requestId path parameter is required.');

  // Phase 2: donor identity from body
  const body = parseBody(event);
  const callerId = (body?.['donorId'] as string | undefined)?.trim();
  if (!callerId) return err(400, 'MISSING_FIELD', 'donorId is required to identify the donor.');

  // ── Load request ─────────────────────────────────────────────────────────
  let request: DonationRequest | null;
  try {
    request = await deps.requestRepo.getById(requestId);
  } catch (e) {
    console.error('acceptRequest: failed to load request', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to retrieve request.');
  }
  if (!request) return err(404, 'NOT_FOUND', `Request ${requestId} not found.`);

  // ── Ownership: only the donor of the donation may accept ─────────────────
  if (request.donorId !== callerId) {
    return err(403, 'FORBIDDEN', 'Only the donation donor may accept requests.');
  }

  // ── Guard: must be PENDING ────────────────────────────────────────────────
  if (request.status !== 'PENDING') {
    return err(409, 'INVALID_TRANSITION',
      `Request is ${request.status} and cannot be accepted.`);
  }

  // ── Atomic accept (TransactWrite) ─────────────────────────────────────────
  let accepted: DonationRequest;
  try {
    accepted = await deps.requestRepo.acceptRequest(requestId, request.donationId);
  } catch (e) {
    if (e instanceof ConflictError) {
      return err(409, 'CONFLICT', e.message);
    }
    console.error('acceptRequest: transaction failed', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to accept request.');
  }

  // ── Best-effort: decline all other pending requests for this donation ─────
  // Errors here are logged but do not fail this response.
  deps.requestRepo
    .declineOtherPendingRequests(request.donationId, requestId)
    .catch((e: unknown) => console.warn('acceptRequest: declineOtherPendingRequests failed', e));

  return ok(accepted);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/requests/{requestId}/decline
// ─────────────────────────────────────────────────────────────────────────────

export async function declineRequest(
  event: APIGatewayProxyEventV2,
  deps: Deps = defaultDeps,
): Promise<APIGatewayProxyResultV2> {
  const requestId = event.pathParameters?.['requestId'];
  if (!requestId) return err(400, 'MISSING_PARAM', 'requestId path parameter is required.');

  const body = parseBody(event);
  const callerId = (body?.['donorId'] as string | undefined)?.trim();
  if (!callerId) return err(400, 'MISSING_FIELD', 'donorId is required to identify the donor.');

  let request: DonationRequest | null;
  try {
    request = await deps.requestRepo.getById(requestId);
  } catch (e) {
    console.error('declineRequest: failed to load request', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to retrieve request.');
  }
  if (!request) return err(404, 'NOT_FOUND', `Request ${requestId} not found.`);

  if (request.donorId !== callerId) {
    return err(403, 'FORBIDDEN', 'Only the donation donor may decline requests.');
  }

  if (request.status !== 'PENDING') {
    return err(409, 'INVALID_TRANSITION',
      `Request is ${request.status} and cannot be declined.`);
  }

  let declined: DonationRequest;
  try {
    declined = await deps.requestRepo.declineRequest(requestId);
  } catch (e) {
    if (e instanceof ConflictError) return err(409, 'CONFLICT', e.message);
    console.error('declineRequest: update failed', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to decline request.');
  }

  return ok(declined);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/requests/{requestId}/status
// ─────────────────────────────────────────────────────────────────────────────

export async function updateRequestStatus(
  event: APIGatewayProxyEventV2,
  deps: Deps = defaultDeps,
): Promise<APIGatewayProxyResultV2> {
  const requestId = event.pathParameters?.['requestId'];
  if (!requestId) return err(400, 'MISSING_PARAM', 'requestId path parameter is required.');

  const body = parseBody(event);
  if (!body) return err(400, 'INVALID_JSON', 'Request body must be valid JSON.');

  const { result, input } = validateStatusUpdate(body as Record<string, never>);
  if (!result.valid || !input) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid status update.', details: result.errors },
      }),
    };
  }

  // Phase 2: receiver identity from body
  const callerId = (body['receiverId'] as string | undefined)?.trim();
  if (!callerId) return err(400, 'MISSING_FIELD', 'receiverId is required to identify the receiver.');

  let request: DonationRequest | null;
  try {
    request = await deps.requestRepo.getById(requestId);
  } catch (e) {
    console.error('updateRequestStatus: failed to load request', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to retrieve request.');
  }
  if (!request) return err(404, 'NOT_FOUND', `Request ${requestId} not found.`);

  // Only the receiver who submitted the request can report collection status
  if (request.receiverId !== callerId) {
    return err(403, 'FORBIDDEN', 'Only the receiver who submitted this request may update its status.');
  }

  if (request.status !== 'ACCEPTED') {
    return err(409, 'INVALID_TRANSITION',
      `Request is ${request.status}. Only ACCEPTED requests can be marked ${input.status}.`);
  }

  let updated: DonationRequest;
  try {
    updated = await deps.requestRepo.updateCollectionStatus(
      requestId,
      request.donationId,
      input.status,
    );
  } catch (e) {
    if (e instanceof ConflictError) return err(409, 'CONFLICT', e.message);
    if (e instanceof NotFoundError) return err(404, 'NOT_FOUND', e.message);
    console.error('updateRequestStatus: transaction failed', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to update request status.');
  }

  return ok(updated);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lambda entry points
// ─────────────────────────────────────────────────────────────────────────────

export const createRequestHandler = (e: APIGatewayProxyEventV2) => createRequest(e);
export const acceptRequestHandler  = (e: APIGatewayProxyEventV2) => acceptRequest(e);
export const declineRequestHandler = (e: APIGatewayProxyEventV2) => declineRequest(e);
export const updateStatusHandler   = (e: APIGatewayProxyEventV2) => updateRequestStatus(e);
