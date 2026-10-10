# Dharm API Contract (Backend Phase 4)

This document serves as the single source of truth for the frontend developers connecting to the API.

> **Authentication (Phase 5+)**: Currently, all endpoints are open. The `donorId` and `receiverId` are supplied in the request body (Phase 2/3 compatibility). When Cognito is integrated, these IDs will be securely extracted from the JWT `sub` claim.

---

## 1. Health

### `GET /api/health`
Liveness check.
- **Request:** None
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "status": "ok",
      "version": "0.1.0",
      "environment": "dev",
      "timestamp": "2026-10-10T12:00:00.000Z"
    }
  }
  ```

---

## 2. Users & Organizations

### `POST /api/users`
Register a new profile (Donor or Receiver).
- **Body**:
  ```json
  {
    "displayName": "Mumbai Food Bank",
    "role": "RECEIVER",
    "organizationName": "Mumbai Food Bank Trust",
    "latitude": 19.076,
    "longitude": 72.877,
    "serviceRadiusKm": 25,
    "collectionCapacity": 500
  }
  ```
- **Response `201 Created`**: Returns the `UserProfile` object with server-generated `userId`.

### `GET /api/users/{userId}`
Get public profile information.
- **Privacy**: `latitude` and `longitude` are stripped from the response.

### `GET /api/organizations/nearby`
Find receivers near a location, or match receivers to a specific donation.

- **Query Parameters**:
  - `lat` (required): Latitude
  - `lng` (required): Longitude
  - `radiusKm` (optional): Override radius (default 50)
  - `donationId` (optional): If provided, runs the full matching algorithm (eligibility + ranking).

- **Response `200 OK` (Donation Match Mode)**:
  ```json
  {
    "success": true,
    "data": {
      "mode": "donation-match",
      "donationId": "don-123",
      "estimatedKgRescuedIfCollected": {
        "value": 35.5,
        "unit": "kg",
        "note": "Estimate only – not a measured value."
      },
      "eligible": [
        {
          "userId": "recv-1",
          "displayName": "Local Shelter",
          "distanceKm": 5.2,
          "score": {
            "urgencyScore": 0.9,
            "distanceScore": 0.8,
            "capacityScore": 1.0,
            "totalScore": 0.88
          },
          "rankingReason": "High urgency: 2.5 h remaining before deadline; 5.2 km away; Capacity sufficient"
        }
      ],
      "ineligible": [
        {
          "userId": "recv-2",
          "displayName": "Distant Shelter",
          "reason": "Donation is 80.5 km away, exceeding receiver's 20 km radius."
        }
      ],
      "totalEligible": 1,
      "totalIneligible": 1
    }
  }
  ```

---

## 3. Donations

### `POST /api/donations`
Create a new food donation.
- **Body**:
  ```json
  {
    "donorId": "donor-123",
    "title": "50 boxes of Biryani",
    "foodCategory": "COOKED_MEAL",
    "quantity": 50,
    "unit": "boxes",
    "preparedAt": "2026-10-10T10:00:00Z",
    "pickupDeadline": "2026-10-10T22:00:00Z",
    "latitude": 19.076,
    "longitude": 72.877
  }
  ```

### `GET /api/donations`
List available donations.
- **Query Params**: `status` (default: `AVAILABLE`), `category` (optional), `limit` (default: 20).
- **Privacy**: `latitude` and `longitude` are stripped from the response.

### `GET /api/donations/{donationId}`
Get details of a single donation.
- **Privacy**: `latitude` and `longitude` are stripped from the response.

---

## 4. Requests (Workflow)

### `POST /api/donations/{donationId}/requests`
Receiver asks to collect a donation.
- **Body**:
  ```json
  {
    "receiverId": "recv-123",
    "requestedQuantity": 50
  }
  ```
- **Constraints**: Donation must be `AVAILABLE` and not expired. Receiver cannot have an existing active request for this donation.

### `POST /api/requests/{requestId}/accept`
Donor accepts a request. **ATOMIC OPERATION**.
- **Body**: `{"donorId": "donor-123"}`
- **Action**: Transitions request to `ACCEPTED` and donation to `RESERVED`. Will return `409 Conflict` if the donation was already reserved by someone else concurrently.
- **Side-effect**: Best-effort declines all other pending requests for this donation.

### `POST /api/requests/{requestId}/decline`
Donor declines a request.
- **Body**: `{"donorId": "donor-123"}`

### `POST /api/requests/{requestId}/status`
Receiver updates the collection status.
- **Body**:
  ```json
  {
    "receiverId": "recv-123",
    "status": "COLLECTED",
    "note": "Thanks for the food!"
  }
  ```
- **Allowed Statuses**:
  - `COLLECTED` -> Marks both request and donation as `COLLECTED`.
  - `FAILED` -> Marks request as `FAILED` and resets donation back to `AVAILABLE`.
