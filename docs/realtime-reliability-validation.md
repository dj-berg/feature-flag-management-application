# Realtime Reliability Validation Runbook

This runbook validates the connection and publish improvements implemented in phases 1-4.

## Scope

- Browser clients use Centrifugo realtime transport as primary and polling only as fallback.
- Realtime bootstrap tokens are refreshed before expiry for long-lived tabs.
- Stream publisher emits one snapshot per Lambda invocation batch.
- Clients use a stable Centrifugo endpoint configured for the target environment.

## Prerequisites

- `local-app` and `consumer-app` configured with `FEATURE_FLAGS_API_URL`, `CONSUMER_CLIENT_ID`, and `CONSUMER_CLIENT_SECRET`.
- Optional override: `STABLE_CENTRIFUGO_URL` (required for a deployed environment).
- Centrifugo stack deployed and reachable.
- DynamoDB stream publisher Lambda deployed from `tofu/`.

## Quick 10-Minute Validation

1. Start both apps and open browser tabs.
   - `local-app` at `http://localhost:3000`
   - `consumer-app` at `http://localhost:3001` (or configured port)
   - `test-consumer` at `http://localhost:3002` (optional but recommended)
2. Open DevTools Network and filter by `realtime/bootstrap` and `flags`.
3. Idle for 2-3 minutes with no flag changes.
   - Expected: no repetitive `/flags` polling while SSE is live.
4. Change one or more flags in DynamoDB.
   - Expected: both UIs update without page reload.
5. Simulate Centrifugo disruption (restart task or temporary network interruption).
   - Expected: reconnect messages with increasing delay (backoff/jitter).
   - Expected: fallback polling only during reconnect/degraded period.
6. Restore Centrifugo.
   - Expected: clients recover to live state and polling quiets down again.

## Automated Phase 4 Checks

Run from repo root:

1. SDK behavior validation
   - `npm --prefix consumer-sdk run build`
   - `node --test consumer-sdk/test/feature-flags.test.mjs`

   Expected:
   - Connection reaches `live` in healthy state.
   - Realtime publications update flags without page reload.
   - Fallback polling occurs only in `degraded`/reconnect periods.

2. Consumer integration smoke
   - `npm --prefix consumer-app run test:smoke`

   Expected:
   - Browser app loads built SDK and initializes feature flags integration.

3. Stable endpoint sanity check
   - `curl -sS -o /dev/null -w "%{http_code}" "$STABLE_CENTRIFUGO_URL/health"`

   Expected:
   - HTTP status `200`.

## Token Refresh Validation

Use a short TTL to validate quickly:

- Use short-lived tokens in the consumer auth config for quick refresh validation.
- Restart apps.
- Keep tabs open for at least 2 minutes.

Expected:

- `/realtime/bootstrap` is called again before token expiry.
- Realtime reconnects with fresh token automatically.
- No manual page reload needed.

## Stream Noise Validation

Trigger multiple rapid flag writes.

Expected in stream publisher logs:

- One publish per Lambda invocation batch, not one publish per individual record.
- Response body includes `recordsProcessed` and `recordsPublished` values.

## Troubleshooting Signals

- Frequent `/flags` requests during healthy connection:
  - Check client state transitions for `LIVE` vs `RECONNECTING`/`DEGRADED`.
- Session refresh failures:
  - Check app server `/realtime/bootstrap` responses and consumer auth token lifetime settings.
- No realtime updates but polling works:
  - Validate the configured stable endpoint, channel format `flags:acc:<accountId>:app:<appId>`, and Centrifugo service logs.
