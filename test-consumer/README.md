# test-consumer

Minimal browser consumer used to demo SDK-only integration.

## Setup

1. Install dependencies:
   - `npm install`
2. Populate `.env` using onboarding helper (recommended):
   - `npm run setup:from-consumer-app`
3. Or populate `.env` manually with:
   - `FEATURE_FLAGS_API_URL`
   - `CLIENT_ID` (or `CONSUMER_CLIENT_ID`)
   - `CLIENT_SECRET` (or `CONSUMER_CLIENT_SECRET`)
   - `STABLE_CENTRIFUGO_URL` (optional, defaults to `https://realtime.example.invalid`)
   - `PORT` (optional, defaults to `3002`)
4. Start the app:
   - `npm start`
5. Open `http://localhost:3002` (or your configured `PORT`).

Optional preflight:

- `npm run validate` checks that required env values are present before startup.

Note: this app initializes the SDK in direct mode from the browser, so `CLIENT_SECRET` is intentionally exposed for demo purposes only.

## What it demonstrates

- Calls `OpenFeature.setProviderAndWait(new FeatureFlagsOpenFeatureProvider({ clientId, clientSecret }))`
- Uses SDK-managed auth (`/consumer/auth`) and bootstrap (`/flags`)
- Uses SDK-managed realtime connection and updates
- Renders:
  - current connection state
  - all loaded flags with `enabled`/`disabled`

## Manual setup required

- A valid consumer credential pair (`CLIENT_ID`, `CLIENT_SECRET`) must already exist.
- `FEATURE_FLAGS_API_URL` must point to an environment where consumer auth and flags endpoints are reachable.
- Browser calls are proxied through this app server (`/consumer/auth`, `/flags`) to avoid CORS failures against API Gateway during local dev.
- SDK runs in bootstrap mode: credentials stay server-side, browser receives token + snapshot from `/realtime/bootstrap`.
- Centrifuge browser script is loaded from jsDelivr in `public/index.html`; internet access is required unless vendored locally.

## Missing env behavior

- Server startup validates required values and exits with a clear error if any are missing.
- Missing required values: `FEATURE_FLAGS_API_URL`, `CLIENT_ID`/`CONSUMER_CLIENT_ID`, `CLIENT_SECRET`/`CONSUMER_CLIENT_SECRET`.
- Error output points to two fixes:
  - run `npm run setup:from-consumer-app`
  - manually edit `test-consumer/.env`

## Current realtime behavior note

- If realtime remains in `connecting`, verify the stable Centrifugo endpoint is reachable (default `https://realtime.example.invalid`).

## Connection status UX

- The page now stabilizes status messaging:
  - `live` when realtime socket is connected.
  - `ready (polling)` when flags are loaded but websocket has not connected after a short grace period.
  - `degraded` when SDK reports degraded connectivity.
- This reduces noisy/ambiguous `connecting` display while preserving true SDK connection state behavior.

## Verification notes

- Authentication: verified by successful `POST /consumer/auth` token response and initial page load of scoped flags.
- Bootstrap: verified by initial render of all existing flags immediately after SDK init.
- Realtime updates: verified by toggling `sdk-test-realtime` through the API and observing page update from enabled -> disabled in ~606ms (without refresh).
