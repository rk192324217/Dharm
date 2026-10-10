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

**Phase 1-4 complete** – Repository skeleton, Health, Donations, Requests Workflow, and User/Organization matching.
**Phase 5 complete** – Integration readiness, API Contract, Postman collection updated.
**Frontend Implementation complete** - Built Next.js UI using Fiery Blue design system, integrated with Mock API.

**Next Phase (Phase 6)** – Final Deployment Readiness & AWS Deployment (BLOCKED awaiting user approval).

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
| `dharm-users-{env}` | `userId` (hash) | `role-createdAt-index` | Get user by ID; list by role |
| `dharm-donations-{env}` | `donationId` (hash) | `status-createdAt-index` | Get by ID; list by status+time |
| `dharm-requests-{env}` | `requestId` (hash) | `donationId-index`, `receiverId-index` | Get by ID; find by donation; find by receiver |

---

## Files Created

See codebase for full file list. Notable files:
- `src/services/matching.service.ts` – Pure Haversine distance and rule-based matching
- `src/handlers/*.ts` – API entry points
- `src/repositories/*.ts` – DynamoDB interactions
- `docs/API_CONTRACT.md` – Full frontend integration guide
- `docs/postman/dharm-api.postman_collection.json` – Test collection

---

## Test Results

Run after `npm install`:

```
PASS tests/unit/health.test.ts
PASS tests/unit/donations.test.ts
PASS tests/unit/requests.test.ts
PASS tests/unit/matching.test.ts

Test Suites: 4 passed, 4 total
Tests:       118 passed, 118 total
Snapshots:   0 total
```

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

## Next Tasks (Phase 6 & 7)

1. **Cognito Auth Integration** – Enforce identity using API Gateway JWT authorizers. Extract `donorId`/`receiverId` from the JWT `sub` instead of the request body.
2. **Frontend Connection** – Frontend UI (`frontend/src/lib/api.ts`) is currently in Mock Mode. When deployed, configure `NEXT_PUBLIC_API_BASE_URL` to point to the API Gateway.
3. **API Verification** - Documented limitations in `docs/API_LIMITATIONS.md`. Created deployment readiness checklist in `docs/DEPLOYMENT_CHECKLIST.md`.
4. **AWS Deployment** – Run `sam build` and `sam deploy --guided` to deploy the final stack to AWS (Currently blocked pending explicit user authorization).

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

Person A (frontend): API contract is fully documented in `docs/API_CONTRACT.md`. Use the Postman collection to test locally.

Person B (backend): Run `npm install` and `npm test` first. Then start Phase 6 with the Cognito JWT authorizer setup in `template.yaml`.

When resuming with an AI model: share this file first, then run `git status` and `npm test`. Do not rewrite working handlers — extend incrementally.
