# Dharm 🍱

> **Give surplus food a purpose.**

Dharm is an urgency-aware food rescue platform built for the **WeMakeDevs Environmental Hack 2026**. It connects restaurants, hotels, bakeries and households that have surplus edible food with verified NGOs and community kitchens that can collect and distribute it — reducing food waste and its environmental impact.

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Running Tests](#running-tests)
- [Postman](#postman)
- [AWS SAM Deployment](#aws-sam-deployment)
- [Cost and Cleanup](#cost-and-cleanup)
- [Known Limitations](#known-limitations)
- [AI Tool Disclosure](#ai-tool-disclosure)

---

## Architecture

```
Browser / Postman
       │
       ▼
Amazon API Gateway HTTP API  (v2)
       │
       ▼
AWS Lambda  (Node.js 20 / arm64 / TypeScript)
  ├── GET  /api/health
  ├── POST /api/donations
  ├── GET  /api/donations
  ├── GET  /api/donations/{donationId}
  ├── POST /api/donations/{donationId}/requests
  ├── POST /api/requests/{requestId}/accept
  ├── POST /api/requests/{requestId}/decline
  ├── POST /api/requests/{requestId}/status
  └── GET  /api/organizations/nearby
       │
       ▼
Amazon DynamoDB  (PAY_PER_REQUEST)
  ├── dharm-users-{env}
  ├── dharm-donations-{env}
  └── dharm-requests-{env}
```

Infrastructure is defined as code in [`template.yaml`](./template.yaml) and deployed with AWS SAM CLI.

**User roles**

| Role | Examples | Key actions |
|------|----------|-------------|
| DONOR | Restaurant, hotel, household | Create donation, accept/decline requests, confirm collection |
| RECEIVER | Verified NGO, shelter, community kitchen | Browse donations, request collection, confirm pickup |

---

## Prerequisites

| Tool | Version needed | Install |
|------|---------------|---------|
| Node.js | ≥ 20 | [nodejs.org](https://nodejs.org) |
| npm | ≥ 10 | Bundled with Node.js |
| AWS SAM CLI | ≥ 1.120 | [SAM install guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) |
| Docker | any | Required by SAM for local Lambda emulation |
| AWS CLI | ≥ 2 | [AWS CLI install](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) |
| Git | any | [git-scm.com](https://git-scm.com) |

> **Note:** SAM CLI and Docker are only needed for local Lambda emulation (`sam local`) and deployment. Unit tests run without either.

---

## Local Setup

```bash
# 1. Clone
git clone <repo-url>
cd Dharm

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env if needed (defaults work for unit tests)

# 4. Type-check
npm run typecheck

# 5. Run tests
npm test
```

---

## Environment Variables

See [`.env.example`](./.env.example) for documentation of all variables.

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | yes | `dev`, `test`, or `prod` |
| `LOG_LEVEL` | yes | `debug`, `info`, `warn`, `error` |
| `DONATIONS_TABLE` | for integration | DynamoDB table name for donations |
| `USERS_TABLE` | for integration | DynamoDB table name for users |
| `REQUESTS_TABLE` | for integration | DynamoDB table name for requests |

**Never** put AWS credentials in `.env`. Use `aws configure`, IAM roles, or AWS SSO.

---

## Running Tests

```bash
# All tests (unit only at Phase 1)
npm test

# Watch mode
npm run test:watch

# With coverage report
npm test -- --coverage

# Type-check without running tests
npm run typecheck
```

---

## Postman

Import both files from [`docs/postman/`](./docs/postman/):

1. `dharm-api.postman_collection.json` – request collection
2. `dharm-local.postman_environment.json` – environment (set `BASE_URL`)

For local testing, set `BASE_URL = http://localhost:3000` (requires SAM CLI + Docker).
For deployed AWS, use the `ApiBaseUrl` printed by `sam deploy`.

---

## AWS SAM Deployment

> ⚠️ **Do not deploy without reviewing expected costs and confirming AWS access.**

```bash
# Prerequisites: SAM CLI installed, AWS credentials configured

# 1. Copy and edit SAM config
cp samconfig.toml.example samconfig.toml
# Edit: region, stack_name

# 2. Build Lambda packages
sam build

# 3. First deploy (interactive – creates samconfig.toml settings)
sam deploy --guided

# 4. Subsequent deploys
sam build && sam deploy

# 5. View live logs
sam logs -n HealthFunction --stack-name dharm-dev --tail

# 6. Test deployed health endpoint
curl $(aws cloudformation describe-stacks \
  --stack-name dharm-dev \
  --query "Stacks[0].Outputs[?OutputKey=='HealthEndpoint'].OutputValue" \
  --output text)
```

---

## Cost and Cleanup

**Expected hackathon-scale costs (very low):**

| Service | Free tier | Pay-as-you-go |
|---------|-----------|---------------|
| Lambda | 1M requests/month | $0.20 / 1M |
| API Gateway HTTP | 1M requests/month | $1.00 / 1M |
| DynamoDB | 25 GB storage, 200M requests/month | $1.25 / 1M writes |

All tables use `PAY_PER_REQUEST` — no charges at zero traffic.

**Teardown (removes all AWS resources):**

```bash
sam delete --stack-name dharm-dev
```

> Teardown **permanently deletes all DynamoDB data**. Back up first if needed.

---

## Known Limitations

- Authentication (Cognito) is not yet integrated (Phase 2+).
- `sam local invoke` requires Docker (not installed on development machine as of Phase 1).
- Address privacy filtering is defined in types but not yet enforced in handlers (Phase 2).
- No rate limiting configured (acceptable for hackathon scale).

---

## AI Tool Disclosure

As permitted by the WeMakeDevs Environmental Hack rules, AI coding assistance was used during development:

- **Antigravity IDE (Gemini / Claude)** – architecture planning, code generation, code review, and test writing.

All generated code was reviewed, understood, and tested by the team. The developers take full responsibility for the implementation.

---

*Built with ❤️ for WeMakeDevs Environmental Hack 2026 · Team Dharm*