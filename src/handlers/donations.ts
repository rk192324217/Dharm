// ─────────────────────────────────────────────────────────────────────────────
// Donation Handlers
//
// Routes:
//   POST   /api/donations                  → createDonation
//   GET    /api/donations                  → listDonations
//   GET    /api/donations/{donationId}     → getDonation
//
// Authentication note (Phase 2):
//   donorId is currently accepted from the request body.
//   Phase 3 will replace this with Cognito JWT sub claim extracted from
//   event.requestContext.authorizer.jwt.claims.sub
//   Do NOT use this body-supplied donorId as a security boundary.
// ─────────────────────────────────────────────────────────────────────────────

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import type { ApiErrorResponse, ApiSuccessResponse, Donation } from '../types';
import {
  validateCreateDonation,
  validateListDonationsQuery,
} from '../validation/donation.validation';
import type { DonationRepository } from '../repositories/donation.repository';
import { donationRepository as defaultRepo } from '../repositories/donation.repository';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok<T>(data: T, status = 200): APIGatewayProxyResultV2 {
  const body: ApiSuccessResponse<T> = { success: true, data };
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function err(statusCode: number, code: string, message: string): APIGatewayProxyResultV2 {
  const body: ApiErrorResponse = { success: false, error: { code, message } };
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> | null {
  if (!event.body) return null;
  try {
    return JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Return a public-safe view of a donation.
 *
 * When a donation is AVAILABLE, receivers browsing the list should not see
 * the exact pickup coordinates.  Once a request is accepted the full address
 * is shared via the request acceptance response (Phase 3).
 *
 * This function strips lat/lng and returns only approximateLocation unless
 * the caller owns the donation.
 */
function toPublicView(
  donation: Donation,
  requestingUserId?: string,
): Omit<Donation, 'latitude' | 'longitude'> | Donation {
  if (requestingUserId && requestingUserId === donation.donorId) {
    // Donor sees their own donation in full
    return donation;
  }
  // Everyone else: hide exact coordinates
  const { latitude: _lat, longitude: _lng, ...publicView } = donation;
  return publicView;
}

// ── Injectable repository (for testing) ──────────────────────────────────────
// Handlers accept an optional repo parameter so unit tests can inject a mock
// without touching DynamoDB or environment variables.

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/donations
// ─────────────────────────────────────────────────────────────────────────────

export async function createDonation(
  event: APIGatewayProxyEventV2,
  repo: DonationRepository = defaultRepo,
): Promise<APIGatewayProxyResultV2> {
  // 1. Parse body
  const body = parseBody(event);
  if (!body) {
    return err(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  // 2. Validate
  const { result, input } = validateCreateDonation(body as Record<string, never>);
  if (!result.valid || !input) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'One or more fields are invalid.',
          details: result.errors,
        },
      }),
    };
  }

  // 3. Build the donation record
  const now = new Date().toISOString();
  const donation: Donation = {
    donationId: randomUUID(),
    donorId: input.donorId,
    title: input.title,
    description: input.description,
    foodCategory: input.foodCategory,
    quantity: input.quantity,
    unit: input.unit,
    preparedAt: input.preparedAt,
    storageConditions: input.storageConditions,
    pickupDeadline: input.pickupDeadline,
    latitude: input.latitude,
    longitude: input.longitude,
    status: 'AVAILABLE',
    createdAt: now,
    updatedAt: now,
    ...(input.dietaryInformation && { dietaryInformation: input.dietaryInformation }),
    ...(input.allergens && { allergens: input.allergens }),
    ...(input.approximateLocation && { approximateLocation: input.approximateLocation }),
  };

  // 4. Persist
  try {
    await repo.create(donation);
  } catch (e) {
    console.error('createDonation: DynamoDB error', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to save donation. Please try again.');
  }

  // 5. Return 201 with the created donation (donor sees full record)
  return ok(donation, 201);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/donations
// ─────────────────────────────────────────────────────────────────────────────

export async function listDonations(
  event: APIGatewayProxyEventV2,
  repo: DonationRepository = defaultRepo,
): Promise<APIGatewayProxyResultV2> {
  // Parse and validate query parameters
  const params = event.queryStringParameters ?? {};
  const { result, query } = validateListDonationsQuery(params as Record<string, string | undefined>);
  if (!result.valid || !query) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters.',
          details: result.errors,
        },
      }),
    };
  }

  let items: Donation[];
  let nextToken: string | undefined;

  try {
    const page = await repo.listByStatus(
      query.status as Donation['status'],
      query.limit,
      query.nextToken,
    );
    items = page.items;
    nextToken = page.nextToken;
  } catch (e) {
    console.error('listDonations: DynamoDB error', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to retrieve donations.');
  }

  // Apply optional category filter (post-query; a dedicated GSI would avoid this
  // but adds complexity. At hackathon scale the result set is tiny.)
  if (query.category) {
    items = items.filter((d) => d.foodCategory === query.category);
  }

  // Strip coordinates from public listing
  const publicItems = items.map((d) => toPublicView(d));

  return ok({
    items: publicItems,
    count: publicItems.length,
    ...(nextToken && { nextToken }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/donations/{donationId}
// ─────────────────────────────────────────────────────────────────────────────

export async function getDonation(
  event: APIGatewayProxyEventV2,
  repo: DonationRepository = defaultRepo,
): Promise<APIGatewayProxyResultV2> {
  const donationId = event.pathParameters?.['donationId'];
  if (!donationId) {
    return err(400, 'MISSING_PARAM', 'donationId path parameter is required.');
  }

  let donation: Donation | null;
  try {
    donation = await repo.getById(donationId);
  } catch (e) {
    console.error('getDonation: DynamoDB error', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to retrieve donation.');
  }

  if (!donation) {
    return err(404, 'NOT_FOUND', `Donation ${donationId} not found.`);
  }

  // Phase 2: no auth context yet, so always return public view.
  // Phase 3: extract sub from JWT claims and pass as requestingUserId.
  return ok(toPublicView(donation));
}

// ─────────────────────────────────────────────────────────────────────────────
// Lambda entry points
// Each handler is exported as a named export AND as a default-style handler
// so SAM can route them to separate Lambda functions.
// ─────────────────────────────────────────────────────────────────────────────

export const createDonationHandler = (event: APIGatewayProxyEventV2) =>
  createDonation(event);

export const listDonationsHandler = (event: APIGatewayProxyEventV2) =>
  listDonations(event);

export const getDonationHandler = (event: APIGatewayProxyEventV2) =>
  getDonation(event);
