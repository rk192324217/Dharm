// ─────────────────────────────────────────────────────────────────────────────
// Organization & User Handlers
//
// Routes:
//   GET  /api/organizations/nearby          → nearbyOrganizations
//   POST /api/users                         → createUser
//   GET  /api/users/{userId}                → getUser
//
// nearbyOrganizations:
//   Loads all RECEIVER profiles from DynamoDB, applies eligibility filtering
//   (Haversine distance) and returns ranked candidates.
//   Query params: lat, lng, donationId (optional – enables full matching),
//                 radiusKm (optional override), limit
//
// createUser / getUser:
//   Lightweight profile management.  In production these would be protected
//   by Cognito and derive userId from the JWT sub claim.
// ─────────────────────────────────────────────────────────────────────────────

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import type { ApiErrorResponse, ApiSuccessResponse, UserProfile, UserRole } from '../types';
import { haversineKm, matchDonation, estimateKgRescued } from '../services/matching.service';
import type { UserRepository } from '../repositories/user.repository';
import { userRepository as defaultUserRepo } from '../repositories/user.repository';
import type { DonationRepository } from '../repositories/donation.repository';
import { donationRepository as defaultDonationRepo } from '../repositories/donation.repository';

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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

// ── Injectable deps ───────────────────────────────────────────────────────────

interface Deps {
  userRepo: UserRepository;
  donationRepo: DonationRepository;
}
const defaultDeps: Deps = { userRepo: defaultUserRepo, donationRepo: defaultDonationRepo };

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/organizations/nearby
// ─────────────────────────────────────────────────────────────────────────────

export async function nearbyOrganizations(
  event: APIGatewayProxyEventV2,
  deps: Deps = defaultDeps,
): Promise<APIGatewayProxyResultV2> {
  const q = event.queryStringParameters ?? {};

  // ── Parse coordinates ─────────────────────────────────────────────────────
  const rawLat = q['lat'];
  const rawLng = q['lng'];

  if (!rawLat || !rawLng) {
    return err(400, 'MISSING_PARAM', 'lat and lng query parameters are required.');
  }

  const lat = parseFloat(rawLat);
  const lng = parseFloat(rawLng);

  if (!isFinite(lat) || lat < -90 || lat > 90) {
    return err(400, 'INVALID_PARAM', 'lat must be a valid latitude (-90 to 90).');
  }
  if (!isFinite(lng) || lng < -180 || lng > 180) {
    return err(400, 'INVALID_PARAM', 'lng must be a valid longitude (-180 to 180).');
  }

  // ── Optional radius override (default 50 km) ──────────────────────────────
  let radiusKm = 50;
  if (q['radiusKm']) {
    const r = parseFloat(q['radiusKm']);
    if (!isFinite(r) || r <= 0 || r > 500) {
      return err(400, 'INVALID_PARAM', 'radiusKm must be a positive number up to 500.');
    }
    radiusKm = r;
  }

  // ── Limit ─────────────────────────────────────────────────────────────────
  let limit = 20;
  if (q['limit']) {
    const l = parseInt(q['limit'], 10);
    if (isNaN(l) || l < 1 || l > 100) {
      return err(400, 'INVALID_PARAM', 'limit must be between 1 and 100.');
    }
    limit = l;
  }

  // ── Load all receiver profiles ────────────────────────────────────────────
  let receivers: UserProfile[];
  try {
    receivers = await deps.userRepo.listByRole('RECEIVER');
  } catch (e) {
    console.error('nearbyOrganizations: failed to load receivers', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to load organizations.');
  }

  // ── Optional: full matching against a specific donation ───────────────────
  const donationId = q['donationId'];

  if (donationId) {
    // Full matching mode — load the donation and run eligibility + ranking
    let donation;
    try {
      donation = await deps.donationRepo.getById(donationId);
    } catch (e) {
      console.error('nearbyOrganizations: failed to load donation', e);
      return err(500, 'INTERNAL_ERROR', 'Failed to load donation.');
    }
    if (!donation) return err(404, 'NOT_FOUND', `Donation ${donationId} not found.`);

    const matchResult = matchDonation(donation, receivers);

    // Estimate kg rescued (labelled as estimate)
    const estimatedKgRescued = estimateKgRescued(donation.quantity, donation.unit);

    return ok({
      mode: 'donation-match',
      donationId,
      estimatedKgRescuedIfCollected: estimatedKgRescued !== null
        ? { value: estimatedKgRescued, unit: 'kg', note: 'Estimate only – not a measured value.' }
        : null,
      eligible: matchResult.eligible.slice(0, limit).map((c) => ({
        userId: c.receiver.userId,
        displayName: c.receiver.displayName,
        organizationName: c.receiver.organizationName,
        distanceKm: c.distanceKm,
        score: c.score,
        rankingReason: c.rankingReason,
      })),
      ineligible: matchResult.ineligible.map((c) => ({
        userId: c.receiver.userId,
        displayName: c.receiver.displayName,
        reason: c.reason,
      })),
      totalEligible: matchResult.eligible.length,
      totalIneligible: matchResult.ineligible.length,
    });
  }

  // ── Simple proximity mode — just distance filtering ───────────────────────
  const nearby = receivers
    .filter((r) => {
      if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return false;
      return haversineKm(lat, lng, r.latitude, r.longitude) <= radiusKm;
    })
    .map((r) => {
      const distanceKm = Math.round(
        haversineKm(lat, lng, r.latitude!, r.longitude!) * 10,
      ) / 10;
      return { ...r, distanceKm };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
    .map(({ latitude: _lat, longitude: _lng, ...rest }) => rest); // strip exact coords

  return ok({
    mode: 'proximity',
    searchLocation: { lat, lng },
    radiusKm,
    organizations: nearby,
    count: nearby.length,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users  – register a user profile
// ─────────────────────────────────────────────────────────────────────────────

const VALID_ROLES: UserRole[] = ['DONOR', 'RECEIVER'];

export async function createUser(
  event: APIGatewayProxyEventV2,
  deps: Deps = defaultDeps,
): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event);
  if (!body) return err(400, 'INVALID_JSON', 'Request body must be valid JSON.');

  // Validate required fields
  const errors: string[] = [];
  if (!body['displayName'] || typeof body['displayName'] !== 'string') errors.push('displayName is required.');
  if (!body['role'] || !VALID_ROLES.includes(body['role'] as UserRole)) {
    errors.push(`role must be one of: ${VALID_ROLES.join(', ')}.`);
  }

  if (errors.length > 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: errors.join(' ') } }),
    };
  }

  // Validate optional numeric fields
  const lat = body['latitude'] as number | undefined;
  const lng = body['longitude'] as number | undefined;
  if (lat !== undefined && (typeof lat !== 'number' || lat < -90 || lat > 90)) {
    return err(400, 'INVALID_PARAM', 'latitude must be between -90 and 90.');
  }
  if (lng !== undefined && (typeof lng !== 'number' || lng < -180 || lng > 180)) {
    return err(400, 'INVALID_PARAM', 'longitude must be between -180 and 180.');
  }

  const now = new Date().toISOString();
  const user: UserProfile = {
    userId: randomUUID(),
    displayName: (body['displayName'] as string).trim(),
    role: body['role'] as UserRole,
    verificationStatus: 'PENDING',   // always starts PENDING; admin verifies
    createdAt: now,
    updatedAt: now,
    ...(body['organizationName'] ? { organizationName: (body['organizationName'] as string).trim() } : {}),
    ...(lat !== undefined ? { latitude: lat } : {}),
    ...(lng !== undefined ? { longitude: lng } : {}),
    ...(body['serviceRadiusKm'] !== undefined ? { serviceRadiusKm: body['serviceRadiusKm'] as number } : {}),
    ...(body['collectionCapacity'] !== undefined ? { collectionCapacity: body['collectionCapacity'] as number } : {}),
  };

  try {
    await deps.userRepo.create(user);
  } catch (e) {
    console.error('createUser: DB error', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to create user.');
  }

  return ok(user, 201);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/{userId}
// ─────────────────────────────────────────────────────────────────────────────

export async function getUser(
  event: APIGatewayProxyEventV2,
  deps: Deps = defaultDeps,
): Promise<APIGatewayProxyResultV2> {
  const userId = event.pathParameters?.['userId'];
  if (!userId) return err(400, 'MISSING_PARAM', 'userId path parameter is required.');

  let user: UserProfile | null;
  try {
    user = await deps.userRepo.getById(userId);
  } catch (e) {
    console.error('getUser: DB error', e);
    return err(500, 'INTERNAL_ERROR', 'Failed to retrieve user.');
  }

  if (!user) return err(404, 'NOT_FOUND', `User ${userId} not found.`);

  // Strip exact coordinates from public view
  const { latitude: _lat, longitude: _lng, ...publicView } = user;
  return ok(publicView);
}

// ── Lambda entry points ───────────────────────────────────────────────────────

export const nearbyOrgsHandler  = (e: APIGatewayProxyEventV2) => nearbyOrganizations(e);
export const createUserHandler   = (e: APIGatewayProxyEventV2) => createUser(e);
export const getUserHandler      = (e: APIGatewayProxyEventV2) => getUser(e);
