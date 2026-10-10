// ─────────────────────────────────────────────────────────────────────────────
// Request & status validation
//
// Validates:
//   - POST /api/donations/{donationId}/requests  (create request)
//   - POST /api/requests/{requestId}/accept      (accept)
//   - POST /api/requests/{requestId}/decline     (decline)
//   - POST /api/requests/{requestId}/status      (COLLECTED | FAILED)
//
// State machine for DonationRequest:
//
//   PENDING ──accept──► ACCEPTED ──► COLLECTED
//          ╰──decline──► DECLINED     └──► FAILED
//          ╰──cancel──►  CANCELLED
//
// State machine for Donation:
//
//   AVAILABLE ──(request accepted)──► RESERVED ──(COLLECTED)──► COLLECTED
//                                             └──(FAILED)──────► AVAILABLE  (re-opened)
//             ──(donor cancels)──► CANCELLED
// ─────────────────────────────────────────────────────────────────────────────

import type { RequestStatus } from '../types';

// ── Validation result ─────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ── Create request input ──────────────────────────────────────────────────────

export interface CreateRequestInput {
  // Phase 2: receiverId from body. Phase 3: must come from Cognito JWT sub.
  receiverId: string;
  requestedQuantity: number;
}

export function validateCreateRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: Record<string, any>,
): { result: ValidationResult; input: CreateRequestInput | null } {
  const errors: ValidationError[] = [];

  // receiverId — temporary until Cognito is wired in Phase 4
  if (!body['receiverId'] || typeof body['receiverId'] !== 'string' || !(body['receiverId'] as string).trim()) {
    errors.push({ field: 'receiverId', message: 'receiverId is required.' });
  }

  // requestedQuantity
  const qty = body['requestedQuantity'];
  if (qty === undefined || qty === null) {
    errors.push({ field: 'requestedQuantity', message: 'requestedQuantity is required.' });
  } else if (typeof qty !== 'number' || !isFinite(qty) || qty <= 0) {
    errors.push({ field: 'requestedQuantity', message: 'requestedQuantity must be a positive number.' });
  }

  if (errors.length > 0) return { result: { valid: false, errors }, input: null };

  return {
    result: { valid: true, errors: [] },
    input: {
      receiverId: (body['receiverId'] as string).trim(),
      requestedQuantity: body['requestedQuantity'] as number,
    },
  };
}

// ── Status update input ───────────────────────────────────────────────────────

export type CollectionStatusUpdate = 'COLLECTED' | 'FAILED';
const ALLOWED_STATUS_UPDATES: CollectionStatusUpdate[] = ['COLLECTED', 'FAILED'];

export interface UpdateStatusInput {
  status: CollectionStatusUpdate;
  note?: string;                 // optional failure reason or collection note
}

export function validateStatusUpdate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: Record<string, any>,
): { result: ValidationResult; input: UpdateStatusInput | null } {
  const errors: ValidationError[] = [];

  if (!body['status']) {
    errors.push({ field: 'status', message: 'status is required.' });
  } else if (!ALLOWED_STATUS_UPDATES.includes(body['status'] as CollectionStatusUpdate)) {
    errors.push({
      field: 'status',
      message: `status must be one of: ${ALLOWED_STATUS_UPDATES.join(', ')}.`,
    });
  }

  if (body['note'] !== undefined) {
    if (typeof body['note'] !== 'string' || body['note'].length > 500) {
      errors.push({ field: 'note', message: 'note must be a string of at most 500 characters.' });
    }
  }

  if (errors.length > 0) return { result: { valid: false, errors }, input: null };

  return {
    result: { valid: true, errors: [] },
    input: {
      status: body['status'] as CollectionStatusUpdate,
      ...(body['note'] && { note: body['note'] as string }),
    },
  };
}

// ── State transition guard ────────────────────────────────────────────────────

/**
 * Returns true if transitioning a DonationRequest from `current` to `next`
 * is a legal move in the state machine.
 */
export function isRequestTransitionAllowed(
  current: RequestStatus,
  next: RequestStatus,
): boolean {
  const allowed: Partial<Record<RequestStatus, RequestStatus[]>> = {
    PENDING:  ['ACCEPTED', 'DECLINED', 'CANCELLED'],
    ACCEPTED: ['COLLECTED', 'FAILED'],
  };
  return (allowed[current] ?? []).includes(next);
}
