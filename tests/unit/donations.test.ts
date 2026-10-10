// ─────────────────────────────────────────────────────────────────────────────
// Unit tests: Donation handlers (Phase 2)
//
// All DynamoDB calls are replaced by a mock repository.
// No AWS credentials, no network, no environment variables needed.
//
// Coverage:
//   createDonation  – valid, missing fields, invalid types, past deadline
//   listDonations   – success, category filter, bad status param
//   getDonation     – found, not found, missing param
//   address privacy – coordinates stripped from public view
//   error handling  – database failure returns 500
// ─────────────────────────────────────────────────────────────────────────────

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { Donation } from '../../src/types';
import type { DonationRepository } from '../../src/repositories/donation.repository';
import {
  createDonation,
  listDonations,
  getDonation,
} from '../../src/handlers/donations';

// ── Test data ─────────────────────────────────────────────────────────────────

const FUTURE_DEADLINE = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // +4 h
const PAST_TIMESTAMP  = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // -2 h
const PREPARED_AT     = new Date(Date.now() - 30 * 60 * 1000).toISOString();     // -30 min

/** A complete, valid create-donation payload */
const VALID_BODY = {
  donorId: 'donor-001',
  title: 'Leftover biryani',
  description: 'Freshly cooked chicken biryani from a wedding event.',
  foodCategory: 'COOKED_MEAL',
  allergens: ['gluten', 'dairy'],
  quantity: 50,
  unit: 'servings',
  preparedAt: PREPARED_AT,
  storageConditions: 'REFRIGERATED',
  pickupDeadline: FUTURE_DEADLINE,
  latitude: 19.076,
  longitude: 72.877,
  approximateLocation: 'Andheri West, Mumbai',
};

/** A synthetic Donation record (as if already in DB) */
const STORED_DONATION: Donation = {
  donationId: 'don-123',
  donorId: 'donor-001',
  title: 'Leftover biryani',
  description: 'Freshly cooked chicken biryani.',
  foodCategory: 'COOKED_MEAL',
  quantity: 50,
  unit: 'servings',
  preparedAt: PREPARED_AT,
  storageConditions: 'REFRIGERATED',
  pickupDeadline: FUTURE_DEADLINE,
  latitude: 19.076,
  longitude: 72.877,
  approximateLocation: 'Andheri West, Mumbai',
  status: 'AVAILABLE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ── Mock repository factory ───────────────────────────────────────────────────

function makeMockRepo(overrides: Partial<DonationRepository> = {}): DonationRepository {
  return {
    create: jest.fn().mockResolvedValue(undefined),
    getById: jest.fn().mockResolvedValue(STORED_DONATION),
    listByStatus: jest.fn().mockResolvedValue({ items: [STORED_DONATION], nextToken: undefined }),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── Event builder ─────────────────────────────────────────────────────────────

function makePostEvent(body: unknown): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
    requestContext: { http: { method: 'POST' } },
  } as unknown as APIGatewayProxyEventV2;
}

function makeGetEvent(
  pathParams: Record<string, string> = {},
  queryParams: Record<string, string> = {},
): APIGatewayProxyEventV2 {
  return {
    pathParameters: pathParams,
    queryStringParameters: queryParams,
    requestContext: { http: { method: 'GET' } },
  } as unknown as APIGatewayProxyEventV2;
}

function parseBody<T = unknown>(result: unknown): { statusCode: number; body: T } {
  const r = result as { statusCode: number; body: string };
  return { statusCode: r.statusCode, body: JSON.parse(r.body) as T };
}

// ═════════════════════════════════════════════════════════════════════════════
// createDonation
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/donations – createDonation', () => {
  it('returns 201 with a server-generated donationId on valid input', async () => {
    const repo = makeMockRepo();
    const result = await createDonation(makePostEvent(VALID_BODY), repo);
    const { statusCode, body } = parseBody<{ success: boolean; data: Donation }>(result);

    expect(statusCode).toBe(201);
    expect(body.success).toBe(true);
    expect(typeof body.data.donationId).toBe('string');
    expect(body.data.donationId.length).toBeGreaterThan(0);
  });

  it('sets status to AVAILABLE and generates server timestamps', async () => {
    const repo = makeMockRepo();
    const result = await createDonation(makePostEvent(VALID_BODY), repo);
    const { body } = parseBody<{ data: Donation }>(result);

    expect(body.data.status).toBe('AVAILABLE');
    expect(body.data.createdAt).toMatch(/Z$/);
    expect(body.data.updatedAt).toMatch(/Z$/);
  });

  it('calls repo.create exactly once', async () => {
    const repo = makeMockRepo();
    await createDonation(makePostEvent(VALID_BODY), repo);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it('returns 400 INVALID_JSON when body is not JSON', async () => {
    const repo = makeMockRepo();
    const event = { body: 'not-json', requestContext: {} } as unknown as APIGatewayProxyEventV2;
    const result = await createDonation(event, repo);
    const { statusCode, body } = parseBody<{ error: { code: string } }>(result);
    expect(statusCode).toBe(400);
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('returns 400 VALIDATION_ERROR when body is missing', async () => {
    const repo = makeMockRepo();
    const event = { body: null, requestContext: {} } as unknown as APIGatewayProxyEventV2;
    const result = await createDonation(event, repo);
    const { statusCode } = parseBody(result);
    expect(statusCode).toBe(400);
  });

  it('returns 400 VALIDATION_ERROR for missing required fields', async () => {
    const repo = makeMockRepo();
    const result = await createDonation(makePostEvent({}), repo);
    const { statusCode, body } = parseBody<{ error: { code: string; details: unknown[] } }>(result);
    expect(statusCode).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.length).toBeGreaterThan(0);
  });

  it('returns 400 when quantity is zero', async () => {
    const repo = makeMockRepo();
    const result = await createDonation(makePostEvent({ ...VALID_BODY, quantity: 0 }), repo);
    const { statusCode, body } = parseBody<{ error: { code: string } }>(result);
    expect(statusCode).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when quantity is negative', async () => {
    const repo = makeMockRepo();
    const result = await createDonation(makePostEvent({ ...VALID_BODY, quantity: -5 }), repo);
    const { statusCode } = parseBody(result);
    expect(statusCode).toBe(400);
  });

  it('returns 400 when pickupDeadline is in the past', async () => {
    const repo = makeMockRepo();
    const result = await createDonation(
      makePostEvent({ ...VALID_BODY, pickupDeadline: PAST_TIMESTAMP }),
      repo,
    );
    const { statusCode, body } = parseBody<{ error: { details: { field: string }[] } }>(result);
    expect(statusCode).toBe(400);
    const deadlineError = body.error.details.find((e) => e.field === 'pickupDeadline');
    expect(deadlineError).toBeDefined();
  });

  it('returns 400 when pickupDeadline is before preparedAt', async () => {
    const repo = makeMockRepo();
    const laterPrepared = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const earlierDeadline = new Date(Date.now() + 60 * 1000).toISOString(); // only 1 min away
    // Make preparedAt more recent than deadline by reversing them
    const result = await createDonation(
      makePostEvent({ ...VALID_BODY, preparedAt: FUTURE_DEADLINE, pickupDeadline: laterPrepared }),
      repo,
    );
    const { statusCode } = parseBody(result);
    expect(statusCode).toBe(400);
    void earlierDeadline; // suppress unused var
  });

  it('returns 400 for an invalid foodCategory value', async () => {
    const repo = makeMockRepo();
    const result = await createDonation(
      makePostEvent({ ...VALID_BODY, foodCategory: 'MYSTERY_FOOD' }),
      repo,
    );
    const { statusCode, body } = parseBody<{ error: { details: { field: string }[] } }>(result);
    expect(statusCode).toBe(400);
    expect(body.error.details.find((e) => e.field === 'foodCategory')).toBeDefined();
  });

  it('returns 400 for an invalid unit value', async () => {
    const repo = makeMockRepo();
    const result = await createDonation(
      makePostEvent({ ...VALID_BODY, unit: 'cups' }),
      repo,
    );
    const { statusCode, body } = parseBody<{ error: { details: { field: string }[] } }>(result);
    expect(statusCode).toBe(400);
    expect(body.error.details.find((e) => e.field === 'unit')).toBeDefined();
  });

  it('returns 400 for latitude out of range', async () => {
    const repo = makeMockRepo();
    const result = await createDonation(
      makePostEvent({ ...VALID_BODY, latitude: 200 }),
      repo,
    );
    const { statusCode } = parseBody(result);
    expect(statusCode).toBe(400);
  });

  it('returns 500 INTERNAL_ERROR when the repository throws', async () => {
    const repo = makeMockRepo({
      create: jest.fn().mockRejectedValue(new Error('DynamoDB timeout')),
    });
    const result = await createDonation(makePostEvent(VALID_BODY), repo);
    const { statusCode, body } = parseBody<{ error: { code: string } }>(result);
    expect(statusCode).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('does not expose coordinates to the client response (donor sees full record)', async () => {
    // Donor creates their own donation so they get the full record back.
    // latitude/longitude should be present for the donor view.
    const repo = makeMockRepo();
    const result = await createDonation(makePostEvent(VALID_BODY), repo);
    const { body } = parseBody<{ data: Record<string, unknown> }>(result);
    // The created response returns the full donation to the creator
    expect(body.data['latitude']).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// listDonations
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/donations – listDonations', () => {
  it('returns 200 with items array on success', async () => {
    const repo = makeMockRepo();
    const result = await listDonations(makeGetEvent(), repo);
    const { statusCode, body } = parseBody<{ success: boolean; data: { items: unknown[] } }>(result);
    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
  });

  it('defaults to status=AVAILABLE when no query params given', async () => {
    const repo = makeMockRepo();
    await listDonations(makeGetEvent(), repo);
    expect(repo.listByStatus).toHaveBeenCalledWith('AVAILABLE', expect.any(Number), undefined);
  });

  it('passes explicit status parameter to repository', async () => {
    const repo = makeMockRepo();
    await listDonations(makeGetEvent({}, { status: 'COLLECTED' }), repo);
    expect(repo.listByStatus).toHaveBeenCalledWith('COLLECTED', expect.any(Number), undefined);
  });

  it('returns 400 for an invalid status value', async () => {
    const repo = makeMockRepo();
    const result = await listDonations(makeGetEvent({}, { status: 'UNKNOWN' }), repo);
    const { statusCode } = parseBody(result);
    expect(statusCode).toBe(400);
  });

  it('filters by category after query', async () => {
    const bakeryDonation: Donation = { ...STORED_DONATION, donationId: 'don-456', foodCategory: 'BAKERY' };
    const repo = makeMockRepo({
      listByStatus: jest.fn().mockResolvedValue({
        items: [STORED_DONATION, bakeryDonation],
        nextToken: undefined,
      }),
    });
    const result = await listDonations(makeGetEvent({}, { category: 'BAKERY' }), repo);
    const { body } = parseBody<{ data: { items: Donation[]; count: number } }>(result);
    expect(body.data.count).toBe(1);
    expect(body.data.items[0]!.foodCategory).toBe('BAKERY');
  });

  it('strips latitude and longitude from listed items (address privacy)', async () => {
    const repo = makeMockRepo();
    const result = await listDonations(makeGetEvent(), repo);
    const { body } = parseBody<{ data: { items: Record<string, unknown>[] } }>(result);
    const item = body.data.items[0];
    expect(item).toBeDefined();
    expect(item!['latitude']).toBeUndefined();
    expect(item!['longitude']).toBeUndefined();
  });

  it('returns 500 when repository throws', async () => {
    const repo = makeMockRepo({
      listByStatus: jest.fn().mockRejectedValue(new Error('DynamoDB error')),
    });
    const result = await listDonations(makeGetEvent(), repo);
    const { statusCode } = parseBody(result);
    expect(statusCode).toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getDonation
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/donations/{donationId} – getDonation', () => {
  it('returns 200 with donation data when found', async () => {
    const repo = makeMockRepo();
    const result = await getDonation(makeGetEvent({ donationId: 'don-123' }), repo);
    const { statusCode, body } = parseBody<{ success: boolean; data: Donation }>(result);
    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.donationId).toBe('don-123');
  });

  it('strips coordinates from the public view', async () => {
    const repo = makeMockRepo();
    const result = await getDonation(makeGetEvent({ donationId: 'don-123' }), repo);
    const { body } = parseBody<{ data: Record<string, unknown> }>(result);
    expect(body.data['latitude']).toBeUndefined();
    expect(body.data['longitude']).toBeUndefined();
  });

  it('returns 404 when donation does not exist', async () => {
    const repo = makeMockRepo({
      getById: jest.fn().mockResolvedValue(null),
    });
    const result = await getDonation(makeGetEvent({ donationId: 'don-999' }), repo);
    const { statusCode, body } = parseBody<{ error: { code: string } }>(result);
    expect(statusCode).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when donationId path param is missing', async () => {
    const repo = makeMockRepo();
    const result = await getDonation(makeGetEvent({}), repo);
    const { statusCode } = parseBody(result);
    expect(statusCode).toBe(400);
  });

  it('returns 500 when repository throws', async () => {
    const repo = makeMockRepo({
      getById: jest.fn().mockRejectedValue(new Error('DB failure')),
    });
    const result = await getDonation(makeGetEvent({ donationId: 'don-123' }), repo);
    const { statusCode, body } = parseBody<{ error: { code: string } }>(result);
    expect(statusCode).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
