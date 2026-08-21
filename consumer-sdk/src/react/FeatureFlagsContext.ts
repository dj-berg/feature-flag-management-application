import { createContext } from "react";
import type { ReactNode } from "react";
import type { FeatureFlagValue, FeatureFlagsConnectionState } from "../FeatureFlags.js";
import type { FeatureFlagsOpenFeatureProviderOptions } from "../openfeature/FeatureFlagsOpenFeatureProvider.js";

export interface FeatureFlagsContextValue {
  flags: Record<string, FeatureFlagValue>;
  connectionState: FeatureFlagsConnectionState;
  initialized: boolean;
  isEnabled: (flagKey: string, defaultValue?: boolean) => boolean;
}

export interface FeatureFlagsProviderProps extends FeatureFlagsOpenFeatureProviderOptions {
  children: ReactNode;
  shutdownOnUnmount?: boolean;
}

export const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);
