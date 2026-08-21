"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { OpenFeature, ProviderEvents } from "@openfeature/web-sdk";
import { OpenFeatureProvider } from "@openfeature/react-sdk";
import { FeatureFlagsOpenFeatureProvider } from "feature-flag-management-application-sdk/openfeature";

const bootstrapStrategy = process.env.NEXT_PUBLIC_FF_BOOTSTRAP_STRATEGY === "server" ? "server" : "direct";
const clientId = bootstrapStrategy === "server"
  ? process.env.NEXT_PUBLIC_FF_CLIENT_ID || "server-bootstrap-client"
  : process.env.NEXT_PUBLIC_FF_CLIENT_ID || "";
const clientSecret = bootstrapStrategy === "direct"
  ? process.env.NEXT_PUBLIC_FF_CLIENT_SECRET || ""
  : "";

export function FeatureFlagAppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [providerStatus, setProviderStatus] = useState("initializing");
  const [configChangedCount, setConfigChangedCount] = useState(0);
  const provider = useMemo(
    () =>
      new FeatureFlagsOpenFeatureProvider({
        bootstrapStrategy,
        clientId,
        clientSecret,
      }),
    [],
  );

  useEffect(() => {
    let mounted = true;

    const onReady = () => {
      if (mounted) {
        setReady(true);
        setProviderStatus("ready");
      }
    };
    const onStale = () => {
      if (mounted) {
        setProviderStatus("stale");
      }
    };
    const onError = () => {
      if (mounted) {
        setProviderStatus("error");
      }
    };
    const onConfigChanged = () => {
      if (mounted) {
        setConfigChangedCount((value) => value + 1);
      }
    };

    OpenFeature.addHandler(ProviderEvents.Ready, onReady);
    OpenFeature.addHandler(ProviderEvents.Stale, onStale);
    OpenFeature.addHandler(ProviderEvents.Error, onError);
    OpenFeature.addHandler(ProviderEvents.ConfigurationChanged, onConfigChanged);

    OpenFeature.setProviderAndWait(provider).catch((error) => {
      console.error("Failed to initialize provider", error);
    });

    return () => {
      mounted = false;
      OpenFeature.removeHandler(ProviderEvents.Ready, onReady);
      OpenFeature.removeHandler(ProviderEvents.Stale, onStale);
      OpenFeature.removeHandler(ProviderEvents.Error, onError);
      OpenFeature.removeHandler(ProviderEvents.ConfigurationChanged, onConfigChanged);
    };
  }, [provider]);

  if (!ready) {
    return <main>Initializing feature flags provider...</main>;
  }

  return (
    <OpenFeatureProvider>
      <div>
        <p data-testid="provider-status">Provider status: {providerStatus}</p>
        <p data-testid="config-changed-count">Config changed count: {configChangedCount}</p>
      </div>
      {children}
    </OpenFeatureProvider>
  );
}
