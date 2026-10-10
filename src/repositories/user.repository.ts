// ─────────────────────────────────────────────────────────────────────────────
// User Repository
//
// DynamoDB access for the users table.
//
// Access patterns:
//   - Get user by userId            → primary key lookup
//   - List users by role            → GSI role-createdAt-index
//
// Note: For GET /api/organizations/nearby we load all RECEIVER profiles and
// apply Haversine filtering in-process.  At hackathon scale (< 1 000 users)
// this is acceptable and avoids a complex geospatial index.  A production
// system would use a geohash GSI or DynamoDB's geo library.
// ─────────────────────────────────────────────────────────────────────────────

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { UserProfile, UserRole, VerificationStatus } from '../types';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

function getTableName(): string {
  const name = process.env['USERS_TABLE'];
  if (!name) throw new Error('USERS_TABLE environment variable is not set.');
  return name;
}

const ROLE_INDEX = 'role-createdAt-index';

// ── Repository interface ──────────────────────────────────────────────────────

export interface UserRepository {
  create(user: UserProfile): Promise<void>;
  getById(userId: string): Promise<UserProfile | null>;
  listByRole(role: UserRole): Promise<UserProfile[]>;
  updateVerification(userId: string, status: VerificationStatus): Promise<void>;
}

// ── DynamoDB implementation ───────────────────────────────────────────────────

export class DynamoDbUserRepository implements UserRepository {
  async create(user: UserProfile): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: getTableName(),
        Item: user,
        ConditionExpression: 'attribute_not_exists(userId)',
      }),
    );
  }

  async getById(userId: string): Promise<UserProfile | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: getTableName(),
        Key: { userId },
      }),
    );
    return (result.Item as UserProfile | undefined) ?? null;
  }

  async listByRole(role: UserRole): Promise<UserProfile[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: getTableName(),
        IndexName: ROLE_INDEX,
        KeyConditionExpression: '#role = :role',
        ExpressionAttributeNames: { '#role': 'role' },
        ExpressionAttributeValues: { ':role': role },
      }),
    );
    return (result.Items ?? []) as UserProfile[];
  }

  async updateVerification(userId: string, status: VerificationStatus): Promise<void> {
    const now = new Date().toISOString();
    await docClient.send(
      new UpdateCommand({
        TableName: getTableName(),
        Key: { userId },
        UpdateExpression: 'SET verificationStatus = :s, updatedAt = :now',
        ConditionExpression: 'attribute_exists(userId)',
        ExpressionAttributeValues: { ':s': status, ':now': now },
      }),
    );
  }
}

export const userRepository: UserRepository = new DynamoDbUserRepository();
