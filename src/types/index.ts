// ─────────────────────────────────────────────────────────────────────────────
// Dharm – Shared TypeScript types
// These types are used across handlers, services and repositories.
// ─────────────────────────────────────────────────────────────────────────────

// ── API Response shapes ───────────────────────────────────────────────────────

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ── User / Profile ────────────────────────────────────────────────────────────

export type UserRole = 'DONOR' | 'RECEIVER';
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface UserProfile {
  userId: string;
  displayName: string;
  role: UserRole;
  organizationName?: string;
  verificationStatus: VerificationStatus;
  latitude?: number;
  longitude?: number;
  serviceRadiusKm?: number;       // RECEIVER only
  collectionCapacity?: number;    // RECEIVER only – kg or servings
  createdAt: string;              // ISO 8601 UTC
  updatedAt: string;
}

// ── Donation ──────────────────────────────────────────────────────────────────

export type DonationStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'COLLECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export type FoodCategory =
  | 'COOKED_MEAL'
  | 'BAKERY'
  | 'PRODUCE'
  | 'DAIRY'
  | 'PACKAGED'
  | 'BEVERAGES'
  | 'OTHER';

export type StorageCondition = 'AMBIENT' | 'REFRIGERATED' | 'FROZEN';

export interface Donation {
  donationId: string;
  donorId: string;
  title: string;
  description: string;
  foodCategory: FoodCategory;
  dietaryInformation?: string;
  allergens?: string[];
  quantity: number;
  unit: string;                   // e.g. "kg", "servings", "boxes"
  preparedAt: string;             // ISO 8601 UTC – when food was made/packaged
  storageConditions: StorageCondition;
  pickupDeadline: string;         // ISO 8601 UTC – hard cutoff for collection
  latitude: number;
  longitude: number;
  approximateLocation?: string;   // human readable, hides precise address
  status: DonationStatus;
  createdAt: string;
  updatedAt: string;
}

// Subset exposed to non-requesting receivers (hides exact coordinates)
export interface DonationPublicView extends Omit<Donation, 'latitude' | 'longitude'> {
  approximateLocation: string;
}

// ── Donation Request ──────────────────────────────────────────────────────────

export type RequestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'COLLECTED'
  | 'FAILED';

export interface DonationRequest {
  requestId: string;
  donationId: string;
  donorId: string;
  receiverId: string;
  status: RequestStatus;
  requestedQuantity: number;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  collectedAt?: string;
}

// ── Health check ──────────────────────────────────────────────────────────────

export interface HealthData {
  status: 'ok';
  version: string;
  environment: string;
  timestamp: string;
}
