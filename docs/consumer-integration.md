# Consumer Integration Guide

This guide explains how an application uses the feature-flag platform. The
platform owns authentication, flag storage, and realtime delivery; the
consumer application evaluates flags and chooses which experience to show.

## 1. Get Consumer Credentials

Each consumer is scoped to an `accountId`, `appId`, and `environment`. An
authorized onboarding request creates a credential pair:

```http
POST /consumer/onboard
Content-Type: application/json
X-Onboarding-Api-Key: <onboarding-key>

{
  "accountId": "acme",
  "appId": "checkout-web",
  "environment": "dev",
  "permissions": ["flags:read", "flags:subscribe"]
}
```

The response contains `clientId` and `clientSecret`. Store the secret in a
server-side secret manager. It is returned only when the credential is
created and must not be committed or exposed to browser code.

## 2. Choose A Browser Security Model

- `server` is recommended. Your server keeps `clientSecret`, authenticates
  with the platform, loads initial flags, and returns a short-lived realtime
  bootstrap payload to the browser.
- `direct` is intended only when exposing the consumer credential in browser
  code is acceptable.

For production applications, use `server`.

## 3. Install The SDK

```bash
npm install feature-flag-management-application-sdk \
  @openfeature/web-sdk \
  @openfeature/react-sdk
```

The package provides `feature-flag-management-application-sdk` for the low-level SDK,
`feature-flag-management-application-sdk/openfeature` for OpenFeature, and
`feature-flag-management-application-sdk/react` for the optional React wrapper.

## 4. Configure OpenFeature

### Server-bootstrap strategy

Keep credentials on the server and expose an application route such as
`/realtime/bootstrap`. The route should authenticate with the platform and
return only the token, initial flags, revision, channel, and realtime URL.

```ts
import { OpenFeature } from "@openfeature/web-sdk";
import { FeatureFlagsOpenFeatureProvider } from "feature-flag-management-application-sdk/openfeature";

await OpenFeature.setProviderAndWait(
  new FeatureFlagsOpenFeatureProvider({
    bootstrapStrategy: "server",
  })
);
```

The complete server-bootstrap example is in
[`examples/next-openfeature`](../examples/next-openfeature/README.md).

### Direct strategy

Use direct mode only for a controlled or non-sensitive environment:

```ts
await OpenFeature.setProviderAndWait(
  new FeatureFlagsOpenFeatureProvider({
    clientId: "<client-id>",
    clientSecret: "<client-secret>",
    bootstrapStrategy: "direct",
  })
);
```

Do not put this secret in `NEXT_PUBLIC_*` or equivalent browser-exposed
configuration for a production application.

## 5. Evaluate A Flag

```ts
import { OpenFeature } from "@openfeature/web-sdk";

const flags = OpenFeature.getClient();
const checkoutV2 = flags.getBooleanValue("checkout-v2", false);
```

Always provide a safe default while the provider is initializing or when the
flag cannot be evaluated. With React:

```tsx
import { useBooleanFlagValue } from "@openfeature/react-sdk";

export function Checkout() {
  const enabled = useBooleanFlagValue("checkout-v2", false);
  return enabled ? <NewCheckout /> : <ClassicCheckout />;
}
```

## 6. Manage Flags Through The API

After obtaining a bearer token with `POST /consumer/auth`, use it to read or
write flags. Consumer credentials should normally receive `flags:read` and
`flags:subscribe`; grant `flags:write` only to trusted management tools.

```http
POST /consumer/auth
Content-Type: application/json

{"clientId":"<client-id>","clientSecret":"<client-secret>"}
```

```http
GET /flags
Authorization: Bearer <access-token>
```

```http
POST /flags
Authorization: Bearer <access-token>
Content-Type: application/json

{"flagKey":"checkout-v2","enabled":true,"description":"New checkout experience"}
```

```http
DELETE /flags/checkout-v2
Authorization: Bearer <access-token>
```

The token scope determines the account and application partition. A request
cannot read or write another tenant's flags by supplying different scope
parameters.

## 7. Understand Realtime Updates

1. The provider loads an initial flag snapshot.
2. It subscribes to the scoped realtime channel.
3. A flag change is stored in DynamoDB.
4. DynamoDB Streams sends the change to the Kafka publisher.
5. Centrifugo delivers the update to connected consumers.
6. OpenFeature emits a configuration-change event.

The SDK handles token refresh, reconnect backoff, stale state, and snapshot
resync. Applications should still provide safe defaults when realtime is
temporarily unavailable.

## 8. Run The Included Example

```bash
npm run setup
cp examples/next-openfeature/.env.example examples/next-openfeature/.env.local
# Set server-only values in examples/next-openfeature/.env.local
npm --prefix examples/next-openfeature run dev
```

The Next.js example is the recommended reference for a clean external
consumer. Local demos are documented in the root README.

## Production Checklist

- Use server bootstrap rather than browser-exposed credentials.
- Store client secrets and signing keys in a secret manager.
- Grant only the permissions the application needs.
- Use HTTPS for API and realtime endpoints.
- Set safe defaults for every flag evaluation.
- Monitor authentication, stale realtime connections, and stream failures.
- Rotate credentials when an application is retired.
