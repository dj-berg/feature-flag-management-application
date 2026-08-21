'use client';

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { OpenFeature } from "@openfeature/web-sdk";
import {
  FeatureFlags,
  type FeatureFlagsSubscriptionEvent,
} from "../FeatureFlags.js";
import { FeatureFlagsOpenFeatureProvider } from "../openfeature/FeatureFlagsOpenFeatureProvider.js";
import {
  FeatureFlagsContext,
  type FeatureFlagsProviderProps,
} from "./FeatureFlagsContext.js";

export function FeatureFlagsProvider({
  children,
  endpoint,
  shutdownOnUnmount = true,
  clientId,
  clientSecret,
  bootstrapStrategy,
  environment,
  pollIntervalMs,
  tokenManagedSubscriptionRetryMs,
  tokenManagedSafetyResyncMs,
  fetchImpl,
  CentrifugeCtor,
}: FeatureFlagsProviderProps) {
  const providerConfig = useMemo(
    () => ({
      endpoint,
      clientId,
      clientSecret,
      bootstrapStrategy,
      environment,
      pollIntervalMs,
      tokenManagedSubscriptionRetryMs,
      tokenManagedSafetyResyncMs,
      fetchImpl,
      CentrifugeCtor,
    }),
    [
      endpoint,
      clientId,
      clientSecret,
      bootstrapStrategy,
      environment,
      pollIntervalMs,
      tokenManagedSubscriptionRetryMs,
      tokenManagedSafetyResyncMs,
      fetchImpl,
      CentrifugeCtor,
    ]
  );

  const provider = useMemo(
    () => new FeatureFlagsOpenFeatureProvider(providerConfig),
    [
      providerConfig,
    ]
  );
  const [event, setEvent] = useState<FeatureFlagsSubscriptionEvent>(() => ({
    flags: FeatureFlags.getFlags(),
    changedKeys: [],
    connectionState: FeatureFlags.getConnectionState(),
    initialized: FeatureFlags.isInitialized(),
  }));

  useEffect(() => {
    const unsubscribe = FeatureFlags.subscribe((nextEvent) => {
      setEvent(nextEvent);
    });
    let cancelled = false;

    OpenFeature.setProviderAndWait(provider).catch((error) => {
      if (!cancelled) {
        console.error("[consumer-sdk/react] Failed to initialize feature flags", error);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (shutdownOnUnmount) {
        FeatureFlags.shutdown();
      }
    };
  }, [provider, shutdownOnUnmount]);

  const value = {
    flags: event.flags,
    connectionState: event.connectionState,
    initialized: event.initialized,
    isEnabled: (flagKey: string, defaultValue = false) =>
      Object.prototype.hasOwnProperty.call(event.flags, flagKey) && typeof event.flags[flagKey] === "boolean"
        ? (event.flags[flagKey] as boolean)
        : defaultValue,
  };

  return React.createElement(FeatureFlagsContext.Provider, { value }, children);
}
