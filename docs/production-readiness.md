# Production Readiness Runbook

This repository can be statically validated from a clean checkout, but
production approval also requires a deployed staging environment. Do not run
these steps against production until the staging results have been reviewed.

## Current Assessment

The repository is production-prepared from a codebase and developer-workflow
perspective. The documented local gates pass, the SDK and consumer validation
paths work, dependency scanning is clean, and both OpenTofu stacks validate.
The remaining work is release qualification in a real staging environment,
not a broad rewrite of the feature-flag runtime.

## Current Automated Gates

Run from the repository root:

```bash
npm run check
npm run security
```

The checks cover JavaScript syntax, SDK type checking and tests, consumer
smoke tests, the Next.js example, and OpenTofu formatting and validation.
They do not require AWS credentials and do not deploy resources.

Security scans should also cover both OpenTofu stacks and the repository:

```bash
snyk iac test tofu --severity-threshold=high
snyk iac test infra/centrifugo --severity-threshold=high
snyk code test . --severity-threshold=high
gitleaks detect --source . --no-git --redact
```

Do not merge with unresolved high or critical findings unless the owning
security authority has documented an exception.

## Staging Verification

Use a dedicated non-production account, API Gateway stage, DynamoDB tables,
Kafka topic, and Centrifugo deployment. Use test credentials and test keys
only.

### Credential and authorization checks

- Onboard a test application with the approved onboarding control.
- Authenticate with valid credentials and confirm the token has the expected account, app, environment, and permissions.
- Reject invalid credentials, inactive credentials, expired tokens, and malformed requests.
- Confirm a consumer cannot read or write another account or application scope.
- Confirm read-only credentials cannot create or delete flags.
- Confirm onboarding and authentication abuse is rate-limited or protected by the approved edge controls.

### Flag lifecycle checks

- Create a boolean flag and verify the response.
- Read the flag with the scoped consumer token.
- Update the flag from disabled to enabled and back.
- Delete the flag and confirm it is no longer returned.
- Verify invalid flag keys and non-boolean values return safe client errors.

### Realtime checks

- Keep a dashboard or consumer example open while changing a flag.
- Confirm the initial snapshot is correct.
- Confirm the browser receives the update without a refresh.
- Confirm updates remain tenant-scoped.
- Expire or revoke a token and confirm refresh/reconnect behavior is safe.
- Interrupt the realtime endpoint and verify degraded status, backoff, and snapshot resync.
- Restore the endpoint and confirm the consumer returns to the live state.

### Failure and recovery checks

- Verify failed Lambda invocations are visible in logs and alarms.
- Verify DynamoDB Stream retries do not produce incorrect flag state.
- Verify Kafka or Centrifugo failures do not expose credentials or cross-tenant data.
- Verify a failed deployment can be rolled back using the documented process.
- Confirm alarms exist for API errors, authentication failures, stream failures, Kafka publishing failures, and realtime health.

## Required Approval Evidence

Before production release, retain:

- Passing CI run for the release commit.
- Dependency, IaC, code, and secret-scan results.
- Staging test results for authorization, flag lifecycle, and realtime behavior.
- OpenTofu plan review from the correct environment.
- Rollback and credential-rotation confirmation.
- Named owner approval for unresolved findings or accepted risk.

When this evidence is complete, the project can move from
**production-prepared** to **production-approved**.

## Known Gates Requiring Follow-Up

- The Next.js acceptance example dependency scan is currently clean after upgrading Next.js to `16.3.1`. Continue reviewing this example during routine dependency updates because it is an external-consumer validation surface.
- The main OpenTofu stack intentionally exposes onboarding and authentication routes so the application can perform credential and onboarding-key checks. This design needs explicit security review, rate limiting, and edge protection confirmation before production approval.
- No staging deployment or live AWS/Kafka/Centrifugo verification is performed by the repository checks.
- Local secret scanning requires `gitleaks`; the CI workflow contains the repository secret-scan gate, but the binary is not installed in every development environment.
