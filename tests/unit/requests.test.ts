// ─────────────────────────────────────────────────────────────────────────────
// Unit tests: Request & Collection workflow (Phase 3)
//
// All DynamoDB is mocked.  Tests cover:
//   createRequest   – success, donation not available, duplicate request,
//                     expired deadline, self-request forbidden
//   acceptRequest   – success, wrong caller (403), already accepted (409),
//                     concurrent conflict (409), not found (404)
//   declineRequest  – success, wrong caller (403), not PENDING (409)
//   updateStatus    – COLLECTED success, FAILED re-opens donation,
//                     wrong caller (403), not ACCEPTED (409)
//   state machine   – isRequestTransitionAllowed guard
// ─────────────────────────────────────────────────────────────────────────────

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { Donation, DonationRequest } from '../../src/types';
import type { DonationRepository } from '../../src/repositories/donation.repository';
import type { RequestRepository } from '../../src/repositories/request.repository';
import { ConflictError } from '../../src/repositories/request.repository';
import {
  createRequest,
  acceptRequest,
  declineRequest,
  updateRequestStatus,
} from '../../src/handlers/requests';
import { isRequestTransitionAllowed } from '../../src/validation/request.validation';

// ── Test data ─────────────────────────────────────────────────────────────────

const FUTURE_DEADLINE = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
const PAST_DEADLINE   = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

const MOCK_DONATION: Donation = {
  donationId: 'don-001',
  donorId:    'donor-001',
  title:      'Wedding biryani',
  description: 'Fresh biryani',
  foodCategory: 'COOKED_MEAL',
  quantity:   50,
  unit:       'servings',
  preparedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  storageConditions: 'REFRIGERATED',
  pickupDeadline: FUTURE_DEADLINE,
  latitude:   19.076,
  longitude:  72.877,
  status:     'AVAILABLE',
  createdAt:  new Date().toISOString(),
  updatedAt:  new Date().toISOString(),
};

const MOCK_REQUEST: DonationRequest = {
  requestId:         'req-001',
  donationId:        'don-001',
  donorId:           'donor-001',
  receiverId:        'receiver-001',
  status:            'PENDING',
  requestedQuantity: 20,
  createdAt:         new Date().toISOString(),
  updatedAt:         new Date().toISOString(),
};

const ACCEPTED_REQUEST: DonationRequest = { ...MOCK_REQUEST, status: 'ACCEPTED' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDonationRepo(overrides: Partial<DonationRepository> = {}): DonationRepository {
  return {
    create:       jest.fn().mockResolvedValue(undefined),
    getById:      jest.fn().mockResolvedValue(MOCK_DONATION),
    listByStatus: jest.fn().mockResolvedValue({ items: [], nextToken: undefined }),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeRequestRepo(overrides: Partial<RequestRepository> = {}): RequestRepository {
  return {
    create:                      jest.fn().mockResolvedValue(undefined),
    getById:                     jest.fn().mockResolvedValue(MOCK_REQUEST),
    listByDonation:              jest.fn().mockResolvedValue([]),
    listByReceiver:              jest.fn().mockResolvedValue([]),
    acceptRequest:               jest.fn().mockResolvedValue(ACCEPTED_REQUEST),
    declineRequest:              jest.fn().mockResolvedValue({ ...MOCK_REQUEST, status: 'DECLINED' }),
    updateCollectionStatus:      jest.fn().mockResolvedValue({ ...ACCEPTED_REQUEST, status: 'COLLECTED' }),
    declineOtherPendingRequests: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function postEvent(
  pathParams: Record<string, string>,
  body: unknown,
): APIGatewayProxyEventV2 {
  return {
    pathParameters: pathParams,
    body: JSON.stringify(body),
    requestContext: { http: { method: 'POST' } },
  } as unknown as APIGatewayProxyEventV2;
}

function parse<T = unknown>(result: unknown): { statusCode: number; body: T } {
  const r = result as { statusCode: number; body: string };
  return { statusCode: r.statusCode, body: JSON.parse(r.body) as T };
}

// ═════════════════════════════════════════════════════════════════════════════
// State machine guard
// ═════════════════════════════════════════════════════════════════════════════

describe('isRequestTransitionAllowed', () => {
  it('allows PENDING → ACCEPTED', () => expect(isRequestTransitionAllowed('PENDING', 'ACCEPTED')).toBe(true));
  it('allows PENDING → DECLINED', () => expect(isRequestTransitionAllowed('PENDING', 'DECLINED')).toBe(true));
  it('allows PENDING → CANCELLED', () => expect(isRequestTransitionAllowed('PENDING', 'CANCELLED')).toBe(true));
  it('allows ACCEPTED → COLLECTED', () => expect(isRequestTransitionAllowed('ACCEPTED', 'COLLECTED')).toBe(true));
  it('allows ACCEPTED → FAILED', () => expect(isRequestTransitionAllowed('ACCEPTED', 'FAILED')).toBe(true));
  it('rejects COLLECTED → ACCEPTED', () => expect(isRequestTransitionAllowed('COLLECTED', 'ACCEPTED')).toBe(false));
  it('rejects DECLINED → ACCEPTED', () => expect(isRequestTransitionAllowed('DECLINED', 'ACCEPTED')).toBe(false));
  it('rejects FAILED → COLLECTED', () => expect(isRequestTransitionAllowed('FAILED', 'COLLECTED')).toBe(false));
  it('rejects PENDING → COLLECTED (skipping ACCEPTED)', () => expect(isRequestTransitionAllowed('PENDING', 'COLLECTED')).toBe(false));
});

// ═════════════════════════════════════════════════════════════════════════════
// createRequest
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/donations/{donationId}/requests – createRequest', () => {
  const VALID_BODY = { receiverId: 'receiver-001', requestedQuantity: 20 };

  it('returns 201 with a server-generated requestId', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo();
    const result = await createRequest(postEvent({ donationId: 'don-001' }, VALID_BODY), { donationRepo: dr, requestRepo: rr });
    const { statusCode, body } = parse<{ success: boolean; data: DonationRequest }>(result);
    expect(statusCode).toBe(201);
    expect(body.success).toBe(true);
    expect(typeof body.data.requestId).toBe('string');
    expect(body.data.status).toBe('PENDING');
  });

  it('copies donorId from the donation (not from request body)', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo();
    const result = await createRequest(postEvent({ donationId: 'don-001' }, VALID_BODY), { donationRepo: dr, requestRepo: rr });
    const { body } = parse<{ data: DonationRequest }>(result);
    expect(body.data.donorId).toBe(MOCK_DONATION.donorId);
  });

  it('returns 400 when donationId path param is missing', async () => {
    const result = await createRequest(postEvent({}, VALID_BODY));
    expect(parse(result).statusCode).toBe(400);
  });

  it('returns 400 for missing required fields', async () => {
    const result = await createRequest(postEvent({ donationId: 'don-001' }, {}));
    const { statusCode, body } = parse<{ error: { code: string } }>(result);
    expect(statusCode).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when donation does not exist', async () => {
    const dr = makeDonationRepo({ getById: jest.fn().mockResolvedValue(null) });
    const rr = makeRequestRepo();
    const result = await createRequest(postEvent({ donationId: 'don-999' }, VALID_BODY), { donationRepo: dr, requestRepo: rr });
    expect(parse(result).statusCode).toBe(404);
  });

  it('returns 409 when donation is RESERVED (not AVAILABLE)', async () => {
    const dr = makeDonationRepo({ getById: jest.fn().mockResolvedValue({ ...MOCK_DONATION, status: 'RESERVED' }) });
    const rr = makeRequestRepo();
    const result = await createRequest(postEvent({ donationId: 'don-001' }, VALID_BODY), { donationRepo: dr, requestRepo: rr });
    const { statusCode, body } = parse<{ error: { code: string } }>(result);
    expect(statusCode).toBe(409);
    expect(body.error.code).toBe('DONATION_NOT_AVAILABLE');
  });

  it('returns 409 when pickup deadline has already passed', async () => {
    const expiredDonation = { ...MOCK_DONATION, pickupDeadline: PAST_DEADLINE };
    const dr = makeDonationRepo({ getById: jest.fn().mockResolvedValue(expiredDonation) });
    const rr = makeRequestRepo();
    const result = await createRequest(postEvent({ donationId: 'don-001' }, VALID_BODY), { donationRepo: dr, requestRepo: rr });
    const { statusCode, body } = parse<{ error: { code: string } }>(result);
    expect(statusCode).toBe(409);
    expect(body.error.code).toBe('DONATION_EXPIRED');
  });

  it('returns 403 when receiver is the same as donor (self-request)', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo();
    // Receiver uses the donor's ID
    const result = await createRequest(
      postEvent({ donationId: 'don-001' }, { ...VALID_BODY, receiverId: 'donor-001' }),
      { donationRepo: dr, requestRepo: rr },
    );
    expect(parse(result).statusCode).toBe(403);
  });

  it('returns 409 when receiver already has a PENDING request for same donation', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({
      listByDonation: jest.fn().mockResolvedValue([MOCK_REQUEST]), // existing PENDING
    });
    const result = await createRequest(postEvent({ donationId: 'don-001' }, VALID_BODY), { donationRepo: dr, requestRepo: rr });
    const { statusCode, body } = parse<{ error: { code: string } }>(result);
    expect(statusCode).toBe(409);
    expect(body.error.code).toBe('DUPLICATE_REQUEST');
  });

  it('returns 500 when donation repo throws', async () => {
    const dr = makeDonationRepo({ getById: jest.fn().mockRejectedValue(new Error('DB error')) });
    const rr = makeRequestRepo();
    const result = await createRequest(postEvent({ donationId: 'don-001' }, VALID_BODY), { donationRepo: dr, requestRepo: rr });
    expect(parse(result).statusCode).toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// acceptRequest
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/requests/{requestId}/accept – acceptRequest', () => {
  const BODY = { donorId: 'donor-001' };

  it('returns 200 with ACCEPTED request on success', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo();
    const result = await acceptRequest(postEvent({ requestId: 'req-001' }, BODY), { donationRepo: dr, requestRepo: rr });
    const { statusCode, body } = parse<{ data: DonationRequest }>(result);
    expect(statusCode).toBe(200);
    expect(body.data.status).toBe('ACCEPTED');
  });

  it('calls acceptRequest on the repo', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo();
    await acceptRequest(postEvent({ requestId: 'req-001' }, BODY), { donationRepo: dr, requestRepo: rr });
    expect(rr.acceptRequest).toHaveBeenCalledWith('req-001', 'don-001');
  });

  it('triggers declineOtherPendingRequests after accept', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo();
    await acceptRequest(postEvent({ requestId: 'req-001' }, BODY), { donationRepo: dr, requestRepo: rr });
    // give microtasks time to settle (fire-and-forget)
    await new Promise((r) => setTimeout(r, 10));
    expect(rr.declineOtherPendingRequests).toHaveBeenCalledWith('don-001', 'req-001');
  });

  it('returns 400 when requestId path param is missing', async () => {
    const result = await acceptRequest(postEvent({}, BODY));
    expect(parse(result).statusCode).toBe(400);
  });

  it('returns 400 when donorId is missing from body', async () => {
    const result = await acceptRequest(postEvent({ requestId: 'req-001' }, {}));
    expect(parse(result).statusCode).toBe(400);
  });

  it('returns 404 when request does not exist', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({ getById: jest.fn().mockResolvedValue(null) });
    const result = await acceptRequest(postEvent({ requestId: 'req-999' }, BODY), { donationRepo: dr, requestRepo: rr });
    expect(parse(result).statusCode).toBe(404);
  });

  it('returns 403 when caller is not the donor', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo();
    const result = await acceptRequest(
      postEvent({ requestId: 'req-001' }, { donorId: 'impostor-999' }),
      { donationRepo: dr, requestRepo: rr },
    );
    expect(parse(result).statusCode).toBe(403);
  });

  it('returns 409 when request is already ACCEPTED', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({ getById: jest.fn().mockResolvedValue(ACCEPTED_REQUEST) });
    const result = await acceptRequest(postEvent({ requestId: 'req-001' }, BODY), { donationRepo: dr, requestRepo: rr });
    const { statusCode, body } = parse<{ error: { code: string } }>(result);
    expect(statusCode).toBe(409);
    expect(body.error.code).toBe('INVALID_TRANSITION');
  });

  it('returns 409 on ConflictError from TransactWrite (concurrent race)', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({
      acceptRequest: jest.fn().mockRejectedValue(
        new ConflictError('Donation already reserved'),
      ),
    });
    const result = await acceptRequest(postEvent({ requestId: 'req-001' }, BODY), { donationRepo: dr, requestRepo: rr });
    const { statusCode, body } = parse<{ error: { code: string } }>(result);
    expect(statusCode).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
  });

  it('returns 500 when repo throws unexpected error', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({
      acceptRequest: jest.fn().mockRejectedValue(new Error('Network timeout')),
    });
    const result = await acceptRequest(postEvent({ requestId: 'req-001' }, BODY), { donationRepo: dr, requestRepo: rr });
    expect(parse(result).statusCode).toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// declineRequest
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/requests/{requestId}/decline – declineRequest', () => {
  const BODY = { donorId: 'donor-001' };

  it('returns 200 with DECLINED request', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo();
    const result = await declineRequest(postEvent({ requestId: 'req-001' }, BODY), { donationRepo: dr, requestRepo: rr });
    const { statusCode, body } = parse<{ data: DonationRequest }>(result);
    expect(statusCode).toBe(200);
    expect(body.data.status).toBe('DECLINED');
  });

  it('returns 403 when caller is not the donor', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo();
    const result = await declineRequest(
      postEvent({ requestId: 'req-001' }, { donorId: 'hacker' }),
      { donationRepo: dr, requestRepo: rr },
    );
    expect(parse(result).statusCode).toBe(403);
  });

  it('returns 409 when request is already DECLINED', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({
      getById: jest.fn().mockResolvedValue({ ...MOCK_REQUEST, status: 'DECLINED' }),
    });
    const result = await declineRequest(postEvent({ requestId: 'req-001' }, BODY), { donationRepo: dr, requestRepo: rr });
    expect(parse(result).statusCode).toBe(409);
  });

  it('returns 409 when request is ACCEPTED (cannot decline)', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({
      getById: jest.fn().mockResolvedValue(ACCEPTED_REQUEST),
    });
    const result = await declineRequest(postEvent({ requestId: 'req-001' }, BODY), { donationRepo: dr, requestRepo: rr });
    expect(parse(result).statusCode).toBe(409);
  });

  it('returns 404 when request does not exist', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({ getById: jest.fn().mockResolvedValue(null) });
    const result = await declineRequest(postEvent({ requestId: 'req-999' }, BODY), { donationRepo: dr, requestRepo: rr });
    expect(parse(result).statusCode).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// updateRequestStatus (COLLECTED / FAILED)
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/requests/{requestId}/status – updateRequestStatus', () => {
  const COLLECTED_BODY = { receiverId: 'receiver-001', status: 'COLLECTED' };
  const FAILED_BODY    = { receiverId: 'receiver-001', status: 'FAILED' };

  it('returns 200 with COLLECTED status on success', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({ getById: jest.fn().mockResolvedValue(ACCEPTED_REQUEST) });
    const result = await updateRequestStatus(postEvent({ requestId: 'req-001' }, COLLECTED_BODY), { donationRepo: dr, requestRepo: rr });
    const { statusCode, body } = parse<{ data: DonationRequest }>(result);
    expect(statusCode).toBe(200);
    expect(body.data.status).toBe('COLLECTED');
  });

  it('calls updateCollectionStatus with FAILED on failure report', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({
      getById: jest.fn().mockResolvedValue(ACCEPTED_REQUEST),
      updateCollectionStatus: jest.fn().mockResolvedValue({ ...ACCEPTED_REQUEST, status: 'FAILED' }),
    });
    const result = await updateRequestStatus(postEvent({ requestId: 'req-001' }, FAILED_BODY), { donationRepo: dr, requestRepo: rr });
    const { statusCode } = parse(result);
    expect(statusCode).toBe(200);
    expect(rr.updateCollectionStatus).toHaveBeenCalledWith('req-001', 'don-001', 'FAILED');
  });

  it('returns 403 when caller is not the receiver', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({ getById: jest.fn().mockResolvedValue(ACCEPTED_REQUEST) });
    const result = await updateRequestStatus(
      postEvent({ requestId: 'req-001' }, { ...COLLECTED_BODY, receiverId: 'impostor' }),
      { donationRepo: dr, requestRepo: rr },
    );
    expect(parse(result).statusCode).toBe(403);
  });

  it('returns 409 when request is PENDING (not ACCEPTED)', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo(); // MOCK_REQUEST is PENDING
    const result = await updateRequestStatus(postEvent({ requestId: 'req-001' }, COLLECTED_BODY), { donationRepo: dr, requestRepo: rr });
    expect(parse(result).statusCode).toBe(409);
  });

  it('returns 409 on ConflictError from TransactWrite', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({
      getById: jest.fn().mockResolvedValue(ACCEPTED_REQUEST),
      updateCollectionStatus: jest.fn().mockRejectedValue(new ConflictError('State mismatch')),
    });
    const result = await updateRequestStatus(postEvent({ requestId: 'req-001' }, COLLECTED_BODY), { donationRepo: dr, requestRepo: rr });
    const { statusCode, body } = parse<{ error: { code: string } }>(result);
    expect(statusCode).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
  });

  it('returns 400 for an invalid status value', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({ getById: jest.fn().mockResolvedValue(ACCEPTED_REQUEST) });
    const result = await updateRequestStatus(
      postEvent({ requestId: 'req-001' }, { receiverId: 'receiver-001', status: 'PENDING' }),
      { donationRepo: dr, requestRepo: rr },
    );
    const { statusCode, body } = parse<{ error: { code: string } }>(result);
    expect(statusCode).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when receiverId is missing from body', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({ getById: jest.fn().mockResolvedValue(ACCEPTED_REQUEST) });
    const result = await updateRequestStatus(
      postEvent({ requestId: 'req-001' }, { status: 'COLLECTED' }),
      { donationRepo: dr, requestRepo: rr },
    );
    expect(parse(result).statusCode).toBe(400);
  });

  it('returns 404 when request does not exist', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({ getById: jest.fn().mockResolvedValue(null) });
    const result = await updateRequestStatus(postEvent({ requestId: 'req-999' }, COLLECTED_BODY), { donationRepo: dr, requestRepo: rr });
    expect(parse(result).statusCode).toBe(404);
  });

  it('returns 500 on unexpected repository error', async () => {
    const dr = makeDonationRepo();
    const rr = makeRequestRepo({
      getById: jest.fn().mockResolvedValue(ACCEPTED_REQUEST),
      updateCollectionStatus: jest.fn().mockRejectedValue(new Error('Unhandled')),
    });
    const result = await updateRequestStatus(postEvent({ requestId: 'req-001' }, COLLECTED_BODY), { donationRepo: dr, requestRepo: rr });
    expect(parse(result).statusCode).toBe(500);
  });
});
