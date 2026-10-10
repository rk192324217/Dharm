import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiSuccessResponse, ApiErrorResponse, HealthData } from '../types';

const VERSION = '0.1.0';

/**
 * GET /api/health
 *
 * Returns the service health status and version. This endpoint does not
 * touch DynamoDB and is intentionally cheap to call. API Gateway can use
 * it as a lightweight liveness check.
 *
 * No authentication required.
 */
export const handler = async (
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const body: ApiSuccessResponse<HealthData> = {
      success: true,
      data: {
        status: 'ok',
        version: VERSION,
        environment: process.env['NODE_ENV'] ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  } catch (err) {
    // health handler should never reach here, but handle defensively
    console.error('Health handler unexpected error', err);

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    };

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  }
};
