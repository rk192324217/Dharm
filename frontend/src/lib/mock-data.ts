// ─────────────────────────────────────────────────────────────────────────────
// Mock Data Provider for Frontend Development
// ─────────────────────────────────────────────────────────────────────────────

import {
  Donation,
  DonationRequest,
  UserProfile,
  ApiResponse,
  DonationStatus,
  FoodCategory,
  StorageCondition,
  RequestStatus
} from './types';

// Mock DB
let _users: UserProfile[] = [
  {
    userId: 'user-123',
    email: 'donor@dharm.test',
    role: 'DONOR',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    displayName: 'Tech Corp Cafeteria',
    organizationName: 'Tech Corp',
    phone: '+1234567890',
    verificationStatus: 'VERIFIED',
  },
  {
    userId: 'org-456',
    email: 'foodbank@dharm.test',
    role: 'RECEIVER',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    displayName: 'City Food Bank',
    organizationName: 'City Food Bank NPO',
    latitude: 37.7749,
    longitude: -122.4194,
    verificationStatus: 'VERIFIED',
  }
];

let _donations: Donation[] = [
  {
    donationId: 'don-111',
    donorId: 'user-123',
    title: 'Surplus Sandwiches from Event',
    description: 'Assorted vegetarian and chicken sandwiches. Kept refrigerated.',
    foodCategory: 'COOKED_MEAL',
    quantity: 50,
    unit: 'ITEMS',
    pickupDeadline: new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString(), // 4 hours from now
    approximateLocation: '456 Tech St, SF',
    status: 'AVAILABLE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    preparedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    storageConditions: 'REFRIGERATED',
  },
  {
    donationId: 'don-222',
    donorId: 'user-123',
    title: 'Fresh Produce Box',
    description: 'Tomatoes, lettuce, and apples from our weekly delivery overage.',
    foodCategory: 'PRODUCE',
    quantity: 20,
    unit: 'KG',
    pickupDeadline: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(), // 2 days from now
    approximateLocation: '456 Tech St, SF',
    status: 'AVAILABLE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    preparedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    storageConditions: 'AMBIENT',
  }
];

let _requests: DonationRequest[] = [];

// Helper to wrap in ApiResponse
function wrap<T>(data: T, status = 200, message?: string): Promise<ApiResponse<T>> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: status >= 200 && status < 300,
        data,
        error: status >= 400 ? { code: `ERR_${status}`, message: message || 'Error' } : undefined,
      } as ApiResponse<T>);
    }, 500); // simulate network latency
  });
}

// ── Mock API Client Implementation ─────────────────────────────────────────────

export const mockApi = {
  health: {
    check: () => wrap({ status: 'ok', version: '1.0.0-mock' }),
  },

  users: {
    create: (data: Partial<UserProfile>) => {
      const newUser: UserProfile = {
        userId: `user-${Date.now()}`,
        displayName: data.displayName || 'Unknown',
        email: data.email || '',
        role: data.role || 'DONOR',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        verificationStatus: 'PENDING',
        organizationName: data.organizationName,
        phone: data.phone,
        latitude: data.latitude,
        longitude: data.longitude,
        serviceRadiusKm: data.serviceRadiusKm,
        collectionCapacity: data.collectionCapacity,
      };
      _users.push(newUser);
      return wrap(newUser);
    },
    get: (userId: string) => {
      const user = _users.find(u => u.userId === userId);
      return user ? wrap(user) : wrap(null as any, 404, 'User not found');
    },
  },

  donations: {
    create: (data: Record<string, any>) => {
      const newDonation: Donation = {
        donationId: `don-${Date.now()}`,
        donorId: data.donorId || 'user-123',
        title: data.title || 'Untitled',
        description: data.description || '',
        foodCategory: (data.foodCategory || 'OTHER') as FoodCategory,
        quantity: data.quantity || 1,
        unit: data.unit || 'ITEMS',
        pickupDeadline: data.pickupDeadline || new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        approximateLocation: data.approximateLocation || 'Unknown',
        status: 'AVAILABLE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        preparedAt: data.preparedAt || new Date().toISOString(),
        storageConditions: (data.storageConditions || 'AMBIENT') as StorageCondition,
        dietaryInformation: data.dietaryInformation,
        allergens: data.allergens,
      };
      _donations.push(newDonation);
      return wrap(newDonation);
    },
    list: (params?: { status?: DonationStatus; foodCategory?: FoodCategory; limit?: number }) => {
      let result = [..._donations];
      if (params?.status) result = result.filter(d => d.status === params.status);
      if (params?.foodCategory) result = result.filter(d => d.foodCategory === params.foodCategory);
      if (params?.limit) result = result.slice(0, params.limit);
      return wrap({ items: result });
    },
    get: (donationId: string) => {
      const don = _donations.find(d => d.donationId === donationId);
      return don ? wrap(don) : wrap(null as any, 404, 'Donation not found');
    },
  },

  requests: {
    create: (donationId: string, data: { receiverId: string; requestedQuantity: number }) => {
      const req: DonationRequest = {
        requestId: `req-${Date.now()}`,
        donationId,
        receiverId: data.receiverId,
        donorId: _donations.find(d => d.donationId === donationId)?.donorId || 'unknown',
        status: 'PENDING',
        requestedQuantity: data.requestedQuantity,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      _requests.push(req);
      return wrap(req);
    },
    accept: (requestId: string, donorId: string) => {
      const req = _requests.find(r => r.requestId === requestId);
      if (req && req.donorId === donorId) {
        req.status = 'ACCEPTED';
        req.updatedAt = new Date().toISOString();
        const don = _donations.find(d => d.donationId === req.donationId);
        if (don) don.status = 'RESERVED';
        return wrap(req);
      }
      return wrap(null as any, 404, 'Request not found or unauthorized');
    },
    decline: (requestId: string, donorId: string) => {
       const req = _requests.find(r => r.requestId === requestId);
      if (req && req.donorId === donorId) {
        req.status = 'DECLINED';
        req.updatedAt = new Date().toISOString();
        return wrap(req);
      }
      return wrap(null as any, 404, 'Request not found');
    },
    updateStatus: (requestId: string, data: { receiverId: string; status: 'COLLECTED' | 'FAILED'; note?: string }) => {
      const req = _requests.find(r => r.requestId === requestId);
      if (req && req.receiverId === data.receiverId) {
        req.status = data.status;
        req.updatedAt = new Date().toISOString();
        return wrap(req);
      }
      return wrap(null as any, 404, 'Request not found');
    },
  },

  organizations: {
    nearby: (params: { lat: number; lng: number; radiusKm?: number; donationId?: string }) => {
      // Return dummy orgs near the location
      return wrap({
        organizations: [
          _users[1],
          {
            ..._users[1],
            userId: 'org-789',
            displayName: 'Local Shelter',
            latitude: params.lat + 0.01,
            longitude: params.lng + 0.01,
          }
        ]
      });
    },
  },
};
