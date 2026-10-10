// ─────────────────────────────────────────────────────────────────────────────
// API Client – typed fetch wrapper
//
// Usage:
//   import { api } from '@/lib/api';
//   const donations = await api.donations.list();
//
// Mode:
//   When NEXT_PUBLIC_API_BASE_URL is set, uses the real backend.
//   When unset, falls back to the mock adapter.
//   The active mode is logged to the console on first use.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Donation,
  DonationRequest,
  UserProfile,
  ApiResponse,
  FoodCategory,
  DonationStatus,
} from './types';
import { mockApi } from './mock-data';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const USE_MOCK = !BASE_URL;

let modeLogged = false;
function logMode() {
  if (!modeLogged) {
    console.info(
      `[Dharm API] Mode: ${USE_MOCK ? '⚠️ MOCK (no NEXT_PUBLIC_API_BASE_URL set)' : `✅ LIVE → ${BASE_URL}`}`,
    );
    modeLogged = true;
  }
}

// ── Generic fetch helper ──────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  logMode();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const body = await res.json() as ApiResponse<T>;
  return body;
}

// ── Real API client ──────────────────────────────────────────────────────────

const realApi = {
  health: {
    check: () => request<{ status: string; version: string }>('/api/health'),
  },

  users: {
    create: (data: Partial<UserProfile>) =>
      request<UserProfile>('/api/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    get: (userId: string) => request<UserProfile>(`/api/users/${userId}`),
  },

  donations: {
    create: (data: Record<string, unknown>) =>
      request<Donation>('/api/donations', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    list: (params?: { status?: DonationStatus; category?: FoodCategory; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.category) q.set('category', params.category);
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return request<{ items: Donation[]; nextToken?: string }>(
        `/api/donations${qs ? `?${qs}` : ''}`,
      );
    },
    get: (donationId: string) =>
      request<Donation>(`/api/donations/${donationId}`),
  },

  requests: {
    create: (donationId: string, data: { receiverId: string; requestedQuantity: number }) =>
      request<DonationRequest>(`/api/donations/${donationId}/requests`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    accept: (requestId: string, donorId: string) =>
      request<DonationRequest>(`/api/requests/${requestId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ donorId }),
      }),
    decline: (requestId: string, donorId: string) =>
      request<DonationRequest>(`/api/requests/${requestId}/decline`, {
        method: 'POST',
        body: JSON.stringify({ donorId }),
      }),
    updateStatus: (requestId: string, data: { receiverId: string; status: 'COLLECTED' | 'FAILED'; note?: string }) =>
      request<DonationRequest>(`/api/requests/${requestId}/status`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  organizations: {
    nearby: (params: { lat: number; lng: number; radiusKm?: number; donationId?: string }) => {
      const q = new URLSearchParams({
        lat: String(params.lat),
        lng: String(params.lng),
      });
      if (params.radiusKm) q.set('radiusKm', String(params.radiusKm));
      if (params.donationId) q.set('donationId', params.donationId);
      return request<Record<string, unknown>>(`/api/organizations/nearby?${q}`);
    },
  },
};

// ── Export: mock or real depending on env ──────────────────────────────────────

export const api = USE_MOCK ? mockApi : realApi;
export const isMockMode = USE_MOCK;
