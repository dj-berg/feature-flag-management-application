# Feature Flag Management Application

AWS-based feature flag platform with tenant-scoped realtime browser updates through Centrifugo.

## Project Status

This repository is a standalone portfolio implementation. It includes a working
feature-flag API, tenant-scoped authentication, a TypeScript/OpenFeature SDK, realtime delivery, local demos,
OpenTofu infrastructure, CI checks, and consumer integration guidance.

Local repository validation passes for builds, SDK tests, consumer smoke tests,
example checks, dependency scanning, and OpenTofu formatting and validation.
This is an architectural demonstration, not a production-certified hosted
service; deployment requires environment-specific security and operational review.

## Repository Map

- `functions/` contains API, authorizer, and DynamoDB Stream-to-Kafka Lambda packages.
- `consumer-sdk/` is the TypeScript SDK and its React/OpenFeature entry points.
- `local-app/` and `consumer-app/` are local Express demonstrations.
- `test-consumer/` is a minimal SDK integration consumer.
- `examples/next-openfeature/` is a Next.js/OpenFeature example and acceptance helper.
- `tofu/` provisions the API, Lambdas, DynamoDB table, IAM, and stream mapping.
- `infra/centrifugo/` provisions Centrifugo on ECS/Fargate with its MSK bridge.
- `docs/` contains architecture, integration, reliability, and readiness documentation.

## Runtime Contracts

The current service stores flags in DynamoDB, publishes tenant-scoped changes through Kafka and Centrifugo, and exposes SSE to the browser apps. The platform's API, JWT claims, DynamoDB schema, Kafka topics, Centrifugo channels, and AWS resource behavior are runtime contracts. Repository-quality changes must preserve them.

## Use It In Another Application

For credential onboarding, SDK installation, OpenFeature evaluation, API flag management, realtime behavior, and production guidance, see:

- [`docs/consumer-integration.md`](docs/consumer-integration.md)
- [`consumer-sdk/README.md`](consumer-sdk/README.md)
- [`examples/next-openfeature/README.md`](examples/next-openfeature/README.md)

## Prerequisites And Setup

Use Node.js 20 or newer and OpenTofu. From a clean clone, install every package dependency with:

```sh
npm run setup
```

This uses the committed lockfiles and does not contact AWS or deploy anything. Copy the relevant template before starting an app:

```sh
cp local-app/.env.example local-app/.env
cp consumer-app/.env.example consumer-app/.env
```

Fill in the values for your environment. Never commit `.env` files or real credentials.

For OpenTofu deployments, provide `jwt_private_key`, `jwt_public_key`, and
`consumer_jwt_public_key` explicitly through a secret-aware variable mechanism.
The configuration intentionally has no usable key defaults. Set
`onboarding_api_key` before using the onboarding route; an empty value
intentionally fails closed and disables onboarding.

## Run The Demos

The local dashboard is the operator-facing view of current flags. The consumer app shows how an end-user application reacts to flag changes. Start them in separate terminals:

```sh
npm run dev:local       # http://localhost:3000
npm run dev:consumer    # http://localhost:3001
```

For the minimal SDK-only consumer, use `test-consumer/.env.example` and run:

```sh
cp test-consumer/.env.example test-consumer/.env
# Set CLIENT_ID, CLIENT_SECRET, and FEATURE_FLAGS_API_URL first
npm run dev:test-consumer # http://localhost:3002
```

These demos require reachable API and realtime services. They are not substitutes for deploying the infrastructure.

## End-To-End Flow

1. Configure a consumer credential and API/realtime URLs in the selected app's `.env`.
2. Start the local dashboard or consumer demo.
3. Create or change a flag through the feature-flag API.
4. The API stores the flag in DynamoDB.
5. DynamoDB Streams sends the change to the stream publisher, which publishes to Kafka.
6. The Centrifugo bridge publishes the tenant-scoped update to connected browsers.
7. The dashboard or consumer app updates without a page refresh.

If you only want to verify the repository after cloning, run `npm run check`; it is credential-free and does not start services.

## Root Validation

From the repository root:

```sh
npm run check          # all credential-free static and package checks
npm run lint           # JavaScript syntax checks
npm run format         # OpenTofu formatting check
npm run security       # audits the existing package lockfiles
```

The aggregate check builds and type-checks the SDK, runs SDK and consumer smoke tests, validates the Next.js example imports/types, and formats/validates both OpenTofu stacks. It does not start servers or contact AWS, Kafka, Centrifugo, or deployed endpoints.

Run infrastructure checks independently when working on a stack:

```sh
npm run check:tofu:main
npm run check:tofu:centrifugo
```

These commands initialize providers with the backend disabled and run validation only. They do not plan, apply, mutate state, or create deployment artifacts.

The Centrifugo deployment requires an ACM certificate in
`centrifugo_alb_certificate_arn`; the ALB redirects HTTP to HTTPS and the public
realtime URL uses WSS. Local applications may still use local HTTP/WS endpoints.

## Local Apps And Live Validation

Run `npm start` from `local-app`, `consumer-app`, or `test-consumer` after configuring the required environment. The local dashboard defaults to port 3000; set `PORT=3001` for the consumer app when running both. Live realtime validation is documented in [`docs/realtime-reliability-validation.md`](docs/realtime-reliability-validation.md) and is intentionally not a pull-request gate.

## Safety

Do not commit `.env`, Terraform/OpenTofu state, plan files, generated Lambda archives, `node_modules`, `dist`, or build output. See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`SECURITY.md`](SECURITY.md).

## Publishing This Portfolio Version

Publish only the reviewed current tree, not this working repository's Git
history. Earlier development history contained environment-specific deployment
artifacts and internal process files, even though the current tree and secret
scans are clean. Use a fresh directory or a new repository with no copied `.git`
directory, then copy the reviewed files and run the checks again before pushing.

Before publishing:

1. Confirm `git status --ignored` contains no credentials, state, plans, archives, or `.env` files that will be copied.
2. Run `npm run check` and `npm run security`.
3. Run `gitleaks detect --source . --redact` on the final snapshot.
4. Search the final snapshot for employer names, internal URLs, account IDs, emails, and environment-specific identifiers.
5. Confirm no real credential has ever been used in the new repository's history.

The repository is suitable as a portfolio code sample after those publication
steps. It is not a hosted service or a production approval; deployment still
requires the staging and production review described in
[`docs/production-readiness.md`](docs/production-readiness.md).

For the complete transfer gate, use [`docs/publication-checklist.md`](docs/publication-checklist.md).

## Next Steps For A New Owner

1. Deploy the stacks into an isolated staging environment with test credentials.
2. Run the staging checklist in [`docs/production-readiness.md`](docs/production-readiness.md).
3. Review the API Gateway onboarding/auth security model and confirm edge protection and rate limiting.
4. Confirm production alarms, dashboards, rollback, and credential-rotation procedures.
5. Resolve or formally accept any remaining security findings before production approval.

## Architecture References

- [`docs/current-architecture.md`](docs/current-architecture.md) describes the current architecture.
- The current architecture and integration documents describe the supported runtime contracts.
- [`docs/realtime-reliability-validation.md`](docs/realtime-reliability-validation.md) is the live reliability runbook.
- [`docs/production-readiness.md`](docs/production-readiness.md) is the staging and production approval checklist.
