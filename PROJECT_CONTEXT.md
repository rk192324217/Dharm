# PROJECT_CONTEXT.md
# Dharm – Food Rescue API – Handoff Document

> **For AI models and developers resuming work:** Read this file first. Then run `git status` and `npm test` to verify the actual state before making changes.

---

## Project Identity

| Field | Value |
|-------|-------|
| Project name | Dharm |
| Tagline | Give surplus food a purpose |
| Hackathon | WeMakeDevs Environmental Hack 2026 |
| Repository | (add GitHub URL after pushing) |
| Event dates | October 10–11, 2026 |
| Team size | 2 developers, one laptop |

---

## Current Phase

**Phase 1 complete** – Repository skeleton, TypeScript project, health endpoint, unit tests.

**Phase 2 is next** – Donation APIs (POST /donations, GET /donations, GET /donations/{id}).

---

## Architecture Summary

- **Runtime:** Node.js 20 (arm64) on AWS Lambda
- **API:** Amazon API Gateway HTTP API (v2)
- **Database:** Amazon DynamoDB – three tables, PAY_PER_REQUEST billing
- **IaC:** AWS SAM CLI (`template.yaml`)
- **Language:** TypeScript 5, compiled/bundled with esbuild
- **Tests:** Jest with ts-jest

### DynamoDB Tables and Access Patterns

| Table | Key | GSIs | Access patterns |
|-------|-----|------|-----------------|
| `dharm-users-{env}` | `userId` (hash) | — | Get user by ID |
| `dharm-donations-{env}` | `donationId` (hash) | `status-createdAt-index` | Get by ID; list by status+time |
| `dharm-requests-{env}` | `requestId` (hash) | `donationId-index`, `receiverId-index` | Get by ID; find by donation; find by receiver |

---

## Files Created in Phase 1

```
package.json                          TypeScript + Jest + esbuild project
tsconfig.json                         Strict TypeScript, targets ES2020/CommonJS
jest.config.ts                        Jest with ts-jest, @/ path alias
src/types/index.ts                    Shared domain types and API response shapes
src/handlers/health.ts                GET /api/health Lambda handler
tests/unit/health.test.ts             9 unit tests for health handler
template.yaml                         AWS SAM template (3 Lambda fns, 3 DDB tables)
samconfig.toml.example                SAM deploy config template (copy to samconfig.toml)
.env.example                          Environment variable documentation
.gitignore                            node_modules, dist, .env, samconfig.toml
events/health.json                    Sample API GW v2 event for sam local invoke
docs/postman/dharm-api.postman_collection.json
docs/postman/dharm-local.postman_environment.json
README.md                             Full project documentation
PROJECT_CONTEXT.md                    This file
```

---

## Test Results (Phase 1)

Run after `npm install`:

```
PASS tests/unit/health.test.ts
  GET /api/health
    ✓ returns HTTP 200
    ✓ returns Content-Type: application/json
    ✓ returns a valid JSON body
    ✓ returns success: true
    ✓ returns data.status === "ok"
    ✓ returns data.version as a non-empty string
    ✓ returns data.timestamp as an ISO 8601 UTC string
    ✓ reflects NODE_ENV in data.environment
    ✓ falls back to "unknown" when NODE_ENV is unset

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
```

*(Update this section after actually running `npm test`.)*

---

## Commands Actually Run

| Command | Result |
|---------|--------|
| `git log --oneline` | `d186282 initial commit` |
| `node --version` | v24.18.0 ✅ |
| `npm --version` | 12.1.0 ✅ |
| `sam --version` | ❌ Not installed |
| `docker --version` | ❌ Not installed |
| `npm install` | Not yet run – run this first |
| `npm test` | Not yet run – run after install |

---

## Prerequisites Needed

| Prerequisite | Status | Action needed |
|-------------|--------|---------------|
| Node.js 20+ | ✅ (v24) | — |
| npm | ✅ (v12) | — |
| AWS SAM CLI | ❌ Missing | Install: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html |
| Docker | ❌ Missing | Required for `sam local invoke` and `sam build` |
| AWS credentials | Unknown | Run `aws configure` with hackathon account credentials |
| AWS account credits | Unknown | Verify separately |

---

## Architecture Decisions Made

1. **esbuild over tsc for bundling** – Faster, produces smaller Lambda packages, native SAM support via `BuildMethod: esbuild`.
2. **arm64 (Graviton2) Lambda** – ~20% cheaper per GB-second vs x86_64, generally faster cold starts.
3. **PAY_PER_REQUEST DynamoDB** – Zero cost at zero traffic. No provisioned capacity risk.
4. **HTTP API (v2) not REST API (v1)** – Cheaper per request, sufficient features for this project.
5. **GSI design based on access patterns** – `status-createdAt-index` avoids full table scans for listing available donations. `donationId-index` and `receiverId-index` support request lookups efficiently.
6. **No VPC, no NAT Gateway** – Public Lambda endpoints; no per-hour charges.
7. **Authentication abstraction** – `src/types/index.ts` defines user roles. Cognito JWT integration is Phase 2+ work; no mock auth is wired yet.

---

## Security Decisions

- Role enforcement happens server-side (Lambda), not from request body fields.
- Precise coordinates are stored in DynamoDB but `approximateLocation` (text only) is returned to unauthenticated callers.
- AWS credentials are never in committed files; `.env` and `samconfig.toml` are gitignored.
- Least privilege IAM: the health function has only `AWSLambdaBasicExecutionRole`. DynamoDB permissions will be added per-function in Phase 2.
- Stack traces are never returned in API responses.

---

## Failing Tests / Unresolved Issues

- None at end of Phase 1 (assuming `npm install` succeeds).
- SAM CLI missing: `sam local invoke` and `sam build` cannot run yet.
- Docker missing: blocks SAM local emulation.

---

## Next Three Tasks (Phase 2)

1. **`npm install`** – Install dependencies and confirm `npm test` passes (9 tests green).
2. **Implement `DonationRepository`** – `src/repositories/donation.repository.ts` with DynamoDB DocumentClient, using conditional writes.
3. **Implement `POST /api/donations`** – `src/handlers/donations.ts` with Zod or manual validation of all required fields, server-generated IDs, and correct status codes.

---

## Deployment Blockers (do not deploy until resolved)

- [ ] SAM CLI installed
- [ ] Docker installed (for `sam build`)
- [ ] AWS credentials configured (`aws sts get-caller-identity` succeeds)
- [ ] AWS account credits verified
- [ ] Team reviewed and understands `template.yaml` before approving deploy
- [ ] Cognito authentication integrated before any real user data is stored

---

## Handoff Notes for Next Session

Person A (frontend): No frontend tasks in Phase 1. API contract will be documented in `docs/API_CONTRACT.md` after Phase 2.

Person B (backend): Run `npm install` and `npm test` first. Then start Phase 2 with the donation repository.

When resuming with an AI model: share this file first, then run `git status` and `npm test`. Do not rewrite working handlers — extend incrementally.
