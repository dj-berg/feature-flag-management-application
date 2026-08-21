## Current Architecture (Tenant-Only)

This document captures the active production and local-development contracts after migration completion.

## Scope

- Consumer authentication and token issuance
- Tenant-scoped API authorization
- Tenant-scoped DynamoDB storage model
- DynamoDB Streams to Kafka publishing
- Kafka to Centrifugo tenant-scoped realtime publish
- Local and consumer app realtime bootstrap and subscription model

## Authentication and Authorization Flow

### Consumer authentication

- Consumers obtain JWTs only from `POST /consumer/auth` (`functions/api/consumerAuth/index.js`).
- Consumer JWTs include tenant scope claims (`accountId`, `appId`) and scoped permissions.
- Consumer JWTs include Centrifugo subscription claims only for the consumer tenant channel.

### API authentication

- API Gateway uses `functions/gateway-authorizer/index.js`.
- The authorizer validates consumer/admin tokens and requires tenant claims.
- Tenant scope and permission context is forwarded to downstream Lambdas.

### API authorization

- `GET /flags` enforces `flags:read` scope and tenant-scope matching.
- `POST /flags` and `DELETE /flags/{flagKey}` enforce `flags:write` scope and tenant-scope matching.
- Cross-account and cross-application attempts are denied and logged.

## Feature Flag Data Model

### DynamoDB table

- Provisioned in `tofu/main.tf` as tenant-aware table.
- Partition key: `pk = ACC#<accountId>#APP#<appId>`
- Sort key: `sk = FLAG#<flagKey>`

### Item shape

- `accountId`, `appId`, `flagKey`, `enabled`, `createdAt`, `updatedAt`, `updatedBy`, optional `description`

## Realtime Model

### Publishing path

- Stream publisher reads DynamoDB stream events and builds tenant-scoped delta payloads.
- Kafka headers include `x-centrifugo-channels` for exactly one tenant channel.
- Centrifugo bridge publishes to the channel supplied by header.

### Channel naming

- Canonical and only supported channel format:
  - `flags:acc:<accountId>:app:<appId>`

### Subscription authorization

- Consumer token grants subscription only to its own tenant channel.
- Unauthorized cross-tenant subscribe attempts are denied by Centrifugo.

## Responsibility Boundaries

- `consumerAuth` Lambda: validates app credentials, issues scoped JWTs.
- `gateway-authorizer` Lambda: validates token and tenant claims.
- Flag Lambdas (`createFlag`, `listFlags`, `deleteFlag`): enforce tenant-scope authorization per request.
- `stream-publisher`: emits tenant-scoped realtime updates.
- Centrifugo bridge: forwards updates to tenant-scoped channels.
- Local apps: call API via consumer auth flow and bootstrap realtime sessions from API-backed identity.
