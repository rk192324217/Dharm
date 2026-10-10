import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../src/handlers/health';
import type { ApiSuccessResponse, HealthData } from '../../src/types';

/**
 * Unit tests for GET /api/health
 *
 * These tests run entirely in-process — no AWS, no DynamoDB, no SAM needed.
 * The Lambda handler is called directly with a minimal mock event.
 */
describe('GET /api/health', () => {
  // Minimal stub: health handler ignores the event entirely
  const mockEvent = {} as APIGatewayProxyEventV2;

  beforeEach(() => {
    // Reset NODE_ENV before each test to avoid test pollution
    process.env['NODE_ENV'] = 'test';
  });

  it('returns HTTP 200', async () => {
    const result = await handler(mockEvent);
    expect(result).toHaveProperty('statusCode', 200);
  });

  it('returns Content-Type: application/json', async () => {
    const result = await handler(mockEvent);
    expect(result).toHaveProperty('headers');
    // result.headers is Record<string, string> in APIGatewayProxyResultV2
    const headers = (result as { headers?: Record<string, string> }).headers ?? {};
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('returns a valid JSON body', async () => {
    const result = await handler(mockEvent);
    const body = (result as { body?: string }).body ?? '';
    expect(() => JSON.parse(body)).not.toThrow();
  });

  it('returns success: true', async () => {
    const result = await handler(mockEvent);
    const parsed = JSON.parse((result as { body: string }).body) as ApiSuccessResponse<HealthData>;
    expect(parsed.success).toBe(true);
  });

  it('returns data.status === "ok"', async () => {
    const result = await handler(mockEvent);
    const parsed = JSON.parse((result as { body: string }).body) as ApiSuccessResponse<HealthData>;
    expect(parsed.data.status).toBe('ok');
  });

  it('returns data.version as a non-empty string', async () => {
    const result = await handler(mockEvent);
    const parsed = JSON.parse((result as { body: string }).body) as ApiSuccessResponse<HealthData>;
    expect(typeof parsed.data.version).toBe('string');
    expect(parsed.data.version.length).toBeGreaterThan(0);
  });

  it('returns data.timestamp as an ISO 8601 UTC string', async () => {
    const result = await handler(mockEvent);
    const parsed = JSON.parse((result as { body: string }).body) as ApiSuccessResponse<HealthData>;
    const ts = new Date(parsed.data.timestamp);
    expect(ts.toString()).not.toBe('Invalid Date');
    // ISO 8601 strings end with Z (UTC)
    expect(parsed.data.timestamp).toMatch(/Z$/);
  });

  it('reflects NODE_ENV in data.environment', async () => {
    process.env['NODE_ENV'] = 'test';
    const result = await handler(mockEvent);
    const parsed = JSON.parse((result as { body: string }).body) as ApiSuccessResponse<HealthData>;
    expect(parsed.data.environment).toBe('test');
  });

  it('falls back to "unknown" when NODE_ENV is unset', async () => {
    const saved = process.env['NODE_ENV'];
    delete process.env['NODE_ENV'];

    const result = await handler(mockEvent);
    const parsed = JSON.parse((result as { body: string }).body) as ApiSuccessResponse<HealthData>;
    expect(parsed.data.environment).toBe('unknown');

    // Restore
    process.env['NODE_ENV'] = saved;
  });
});
