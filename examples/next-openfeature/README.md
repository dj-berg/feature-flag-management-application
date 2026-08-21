# next-openfeature acceptance app

Minimal Next.js external-consumer app for live OpenFeature acceptance.

## Architecture

- Browser uses `FeatureFlagsOpenFeatureProvider` with `bootstrapStrategy: "server"`.
- Browser does not receive `clientSecret`.
- Next.js server route (`GET /realtime/bootstrap`) performs:
  1. `POST <FEATURE_FLAGS_API_URL>/consumer/auth` using `FF_CLIENT_ID` + `FF_CLIENT_SECRET`
  2. `GET <FEATURE_FLAGS_API_URL>/flags` with bearer token
  3. returns `{ token, flags, revision, channel, centrifugoUrl }` to browser

## Where credentials come from

Credentials are never committed. If you have configured `consumer-app/.env`, the
setup helper can copy its values into this app's ignored `.env.local` file.

Populate this app's `.env.local` automatically:

```bash
cd examples/next-openfeature
npm run setup:from-consumer-app
```

This writes server-only values:
- `FEATURE_FLAGS_API_URL`
- `FF_CLIENT_ID`
- `FF_CLIENT_SECRET`

and browser-safe values:
- `NEXT_PUBLIC_FF_BOOTSTRAP_STRATEGY=server`
- `NEXT_PUBLIC_FF_CLIENT_ID=server-bootstrap-client`

Never use `NEXT_PUBLIC_FF_CLIENT_SECRET`; any `NEXT_PUBLIC_*` value is exposed to
the browser bundle.

## Package artifact + app setup

```bash
cd consumer-sdk
npm install
npm run build
npm pack

cd ../examples/next-openfeature
npm install
npm install ../../consumer-sdk/feature-flag-management-application-sdk-0.1.0.tgz
npm run setup:from-consumer-app
```

## Validation commands

```bash
npm run check
npm run validate:imports
npm run build
```

## Run locally

```bash
npm run dev
```

Open `http://localhost:3000` (or next available port).

Expected UI:
- `Flag key: some-flag`
- `Value: true|false`

## Automated live acceptance helper

With app running:

```bash
npm run acceptance:openfeature
```

This performs:
- server-side bootstrap request check against `/realtime/bootstrap`
- `some-flag` write to `false`, readback verify
- `some-flag` write to `true`, readback verify
- validates bootstrap payload does not include client secret

## Manual realtime + reconnect validation

1. Keep app open in browser.
2. Run `npm run acceptance:openfeature` once to ensure `some-flag` exists.
3. Toggle flag in backend:
   - `false` then `true` via local-app UI or API.
4. Confirm page updates without refresh.
5. Simulate disruption (block network or stop realtime endpoint temporarily).
6. Confirm stale -> recovered behavior and live updates resume.
