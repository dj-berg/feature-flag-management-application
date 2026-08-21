# Feature Flag Management Application SDK

Feature flag SDK with a first-class OpenFeature web provider and optional React wrapper.

## 5-minute quickstart (OpenFeature)

Install:

```bash
npm install feature-flag-management-application-sdk @openfeature/web-sdk @openfeature/react-sdk
```

For browser applications, use server bootstrap so the client secret stays on
the server:

```ts
import { OpenFeature } from "@openfeature/web-sdk";
import { FeatureFlagsOpenFeatureProvider } from "feature-flag-management-application-sdk/openfeature";

await OpenFeature.setProviderAndWait(
  new FeatureFlagsOpenFeatureProvider({
    bootstrapStrategy: "server",
  })
);
```

You can also listen for provider readiness:

```ts
import { OpenFeature, ProviderEvents } from "@openfeature/web-sdk";

OpenFeature.addHandler(ProviderEvents.Ready, () => {
  console.log("Feature flags provider ready");
});
```

Then use normal OpenFeature APIs:

```ts
import { OpenFeature } from "@openfeature/web-sdk";

const client = OpenFeature.getClient();
const enabled = client.getBooleanValue("some-flag", false);
```

Or with OpenFeature React:

```tsx
import { useBooleanFlagValue } from "@openfeature/react-sdk";

export function Checkout() {
  const checkoutV2 = useBooleanFlagValue("checkout-v2", false);
  return checkoutV2 ? <NewCheckout /> : <ClassicCheckout />;
}
```

## React wrapper (optional)

```tsx
import { FeatureFlagsProvider } from "feature-flag-management-application-sdk/react";

<FeatureFlagsProvider
  bootstrapStrategy="server"
>
  {children}
</FeatureFlagsProvider>
```

`FeatureFlagsProvider` internally registers the OpenFeature provider and keeps OpenFeature semantics.

## Security model (important)

`clientSecret` is a credential. If you pass it to browser code (for example `NEXT_PUBLIC_*` vars), it is exposed to users.

- Use `bootstrapStrategy: "direct"` only when your threat model allows browser-exposed app credentials.
- Use `bootstrapStrategy: "server"` when `clientSecret` must remain secret.

Server strategy example:

```ts
await OpenFeature.setProviderAndWait(
  new FeatureFlagsOpenFeatureProvider({
    bootstrapStrategy: "server",
  })
);
```

With `server` strategy, browser code does not pass `clientSecret`. Your server provides `/realtime/bootstrap` and keeps credentials server-side.

## Internal runtime behavior

- No consumer-supplied API/auth/realtime URLs are required.
- Provider lifecycle is internal: auth, token caching/refresh, bootstrap snapshot, realtime subscribe, reconnect, backoff/resync.
- Provider emits OpenFeature events through `OpenFeatureEventEmitter`:
  - `PROVIDER_READY` after successful initialization
  - `PROVIDER_ERROR` when init/runtime errors occur
  - `PROVIDER_CONFIGURATION_CHANGED` on flag updates
  - `PROVIDER_STALE` when connection is degraded/reconnecting

## Security decision: browser secret vs server bootstrap

There are two supported patterns:

1. `bootstrapStrategy: "direct"` (default)
   - Pass `clientId` and `clientSecret` in browser code.
   - Provider manages auth and realtime directly.
   - Suitable only when browser credential exposure is acceptable.

2. `bootstrapStrategy: "server"`
   - Browser does not receive `clientSecret`.
   - Your server exposes `/realtime/bootstrap` and keeps credentials server-side.
   - App code stays simple and still does not manage auth/realtime URLs.

Example:

```ts
new FeatureFlagsOpenFeatureProvider({
  bootstrapStrategy: "server",
});
```

## Package exports

- `feature-flag-management-application-sdk` - low-level SDK
- `feature-flag-management-application-sdk/openfeature` - OpenFeature web provider
- `feature-flag-management-application-sdk/react` - React wrapper

## Build artifacts

- `dist/index.js` / `dist/index.d.ts`
- `dist/openfeature/index.js` / `dist/openfeature/index.d.ts`
- `dist/react/index.js` / `dist/react/index.d.ts`
- `dist/feature-flags.umd.js`

## Acceptance app (clean Next.js consumer)

See `examples/next-openfeature` for a minimal external-consumer app that:

- Imports `feature-flag-management-application-sdk/openfeature` from an installed package artifact.
- Uses `useBooleanFlagValue("some-flag", false)`.
- Does not configure API/auth/bootstrap/realtime URLs.

Run it against a packed artifact:

```bash
cd consumer-sdk
npm install
npm run build
npm pack

cd ../examples/next-openfeature
npm install
npm install ../../consumer-sdk/feature-flag-management-application-sdk-0.1.0.tgz
npm run validate:imports
npm run build
```
