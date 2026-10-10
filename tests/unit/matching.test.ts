// ─────────────────────────────────────────────────────────────────────────────
// Unit tests: Matching service + Organization handlers (Phase 4)
//
// Matching service tests use only synthetic data — labelled as [SYNTHETIC].
// No AWS, no network, no environment variables required.
// ─────────────────────────────────────────────────────────────────────────────

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { Donation, UserProfile } from '../../src/types';
import type { UserRepository } from '../../src/repositories/user.repository';
import type { DonationRepository } from '../../src/repositories/donation.repository';
import {
  haversineKm,
  checkEligibility,
  scoreMatch,
  matchDonation,
  estimateKgRescued,
} from '../../src/services/matching.service';
import {
  nearbyOrganizations,
  createUser,
  getUser,
} from '../../src/handlers/organizations';

// ── [SYNTHETIC] Test data ─────────────────────────────────────────────────────
// Coordinates are approximate real-world locations used for testing only.

// Mumbai central (~19.076°N, 72.877°E)
const MUMBAI_LAT = 19.076;
const MUMBAI_LNG = 72.877;

// Andheri West (~19.136°N, 72.832°E) — approx 8 km from central Mumbai
const ANDHERI_LAT = 19.136;
const ANDHERI_LNG = 72.832;

// Pune (~18.520°N, 73.856°E) — approx 130 km from Mumbai
const PUNE_LAT = 18.520;
const PUNE_LNG = 73.856;

const FUTURE_DEADLINE = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
const PAST_DEADLINE   = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

/** [SYNTHETIC] A donation at central Mumbai */
const MOCK_DONATION: Donation = {
  donationId:        'don-001',
  donorId:           'donor-001',
  title:             'Biryani',
  description:       'Test donation',
  foodCategory:      'COOKED_MEAL',
  quantity:          50,
  unit:              'servings',
  preparedAt:        new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  storageConditions: 'REFRIGERATED',
  pickupDeadline:    FUTURE_DEADLINE,
  latitude:          MUMBAI_LAT,
  longitude:         MUMBAI_LNG,
  status:            'AVAILABLE',
  createdAt:         new Date().toISOString(),
  updatedAt:         new Date().toISOString(),
};

/** [SYNTHETIC] Nearby receiver in Andheri (~8 km), 20 km radius, capacity 100 */
const NEARBY_RECEIVER: UserProfile = {
  userId:              'recv-001',
  displayName:         'Andheri Shelter',
  role:                'RECEIVER',
  verificationStatus:  'VERIFIED',
  latitude:            ANDHERI_LAT,
  longitude:           ANDHERI_LNG,
  serviceRadiusKm:     20,
  collectionCapacity:  100,
  createdAt:           new Date().toISOString(),
  updatedAt:           new Date().toISOString(),
};

/** [SYNTHETIC] Far receiver in Pune (~130 km) — outside any reasonable radius */
const DISTANT_RECEIVER: UserProfile = {
  userId:             'recv-002',
  displayName:        'Pune NGO',
  role:               'RECEIVER',
  verificationStatus: 'VERIFIED',
  latitude:           PUNE_LAT,
  longitude:          PUNE_LNG,
  serviceRadiusKm:    10,
  collectionCapacity: 200,
  createdAt:          new Date().toISOString(),
  updatedAt:          new Date().toISOString(),
};

/** [SYNTHETIC] Receiver without coordinates */
const NO_COORDS_RECEIVER: UserProfile = {
  userId:             'recv-003',
  displayName:        'Unknown Location NGO',
  role:               'RECEIVER',
  verificationStatus: 'VERIFIED',
  serviceRadiusKm:    30,
  createdAt:          new Date().toISOString(),
  updatedAt:          new Date().toISOString(),
};

// ── Mock factories ────────────────────────────────────────────────────────────

function makeUserRepo(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    create:               jest.fn().mockResolvedValue(undefined),
    getById:              jest.fn().mockResolvedValue(NEARBY_RECEIVER),
    listByRole:           jest.fn().mockResolvedValue([NEARBY_RECEIVER, DISTANT_RECEIVER]),
    updateVerification:   jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeDonationRepo(overrides: Partial<DonationRepository> = {}): DonationRepository {
  return {
    create:       jest.fn().mockResolvedValue(undefined),
    getById:      jest.fn().mockResolvedValue(MOCK_DONATION),
    listByStatus: jest.fn().mockResolvedValue({ items: [], nextToken: undefined }),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function getEvent(queryParams: Record<string, string> = {}, pathParams: Record<string, string> = {}): APIGatewayProxyEventV2 {
  return { queryStringParameters: queryParams, pathParameters: pathParams } as unknown as APIGatewayProxyEventV2;
}

function postEvent(body: unknown): APIGatewayProxyEventV2 {
  return { body: JSON.stringify(body) } as unknown as APIGatewayProxyEventV2;
}

function parse<T = unknown>(result: unknown): { statusCode: number; body: T } {
  const r = result as { statusCode: number; body: string };
  return { statusCode: r.statusCode, body: JSON.parse(r.body) as T };
}

// ═════════════════════════════════════════════════════════════════════════════
// haversineKm — pure function tests
// ═════════════════════════════════════════════════════════════════════════════

describe('haversineKm [SYNTHETIC coordinates]', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineKm(MUMBAI_LAT, MUMBAI_LNG, MUMBAI_LAT, MUMBAI_LNG)).toBe(0);
  });

  it('calculates approx 8 km between Mumbai and Andheri [SYNTHETIC]', () => {
    const d = haversineKm(MUMBAI_LAT, MUMBAI_LNG, ANDHERI_LAT, ANDHERI_LNG);
    // Synthetic: real straight-line distance is ~7–9 km
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(12);
  });

  it('calculates approx 130 km between Mumbai and Pune [SYNTHETIC]', () => {
    const d = haversineKm(MUMBAI_LAT, MUMBAI_LNG, PUNE_LAT, PUNE_LNG);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(160);
  });

  it('is symmetric (A to B === B to A)', () => {
    const ab = haversineKm(MUMBAI_LAT, MUMBAI_LNG, ANDHERI_LAT, ANDHERI_LNG);
    const ba = haversineKm(ANDHERI_LAT, ANDHERI_LNG, MUMBAI_LAT, MUMBAI_LNG);
    expect(Math.abs(ab - ba)).toBeLessThan(0.001);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// checkEligibility
// ═════════════════════════════════════════════════════════════════════════════

describe('checkEligibility [SYNTHETIC data]', () => {
  it('returns eligible=true for a valid nearby receiver', () => {
    const result = checkEligibility(MOCK_DONATION, NEARBY_RECEIVER);
    expect(result.eligible).toBe(true);
    expect(result.distanceKm).toBeDefined();
  });

  it('returns ineligible when donation is RESERVED', () => {
    const result = checkEligibility({ ...MOCK_DONATION, status: 'RESERVED' }, NEARBY_RECEIVER);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('RESERVED');
  });

  it('returns ineligible when pickup deadline has passed', () => {
    const result = checkEligibility({ ...MOCK_DONATION, pickupDeadline: PAST_DEADLINE }, NEARBY_RECEIVER);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('deadline');
  });

  it('returns ineligible when receiver is outside their service radius [SYNTHETIC]', () => {
    const result = checkEligibility(MOCK_DONATION, DISTANT_RECEIVER);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('radius');
  });

  it('returns ineligible when receiver has no coordinates', () => {
    const result = checkEligibility(MOCK_DONATION, NO_COORDS_RECEIVER);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('coordinates');
  });

  it('returns ineligible when donation has no coordinates', () => {
    const noCoordDonation = { ...MOCK_DONATION, latitude: NaN, longitude: NaN };
    const result = checkEligibility(noCoordDonation, NEARBY_RECEIVER);
    expect(result.eligible).toBe(false);
  });

  it('returns ineligible when receiver capacity is below donation quantity', () => {
    const smallCapacity = { ...NEARBY_RECEIVER, collectionCapacity: 10 };
    const result = checkEligibility(MOCK_DONATION, smallCapacity); // donation qty = 50
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('capacity');
  });

  it('returns eligible when receiver has no capacity set (capacity not enforced)', () => {
    const { collectionCapacity: _, ...noCapacity } = NEARBY_RECEIVER;
    const result = checkEligibility(MOCK_DONATION, noCapacity as UserProfile);
    expect(result.eligible).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// scoreMatch
// ═════════════════════════════════════════════════════════════════════════════

describe('scoreMatch [SYNTHETIC data]', () => {
  it('returns scores in the range [0, 1]', () => {
    const { distanceKm } = checkEligibility(MOCK_DONATION, NEARBY_RECEIVER);
    const score = scoreMatch(MOCK_DONATION, NEARBY_RECEIVER, distanceKm!);
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.totalScore).toBeLessThanOrEqual(1);
    expect(score.urgencyScore).toBeGreaterThanOrEqual(0);
    expect(score.distanceScore).toBeGreaterThanOrEqual(0);
    expect(score.capacityScore).toBeGreaterThanOrEqual(0);
  });

  it('closer receiver scores higher on distanceScore', () => {
    // Two receivers: one 2 km away, one 18 km away, same radius
    const close = { ...NEARBY_RECEIVER, latitude: MUMBAI_LAT + 0.018 }; // ~2 km
    const far   = { ...NEARBY_RECEIVER, latitude: MUMBAI_LAT + 0.16  }; // ~18 km
    const dClose = haversineKm(MOCK_DONATION.latitude, MOCK_DONATION.longitude, close.latitude!, close.longitude!);
    const dFar   = haversineKm(MOCK_DONATION.latitude, MOCK_DONATION.longitude, far.latitude!, far.longitude!);
    const sClose = scoreMatch(MOCK_DONATION, close, dClose);
    const sFar   = scoreMatch(MOCK_DONATION, far, dFar);
    expect(sClose.distanceScore).toBeGreaterThan(sFar.distanceScore);
  });

  it('more urgent donation (shorter deadline) scores higher on urgencyScore', () => {
    const urgent = { ...MOCK_DONATION, pickupDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString() };
    const relaxed = { ...MOCK_DONATION, pickupDeadline: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString() };
    const d = checkEligibility(MOCK_DONATION, NEARBY_RECEIVER).distanceKm!;
    const urgentScore  = scoreMatch(urgent, NEARBY_RECEIVER, d);
    const relaxedScore = scoreMatch(relaxed, NEARBY_RECEIVER, d);
    expect(urgentScore.urgencyScore).toBeGreaterThan(relaxedScore.urgencyScore);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// matchDonation
// ═════════════════════════════════════════════════════════════════════════════

describe('matchDonation [SYNTHETIC data]', () => {
  it('returns eligible and ineligible lists', () => {
    const result = matchDonation(MOCK_DONATION, [NEARBY_RECEIVER, DISTANT_RECEIVER, NO_COORDS_RECEIVER]);
    expect(result.eligible.length).toBeGreaterThanOrEqual(1);
    expect(result.ineligible.length).toBeGreaterThanOrEqual(1);
  });

  it('eligible list is sorted by totalScore descending', () => {
    const result = matchDonation(MOCK_DONATION, [NEARBY_RECEIVER, DISTANT_RECEIVER]);
    for (let i = 1; i < result.eligible.length; i++) {
      expect(result.eligible[i - 1]!.score.totalScore)
        .toBeGreaterThanOrEqual(result.eligible[i]!.score.totalScore);
    }
  });

  it('excludes DONOR role users from matching', () => {
    const donor: UserProfile = { ...NEARBY_RECEIVER, role: 'DONOR', userId: 'donor-x' };
    const result = matchDonation(MOCK_DONATION, [donor]);
    expect(result.eligible.length).toBe(0);
  });

  it('every eligible candidate has a rankingReason string', () => {
    const result = matchDonation(MOCK_DONATION, [NEARBY_RECEIVER]);
    expect(result.eligible[0]?.rankingReason).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// estimateKgRescued
// ═════════════════════════════════════════════════════════════════════════════

describe('estimateKgRescued', () => {
  it('returns quantity directly for kg unit', () => {
    expect(estimateKgRescued(10, 'kg')).toBe(10);
  });

  it('converts servings to kg at 0.35 kg/serving', () => {
    expect(estimateKgRescued(100, 'servings')).toBe(35);
  });

  it('returns null for unknown units', () => {
    expect(estimateKgRescued(5, 'buckets')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/organizations/nearby — proximity mode
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/organizations/nearby – nearbyOrganizations', () => {
  it('returns 200 with organizations in proximity mode', async () => {
    const result = await nearbyOrganizations(
      getEvent({ lat: String(MUMBAI_LAT), lng: String(MUMBAI_LNG) }),
      { userRepo: makeUserRepo(), donationRepo: makeDonationRepo() },
    );
    const { statusCode, body } = parse<{ data: { mode: string; organizations: unknown[] } }>(result);
    expect(statusCode).toBe(200);
    expect(body.data.mode).toBe('proximity');
  });

  it('returns 400 when lat/lng are missing', async () => {
    const result = await nearbyOrganizations(getEvent({}), { userRepo: makeUserRepo(), donationRepo: makeDonationRepo() });
    expect(parse(result).statusCode).toBe(400);
  });

  it('returns 400 for invalid lat value', async () => {
    const result = await nearbyOrganizations(
      getEvent({ lat: '999', lng: String(MUMBAI_LNG) }),
      { userRepo: makeUserRepo(), donationRepo: makeDonationRepo() },
    );
    expect(parse(result).statusCode).toBe(400);
  });

  it('filters out receivers beyond the search radius', async () => {
    // Default 50 km radius — NEARBY_RECEIVER (~8 km) in, DISTANT_RECEIVER (~130 km) out
    const result = await nearbyOrganizations(
      getEvent({ lat: String(MUMBAI_LAT), lng: String(MUMBAI_LNG), radiusKm: '50' }),
      { userRepo: makeUserRepo(), donationRepo: makeDonationRepo() },
    );
    const { body } = parse<{ data: { organizations: { userId: string }[] } }>(result);
    const ids = body.data.organizations.map((o) => o.userId);
    expect(ids).toContain('recv-001');      // Andheri ~8 km ✓
    expect(ids).not.toContain('recv-002'); // Pune ~130 km ✗
  });

  it('strips exact coordinates from proximity results (privacy)', async () => {
    const result = await nearbyOrganizations(
      getEvent({ lat: String(MUMBAI_LAT), lng: String(MUMBAI_LNG) }),
      { userRepo: makeUserRepo(), donationRepo: makeDonationRepo() },
    );
    const { body } = parse<{ data: { organizations: Record<string, unknown>[] } }>(result);
    const org = body.data.organizations[0];
    if (org) {
      expect(org['latitude']).toBeUndefined();
      expect(org['longitude']).toBeUndefined();
    }
  });

  it('returns donation-match mode when donationId is provided', async () => {
    const result = await nearbyOrganizations(
      getEvent({ lat: String(MUMBAI_LAT), lng: String(MUMBAI_LNG), donationId: 'don-001' }),
      { userRepo: makeUserRepo(), donationRepo: makeDonationRepo() },
    );
    const { statusCode, body } = parse<{ data: { mode: string } }>(result);
    expect(statusCode).toBe(200);
    expect(body.data.mode).toBe('donation-match');
  });

  it('returns 404 when donationId is provided but donation not found', async () => {
    const result = await nearbyOrganizations(
      getEvent({ lat: String(MUMBAI_LAT), lng: String(MUMBAI_LNG), donationId: 'don-999' }),
      { userRepo: makeUserRepo(), donationRepo: makeDonationRepo({ getById: jest.fn().mockResolvedValue(null) }) },
    );
    expect(parse(result).statusCode).toBe(404);
  });

  it('returns 500 when user repo throws', async () => {
    const result = await nearbyOrganizations(
      getEvent({ lat: String(MUMBAI_LAT), lng: String(MUMBAI_LNG) }),
      { userRepo: makeUserRepo({ listByRole: jest.fn().mockRejectedValue(new Error('DB error')) }), donationRepo: makeDonationRepo() },
    );
    expect(parse(result).statusCode).toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/users — createUser
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/users – createUser', () => {
  const VALID_USER = { displayName: 'City Shelter', role: 'RECEIVER', latitude: ANDHERI_LAT, longitude: ANDHERI_LNG, serviceRadiusKm: 20 };

  it('returns 201 with a server-generated userId', async () => {
    const result = await createUser(postEvent(VALID_USER), { userRepo: makeUserRepo(), donationRepo: makeDonationRepo() });
    const { statusCode, body } = parse<{ data: UserProfile }>(result);
    expect(statusCode).toBe(201);
    expect(typeof body.data.userId).toBe('string');
  });

  it('sets verificationStatus to PENDING on creation', async () => {
    const result = await createUser(postEvent(VALID_USER), { userRepo: makeUserRepo(), donationRepo: makeDonationRepo() });
    const { body } = parse<{ data: UserProfile }>(result);
    expect(body.data.verificationStatus).toBe('PENDING');
  });

  it('returns 400 for missing displayName', async () => {
    const result = await createUser(postEvent({ role: 'RECEIVER' }), { userRepo: makeUserRepo(), donationRepo: makeDonationRepo() });
    expect(parse(result).statusCode).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    const result = await createUser(postEvent({ ...VALID_USER, role: 'ADMIN' }), { userRepo: makeUserRepo(), donationRepo: makeDonationRepo() });
    expect(parse(result).statusCode).toBe(400);
  });

  it('returns 500 when repo throws', async () => {
    const result = await createUser(
      postEvent(VALID_USER),
      { userRepo: makeUserRepo({ create: jest.fn().mockRejectedValue(new Error('DB error')) }), donationRepo: makeDonationRepo() },
    );
    expect(parse(result).statusCode).toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/users/{userId}
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/users/{userId} – getUser', () => {
  it('returns 200 with user data', async () => {
    const result = await getUser(getEvent({}, { userId: 'recv-001' }), { userRepo: makeUserRepo(), donationRepo: makeDonationRepo() });
    const { statusCode, body } = parse<{ data: UserProfile }>(result);
    expect(statusCode).toBe(200);
    expect(body.data.userId).toBe('recv-001');
  });

  it('strips exact coordinates from public response', async () => {
    const result = await getUser(getEvent({}, { userId: 'recv-001' }), { userRepo: makeUserRepo(), donationRepo: makeDonationRepo() });
    const { body } = parse<{ data: Record<string, unknown> }>(result);
    expect(body.data['latitude']).toBeUndefined();
    expect(body.data['longitude']).toBeUndefined();
  });

  it('returns 404 when user not found', async () => {
    const result = await getUser(
      getEvent({}, { userId: 'nobody' }),
      { userRepo: makeUserRepo({ getById: jest.fn().mockResolvedValue(null) }), donationRepo: makeDonationRepo() },
    );
    expect(parse(result).statusCode).toBe(404);
  });

  it('returns 400 when userId path param is missing', async () => {
    const result = await getUser(getEvent({}), { userRepo: makeUserRepo(), donationRepo: makeDonationRepo() });
    expect(parse(result).statusCode).toBe(400);
  });
});
