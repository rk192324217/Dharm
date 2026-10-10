// ─────────────────────────────────────────────────────────────────────────────
// Matching Service
//
// Pure functions that decide which receiving organisations are eligible for a
// donation and how they should be ranked.  No DynamoDB, no I/O — fully
// testable without any infrastructure.
//
// Algorithm: deterministic rules-based ranking.
// We do NOT use an LLM or probabilistic model for distance or deadline maths.
//
// Eligibility (hard pass/fail):
//   1. Donation is AVAILABLE and not past its pickupDeadline.
//   2. Donation has valid coordinates.
//   3. Receiver has valid coordinates.
//   4. Receiver is within their declared serviceRadiusKm of the donation.
//   5. Receiver collectionCapacity >= donation quantity.
//      (We do not enforce Cognito verificationStatus here yet; that is a
//       Phase 3 concern once Cognito is integrated.)
//
// Ranking (higher score = better match, returned sorted descending):
//   - Urgency:  normalised remaining time before pickupDeadline (0–1, inverted
//               so urgent donations score higher)
//   - Distance: normalised distance within serviceRadius (0–1, inverted)
//   - Capacity: ratio of requestedQuantity to available capacity (capped at 1)
//
// Important notes:
//   - Distance is straight-line (Haversine). We do NOT claim it equals travel time.
//   - Impact estimates are labelled as ESTIMATES, not measured values.
//   - Missing coordinates produce an explicit ineligibility reason, not an error.
// ─────────────────────────────────────────────────────────────────────────────

import type { Donation, UserProfile } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

// Scoring weights — must sum to 1.0
const WEIGHT_URGENCY  = 0.50;   // how soon does the food need to go?
const WEIGHT_DISTANCE = 0.35;   // how close is the receiver?
const WEIGHT_CAPACITY = 0.15;   // how well does capacity fit?

// Maximum window we consider "feasible" for collection (hours).
// Donations with less remaining time than this are treated as highest urgency.
const MAX_FEASIBLE_HOURS = 12;

// ── Haversine distance ────────────────────────────────────────────────────────

/**
 * Straight-line distance between two coordinates in kilometres.
 *
 * Uses the Haversine formula which gives the great-circle distance between
 * two points on a sphere.  Error vs. actual road distance is typically 15–30%.
 * We do not use this to estimate travel time.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// ── Eligibility ───────────────────────────────────────────────────────────────

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;           // always set when eligible === false
  distanceKm?: number;       // set when coordinates are valid
}

/**
 * Decide whether a receiver organisation is eligible to be matched to a
 * donation.  Returns a structured result so callers can explain ineligibility
 * to the user without guessing.
 */
export function checkEligibility(
  donation: Donation,
  receiver: UserProfile,
): EligibilityResult {
  // 1. Donation must be available
  if (donation.status !== 'AVAILABLE') {
    return { eligible: false, reason: `Donation is ${donation.status}, not AVAILABLE.` };
  }

  // 2. Donation must not be past its deadline
  const now = Date.now();
  if (new Date(donation.pickupDeadline).getTime() <= now) {
    return { eligible: false, reason: 'Donation pickup deadline has passed.' };
  }

  // 3. Donation coordinates must be present and valid
  if (
    typeof donation.latitude !== 'number' ||
    typeof donation.longitude !== 'number' ||
    !isFinite(donation.latitude) ||
    !isFinite(donation.longitude)
  ) {
    return { eligible: false, reason: 'Donation location coordinates are missing or invalid.' };
  }

  // 4. Receiver coordinates must be present and valid
  if (
    typeof receiver.latitude !== 'number' ||
    typeof receiver.longitude !== 'number' ||
    !isFinite(receiver.latitude) ||
    !isFinite(receiver.longitude)
  ) {
    return { eligible: false, reason: 'Receiver location coordinates are missing or invalid.' };
  }

  // 5. Receiver must have a declared service radius
  if (typeof receiver.serviceRadiusKm !== 'number' || receiver.serviceRadiusKm <= 0) {
    return { eligible: false, reason: 'Receiver has not set a valid service radius.' };
  }

  // 6. Receiver must be within their service radius
  const distanceKm = haversineKm(
    donation.latitude,
    donation.longitude,
    receiver.latitude,
    receiver.longitude,
  );

  if (distanceKm > receiver.serviceRadiusKm) {
    return {
      eligible: false,
      reason: `Donation is ${distanceKm.toFixed(1)} km away, exceeding receiver's ${receiver.serviceRadiusKm} km radius.`,
      distanceKm,
    };
  }

  // 7. Receiver capacity must accommodate the donation quantity
  if (
    typeof receiver.collectionCapacity === 'number' &&
    receiver.collectionCapacity > 0 &&
    receiver.collectionCapacity < donation.quantity
  ) {
    return {
      eligible: false,
      reason: `Receiver capacity (${receiver.collectionCapacity} ${donation.unit}) is less than donation quantity (${donation.quantity} ${donation.unit}).`,
      distanceKm,
    };
  }

  return { eligible: true, distanceKm };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export interface MatchScore {
  urgencyScore:  number;   // 0–1, higher = more urgent
  distanceScore: number;   // 0–1, higher = closer
  capacityScore: number;   // 0–1, higher = better fit
  totalScore:    number;   // weighted sum, 0–1
}

/**
 * Calculate a composite match score for an eligible receiver.
 *
 * All sub-scores are normalised to [0, 1].
 * urgencyScore is the dominant factor (50%) because food safety is paramount.
 */
export function scoreMatch(
  donation: Donation,
  receiver: UserProfile,
  distanceKm: number,
): MatchScore {
  const now = Date.now();
  const deadlineMs = new Date(donation.pickupDeadline).getTime();
  const remainingHours = Math.max(0, (deadlineMs - now) / 3_600_000);

  // Urgency: invert remaining time — closer to deadline = higher score
  // Capped at MAX_FEASIBLE_HOURS so that donations expiring soon score 1.0
  const urgencyScore = Math.min(1, 1 - remainingHours / MAX_FEASIBLE_HOURS);

  // Distance: invert within service radius — closer = higher score
  const radius = receiver.serviceRadiusKm ?? 1;
  const distanceScore = Math.max(0, 1 - distanceKm / radius);

  // Capacity: how efficiently does the donation fill the receiver's capacity?
  // Perfect fit (100% of capacity) scores 1.0. Partially filled still scores > 0.
  const capacity = receiver.collectionCapacity ?? donation.quantity;
  const capacityScore = Math.min(1, donation.quantity / capacity);

  const totalScore =
    WEIGHT_URGENCY  * urgencyScore +
    WEIGHT_DISTANCE * distanceScore +
    WEIGHT_CAPACITY * capacityScore;

  return {
    urgencyScore:  Math.round(urgencyScore  * 1000) / 1000,
    distanceScore: Math.round(distanceScore * 1000) / 1000,
    capacityScore: Math.round(capacityScore * 1000) / 1000,
    totalScore:    Math.round(totalScore    * 1000) / 1000,
  };
}

// ── Match result ──────────────────────────────────────────────────────────────

export interface MatchCandidate {
  receiver: UserProfile;
  distanceKm: number;
  score: MatchScore;
  // Human-readable explanation for why this receiver is ranked highly
  rankingReason: string;
}

export interface IneligibleCandidate {
  receiver: UserProfile;
  reason: string;
}

export interface MatchingResult {
  donationId:  string;
  eligible:    MatchCandidate[];      // sorted descending by totalScore
  ineligible:  IneligibleCandidate[];
}

/**
 * Run the full matching process for a donation against a list of receivers.
 *
 * Returns eligible candidates ranked by score (best first) and a list of
 * ineligible candidates with their reasons.
 *
 * @param donation   The donation to match
 * @param receivers  All receiver profiles to evaluate (pre-loaded by the handler)
 */
export function matchDonation(
  donation: Donation,
  receivers: UserProfile[],
): MatchingResult {
  const eligible: MatchCandidate[] = [];
  const ineligible: IneligibleCandidate[] = [];

  for (const receiver of receivers) {
    if (receiver.role !== 'RECEIVER') continue;

    const eligibility = checkEligibility(donation, receiver);

    if (!eligibility.eligible) {
      ineligible.push({ receiver, reason: eligibility.reason! });
      continue;
    }

    const distanceKm = eligibility.distanceKm!;
    const score = scoreMatch(donation, receiver, distanceKm);

    const rankingReason = buildRankingReason(score, distanceKm, donation, receiver);

    eligible.push({ receiver, distanceKm: Math.round(distanceKm * 10) / 10, score, rankingReason });
  }

  // Sort best match first
  eligible.sort((a, b) => b.score.totalScore - a.score.totalScore);

  return { donationId: donation.donationId, eligible, ineligible };
}

// ── Explanation builder ───────────────────────────────────────────────────────

function buildRankingReason(
  score: MatchScore,
  distanceKm: number,
  donation: Donation,
  receiver: UserProfile,
): string {
  const parts: string[] = [];

  const remainingMs = new Date(donation.pickupDeadline).getTime() - Date.now();
  const remainingHours = Math.max(0, remainingMs / 3_600_000);

  if (score.urgencyScore > 0.7) {
    parts.push(`High urgency: ${remainingHours.toFixed(1)} h remaining before deadline`);
  } else {
    parts.push(`${remainingHours.toFixed(1)} h until deadline`);
  }

  parts.push(`${distanceKm.toFixed(1)} km away (straight-line, within ${receiver.serviceRadiusKm} km radius)`);

  if (receiver.collectionCapacity && receiver.collectionCapacity >= donation.quantity) {
    parts.push(`Capacity sufficient (${receiver.collectionCapacity} ${donation.unit} available)`);
  }

  return parts.join('; ');
}

// ── Estimate helper (labelled as estimate, not measured) ─────────────────────

/**
 * Returns an ESTIMATED food rescued weight in kg from servings/pieces.
 * This is a rough estimate for reporting purposes only — not a precise measurement.
 * Assumptions: 1 serving ≈ 0.35 kg, 1 piece/portion ≈ 0.25 kg.
 */
export function estimateKgRescued(quantity: number, unit: string): number | null {
  const conversions: Record<string, number> = {
    kg:       1,
    g:        0.001,
    servings: 0.35,
    portions: 0.35,
    pieces:   0.25,
    boxes:    2.0,       // rough average
    litres:   1.0,
  };
  const factor = conversions[unit.toLowerCase()];
  return factor !== undefined ? Math.round(quantity * factor * 10) / 10 : null;
}
