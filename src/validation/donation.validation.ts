// ─────────────────────────────────────────────────────────────────────────────
// Donation request validation
//
// We validate manually (no Zod/Joi) to keep the Lambda bundle small and error
// messages explicit.  Every validation function returns either a string error
// message (failure) or null (success).
// ─────────────────────────────────────────────────────────────────────────────

import type { FoodCategory, StorageCondition } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

export const FOOD_CATEGORIES: FoodCategory[] = [
  'COOKED_MEAL',
  'BAKERY',
  'PRODUCE',
  'DAIRY',
  'PACKAGED',
  'BEVERAGES',
  'OTHER',
];

export const STORAGE_CONDITIONS: StorageCondition[] = [
  'AMBIENT',
  'REFRIGERATED',
  'FROZEN',
];

const VALID_UNITS = ['kg', 'g', 'servings', 'boxes', 'litres', 'pieces', 'portions'];

const MAX_STRING_LENGTH = 500;
const MAX_TITLE_LENGTH = 100;
const MAX_ALLERGEN_COUNT = 20;
const MAX_ALLERGEN_LENGTH = 50;

// ── Validation result ─────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function required(value: unknown, field: string): ValidationError | null {
  if (value === undefined || value === null || value === '') {
    return { field, message: `${field} is required.` };
  }
  return null;
}

function isString(value: unknown, field: string, maxLength = MAX_STRING_LENGTH): ValidationError | null {
  if (typeof value !== 'string') {
    return { field, message: `${field} must be a string.` };
  }
  if (value.trim().length === 0) {
    return { field, message: `${field} must not be blank.` };
  }
  if (value.length > maxLength) {
    return { field, message: `${field} must be at most ${maxLength} characters.` };
  }
  return null;
}

function isPositiveNumber(value: unknown, field: string): ValidationError | null {
  if (typeof value !== 'number' || !isFinite(value) || value <= 0) {
    return { field, message: `${field} must be a positive number.` };
  }
  return null;
}

function isIso8601Utc(value: unknown, field: string): ValidationError | null {
  if (typeof value !== 'string') {
    return { field, message: `${field} must be an ISO 8601 UTC string.` };
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return { field, message: `${field} is not a valid date.` };
  }
  // Must end with Z to require UTC
  if (!value.endsWith('Z')) {
    return { field, message: `${field} must be in UTC (end with 'Z').` };
  }
  return null;
}

function isLatitude(value: unknown, field: string): ValidationError | null {
  if (typeof value !== 'number' || !isFinite(value) || value < -90 || value > 90) {
    return { field, message: `${field} must be a number between -90 and 90.` };
  }
  return null;
}

function isLongitude(value: unknown, field: string): ValidationError | null {
  if (typeof value !== 'number' || !isFinite(value) || value < -180 || value > 180) {
    return { field, message: `${field} must be a number between -180 and 180.` };
  }
  return null;
}

// ── Parsed / validated donation input ────────────────────────────────────────

export interface CreateDonationInput {
  // Phase 2: donorId comes from request body.
  // Phase 3: must be derived from the Cognito JWT sub claim only.
  donorId: string;
  title: string;
  description: string;
  foodCategory: FoodCategory;
  dietaryInformation?: string;
  allergens?: string[];
  quantity: number;
  unit: string;
  preparedAt: string;
  storageConditions: StorageCondition;
  pickupDeadline: string;
  latitude: number;
  longitude: number;
  approximateLocation?: string;
}

// ── Main validation function ──────────────────────────────────────────────────

/**
 * Validate and sanitise a raw POST /api/donations request body.
 *
 * Returns { valid: true, errors: [] } on success, or
 *         { valid: false, errors: [...] } with one entry per failing field.
 *
 * The caller is responsible for checking `valid` before using `input`.
 */
export function validateCreateDonation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: Record<string, any>,
): { result: ValidationResult; input: CreateDonationInput | null } {
  const errors: ValidationError[] = [];

  // ── donorId ──────────────────────────────────────────────────────────────
  // TODO (Phase 3): remove this field from the request body entirely.
  // Derive from Cognito JWT sub claim in the Lambda authorizer context.
  const donorIdErr = required(body['donorId'], 'donorId') ??
    isString(body['donorId'], 'donorId', 128);
  if (donorIdErr) errors.push(donorIdErr);

  // ── title ────────────────────────────────────────────────────────────────
  const titleErr = required(body['title'], 'title') ??
    isString(body['title'], 'title', MAX_TITLE_LENGTH);
  if (titleErr) errors.push(titleErr);

  // ── description ──────────────────────────────────────────────────────────
  const descErr = required(body['description'], 'description') ??
    isString(body['description'], 'description');
  if (descErr) errors.push(descErr);

  // ── foodCategory ─────────────────────────────────────────────────────────
  const catRequired = required(body['foodCategory'], 'foodCategory');
  if (catRequired) {
    errors.push(catRequired);
  } else if (!FOOD_CATEGORIES.includes(body['foodCategory'] as FoodCategory)) {
    errors.push({
      field: 'foodCategory',
      message: `foodCategory must be one of: ${FOOD_CATEGORIES.join(', ')}.`,
    });
  }

  // ── dietaryInformation (optional) ────────────────────────────────────────
  if (body['dietaryInformation'] !== undefined) {
    const dietErr = isString(body['dietaryInformation'], 'dietaryInformation');
    if (dietErr) errors.push(dietErr);
  }

  // ── allergens (optional) ─────────────────────────────────────────────────
  if (body['allergens'] !== undefined) {
    if (!Array.isArray(body['allergens'])) {
      errors.push({ field: 'allergens', message: 'allergens must be an array of strings.' });
    } else if (body['allergens'].length > MAX_ALLERGEN_COUNT) {
      errors.push({ field: 'allergens', message: `allergens must have at most ${MAX_ALLERGEN_COUNT} entries.` });
    } else {
      for (const [i, a] of (body['allergens'] as unknown[]).entries()) {
        if (typeof a !== 'string' || a.trim().length === 0 || a.length > MAX_ALLERGEN_LENGTH) {
          errors.push({
            field: `allergens[${i}]`,
            message: `allergens[${i}] must be a non-empty string of at most ${MAX_ALLERGEN_LENGTH} characters.`,
          });
        }
      }
    }
  }

  // ── quantity ─────────────────────────────────────────────────────────────
  const qtyRequired = required(body['quantity'], 'quantity');
  if (qtyRequired) {
    errors.push(qtyRequired);
  } else {
    const qtyErr = isPositiveNumber(body['quantity'], 'quantity');
    if (qtyErr) errors.push(qtyErr);
  }

  // ── unit ─────────────────────────────────────────────────────────────────
  const unitRequired = required(body['unit'], 'unit');
  if (unitRequired) {
    errors.push(unitRequired);
  } else if (!VALID_UNITS.includes(body['unit'])) {
    errors.push({
      field: 'unit',
      message: `unit must be one of: ${VALID_UNITS.join(', ')}.`,
    });
  }

  // ── preparedAt ───────────────────────────────────────────────────────────
  const prepErr = required(body['preparedAt'], 'preparedAt') ??
    isIso8601Utc(body['preparedAt'], 'preparedAt');
  if (prepErr) errors.push(prepErr);

  // ── storageConditions ────────────────────────────────────────────────────
  const storageRequired = required(body['storageConditions'], 'storageConditions');
  if (storageRequired) {
    errors.push(storageRequired);
  } else if (!STORAGE_CONDITIONS.includes(body['storageConditions'] as StorageCondition)) {
    errors.push({
      field: 'storageConditions',
      message: `storageConditions must be one of: ${STORAGE_CONDITIONS.join(', ')}.`,
    });
  }

  // ── pickupDeadline ───────────────────────────────────────────────────────
  const deadlineErr = required(body['pickupDeadline'], 'pickupDeadline') ??
    isIso8601Utc(body['pickupDeadline'], 'pickupDeadline');
  if (deadlineErr) {
    errors.push(deadlineErr);
  } else {
    // Deadline must be in the future
    const deadline = new Date(body['pickupDeadline'] as string);
    if (deadline.getTime() <= Date.now()) {
      errors.push({ field: 'pickupDeadline', message: 'pickupDeadline must be in the future.' });
    }
    // If preparedAt is also valid, deadline must be after preparedAt
    if (!prepErr && body['preparedAt']) {
      const prepared = new Date(body['preparedAt'] as string);
      if (deadline.getTime() <= prepared.getTime()) {
        errors.push({ field: 'pickupDeadline', message: 'pickupDeadline must be after preparedAt.' });
      }
    }
  }

  // ── latitude / longitude ─────────────────────────────────────────────────
  const latRequired = required(body['latitude'], 'latitude');
  if (latRequired) {
    errors.push(latRequired);
  } else {
    const latErr = isLatitude(body['latitude'], 'latitude');
    if (latErr) errors.push(latErr);
  }

  const lngRequired = required(body['longitude'], 'longitude');
  if (lngRequired) {
    errors.push(lngRequired);
  } else {
    const lngErr = isLongitude(body['longitude'], 'longitude');
    if (lngErr) errors.push(lngErr);
  }

  // ── approximateLocation (optional) ───────────────────────────────────────
  if (body['approximateLocation'] !== undefined) {
    const approxErr = isString(body['approximateLocation'], 'approximateLocation', 200);
    if (approxErr) errors.push(approxErr);
  }

  if (errors.length > 0) {
    return { result: { valid: false, errors }, input: null };
  }

  // All valid – assemble typed input
  const input: CreateDonationInput = {
    donorId: (body['donorId'] as string).trim(),
    title: (body['title'] as string).trim(),
    description: (body['description'] as string).trim(),
    foodCategory: body['foodCategory'] as FoodCategory,
    quantity: body['quantity'] as number,
    unit: body['unit'] as string,
    preparedAt: body['preparedAt'] as string,
    storageConditions: body['storageConditions'] as StorageCondition,
    pickupDeadline: body['pickupDeadline'] as string,
    latitude: body['latitude'] as number,
    longitude: body['longitude'] as number,
  };

  if (body['dietaryInformation'] !== undefined) {
    input.dietaryInformation = (body['dietaryInformation'] as string).trim();
  }
  if (body['allergens'] !== undefined) {
    input.allergens = (body['allergens'] as string[]).map((a) => a.trim());
  }
  if (body['approximateLocation'] !== undefined) {
    input.approximateLocation = (body['approximateLocation'] as string).trim();
  }

  return { result: { valid: true, errors: [] }, input };
}

// ── List query parameter validation ──────────────────────────────────────────

export interface ListDonationsQuery {
  status: string;
  category?: FoodCategory;
  limit: number;
  nextToken?: string;
}

export function validateListDonationsQuery(
  params: Record<string, string | undefined>,
): { result: ValidationResult; query: ListDonationsQuery | null } {
  const errors: ValidationError[] = [];
  const DEFAULT_LIMIT = 20;
  const MAX_LIMIT = 100;

  // status – default to AVAILABLE
  const rawStatus = params['status'] ?? 'AVAILABLE';
  const ALLOWED_STATUSES = ['AVAILABLE', 'RESERVED', 'COLLECTED', 'EXPIRED', 'CANCELLED'];
  if (!ALLOWED_STATUSES.includes(rawStatus)) {
    errors.push({
      field: 'status',
      message: `status must be one of: ${ALLOWED_STATUSES.join(', ')}.`,
    });
  }

  // category – optional filter
  if (params['category'] !== undefined && !FOOD_CATEGORIES.includes(params['category'] as FoodCategory)) {
    errors.push({
      field: 'category',
      message: `category must be one of: ${FOOD_CATEGORIES.join(', ')}.`,
    });
  }

  // limit – optional, default 20, max 100
  let limit = DEFAULT_LIMIT;
  if (params['limit'] !== undefined) {
    const parsed = parseInt(params['limit'], 10);
    if (isNaN(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      errors.push({ field: 'limit', message: `limit must be a number between 1 and ${MAX_LIMIT}.` });
    } else {
      limit = parsed;
    }
  }

  if (errors.length > 0) {
    return { result: { valid: false, errors }, query: null };
  }

  return {
    result: { valid: true, errors: [] },
    query: {
      status: rawStatus,
      category: params['category'] as FoodCategory | undefined,
      limit,
      nextToken: params['nextToken'],
    },
  };
}
