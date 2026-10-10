// ─────────────────────────────────────────────────────────────────────────────
// Frontend types — mirrors backend src/types/index.ts
//
// These are the frontend representations of the backend domain models.
// They match the API contract in docs/API_CONTRACT.md.
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = 'DONOR' | 'RECEIVER';
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface UserProfile {
  userId: string;
  email?: string;
  phone?: string;
  displayName: string;
  role: UserRole;
  organizationName?: string;
  verificationStatus: VerificationStatus;
  latitude?: number;
  longitude?: number;
  serviceRadiusKm?: number;
  collectionCapacity?: number;
  createdAt: string;
  updatedAt: string;
}

export type DonationStatus = 'AVAILABLE' | 'RESERVED' | 'COLLECTED' | 'EXPIRED' | 'CANCELLED';

export type FoodCategory =
  | 'COOKED_MEAL' | 'BAKERY' | 'PRODUCE' | 'DAIRY'
  | 'PACKAGED' | 'BEVERAGES' | 'OTHER';

export type StorageCondition = 'AMBIENT' | 'REFRIGERATED' | 'FROZEN';

export interface Donation {
  donationId: string;
  donorId: string;
  title: string;
  description?: string;
  foodCategory: FoodCategory;
  dietaryInformation?: string;
  allergens?: string[];
  quantity: number;
  unit: string;
  preparedAt: string;
  storageConditions: StorageCondition;
  pickupDeadline: string;
  approximateLocation?: string;
  status: DonationStatus;
  createdAt: string;
  updatedAt: string;
}

export type RequestStatus =
  | 'PENDING' | 'ACCEPTED' | 'DECLINED'
  | 'CANCELLED' | 'COLLECTED' | 'FAILED';

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

export interface MatchCandidate {
  userId: string;
  displayName: string;
  organizationName?: string;
  distanceKm: number;
  score: {
    urgencyScore: number;
    distanceScore: number;
    capacityScore: number;
    totalScore: number;
  };
  rankingReason: string;
}

// API response wrappers
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// Food category display helpers
export const FOOD_CATEGORY_LABELS: Record<FoodCategory, string> = {
  COOKED_MEAL: 'Cooked Meal',
  BAKERY: 'Bakery',
  PRODUCE: 'Fresh Produce',
  DAIRY: 'Dairy',
  PACKAGED: 'Packaged',
  BEVERAGES: 'Beverages',
  OTHER: 'Other',
};

export const FOOD_CATEGORY_EMOJI: Record<FoodCategory, string> = {
  COOKED_MEAL: '🍛',
  BAKERY: '🍞',
  PRODUCE: '🍎',
  DAIRY: '🧀',
  PACKAGED: '📦',
  BEVERAGES: '🥤',
  OTHER: '🍽️',
};

export const STORAGE_LABELS: Record<StorageCondition, string> = {
  AMBIENT: 'Room Temperature',
  REFRIGERATED: 'Refrigerated',
  FROZEN: 'Frozen',
};

export const STATUS_LABELS: Record<DonationStatus, string> = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  COLLECTED: 'Collected',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  COLLECTED: 'Collected',
  FAILED: 'Failed',
};
