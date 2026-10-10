# Dharm API Limitations & Discrepancies

This document tracks known limitations, discrepancies, and workarounds between the Dharm frontend API client and the AWS Serverless backend implementation (Phase 6 Verification).

## 1. Authentication & Identity
- **Limitation**: The current API allows self-attested `donorId` and `receiverId` in request bodies (e.g., `POST /api/donations` and `POST /api/requests/{id}/accept`).
- **Discrepancy**: The frontend passes these IDs manually, which assumes an open/trust-based system.
- **Future Resolution**: AWS Cognito integration needs to be implemented. API Gateway Authorizers will decode the JWT token and pass the `userId` directly via the `requestContext.authorizer`, removing the need to supply it in the request body.

## 2. Pagination & Sorting
- **Limitation**: The `GET /api/donations` endpoint in `donations.ts` supports basic DynamoDB queries but lacks robust sorting (e.g., sort by proximity or expiry).
- **Discrepancy**: The frontend `api.ts` includes `limit` in query parameters, but DynamoDB `Limit` does not guarantee the "latest" items unless carefully indexed with sort keys.
- **Future Resolution**: Implement a dedicated GSI (Global Secondary Index) sorted by `createdAt` or `pickupDeadline`, or leverage OpenSearch for more complex proximity-based filtering.

## 3. Geospatial Queries
- **Limitation**: `GET /api/organizations/nearby` currently uses a naive bounding-box or distance-haversine calculation on the backend, which requires scanning or filtering a large set of users.
- **Future Resolution**: For scale, use DynamoDB Geo, Amazon Location Service, or a PostGIS database.

## 4. Input Validation
- **Limitation**: The API currently relies on basic conditional checks within the handlers.
- **Future Resolution**: Implement API Gateway Models & Request Validators or `zod` schema parsing in the Lambda handlers to ensure strong type safety before processing business logic.

## 5. Webhooks & Real-time Updates
- **Limitation**: The frontend must poll the API to get updates on Donation Requests (e.g., when a donor accepts a request).
- **Future Resolution**: Implement AWS IoT Core (MQTT over WebSockets) or API Gateway WebSockets to push status changes to the frontend in real-time.
