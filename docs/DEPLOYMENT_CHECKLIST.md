# AWS Deployment Readiness Checklist

This checklist must be completed before deploying the Dharm backend to AWS Production.

## 1. Infrastructure configuration (AWS SAM)
- [ ] Verify `template.yaml` defines appropriate memory and timeout values for all Lambda functions.
- [ ] Verify DynamoDB table configurations (BillingMode: PAY_PER_REQUEST, PointInTimeRecovery enabled).
- [ ] Ensure IAM policies strictly follow the principle of least privilege (e.g., `DynamoDBCrudPolicy` scoped to specific tables).

## 2. Security & Authentication
- [ ] Deploy Amazon Cognito User Pool and App Client.
- [ ] Configure API Gateway to use Cognito User Pool Authorizer.
- [ ] Update Lambda handlers to extract user identity from `event.requestContext.authorizer`.
- [ ] Implement CORS restrictions in API Gateway (restrict to production frontend domain).

## 3. Environment & Secrets Management
- [ ] Configure `NEXT_PUBLIC_API_BASE_URL` in the frontend production environment variables (e.g., Vercel or AWS Amplify).
- [ ] Store sensitive backend configurations (if any, like third-party API keys) in AWS Systems Manager Parameter Store or Secrets Manager.

## 4. CI/CD & Testing
- [ ] Ensure all 118+ unit tests pass in the build pipeline (`npm test`).
- [ ] Add integration tests running against a staging API Gateway.
- [ ] Set up frontend automated testing (Jest + React Testing Library).

## 5. Observability
- [ ] Enable X-Ray tracing for API Gateway and Lambda in `template.yaml` (`Tracing: Active`).
- [ ] Configure CloudWatch Alarms for Lambda errors, API Gateway 4XX/5XX responses, and DynamoDB throttles.
- [ ] Ensure structured JSON logging is used across all Lambda functions for easy CloudWatch Log Insights querying.

## 6. Frontend Deployment
- [ ] Run `npm run build` locally and resolve any strict TypeScript/ESLint errors.
- [ ] Deploy the `frontend/` directory to a hosting provider (AWS Amplify Hosting or Vercel).
- [ ] Verify the deployed frontend successfully connects to the deployed API Gateway endpoint.
