import {
  ErrorCode,
  OpenFeatureEventEmitter,
  ProviderEvents,
  StandardResolutionReasons,
  type EvaluationContext,
  type JsonValue,
  type Logger,
  type Provider,
  type ResolutionDetails,
} from "@openfeature/web-sdk";
import {
  FeatureFlags,
  type CentrifugeConstructor,
  type FeatureFlagsConnectionState,
} from "../FeatureFlags.js";

type PrimitiveFlagValue = boolean | string | number | JsonValue;

export interface FeatureFlagsOpenFeatureProviderOptions {
  endpoint?: string;
  clientId?: string;
  clientSecret?: string;
  bootstrapStrategy?: "direct" | "server";
  environment?: string;
  pollIntervalMs?: number;
  tokenManagedSubscriptionRetryMs?: number;
  tokenManagedSafetyResyncMs?: number;
  fetchImpl?: typeof fetch;
  CentrifugeCtor?: CentrifugeConstructor;
}

export class FeatureFlagsOpenFeatureProvider implements Provider {
  public readonly runsOn = "client" as const;
  public readonly metadata = { name: "feature-flag-management-application-openfeature" } as const;
  public readonly events = new OpenFeatureEventEmitter();

  private readonly options: FeatureFlagsOpenFeatureProviderOptions;
  private unsubscribe: (() => void) | null = null;
  private ready = false;
  private stale = false;
  private lastConnectionState: FeatureFlagsConnectionState | null = null;
  private flagCache: Record<string, PrimitiveFlagValue> = {};

  constructor(options: FeatureFlagsOpenFeatureProviderOptions) {
    this.options = options;
  }

  async initialize(_context?: EvaluationContext): Promise<void> {
    const strategy = this.options.bootstrapStrategy || "direct";
    const clientId = String(this.options.clientId || "").trim();
    const clientSecret = String(this.options.clientSecret || "").trim();

    if (strategy === "direct" && (!clientId || !clientSecret)) {
      const message = "FeatureFlagsOpenFeatureProvider requires clientId and clientSecret for direct bootstrap";
      this.events.emit(ProviderEvents.Error, { message });
      throw new Error(message);
    }

    if (strategy === "server" && !clientId) {
      const message = "FeatureFlagsOpenFeatureProvider requires clientId for server bootstrap";
      this.events.emit(ProviderEvents.Error, { message });
      throw new Error(message);
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.unsubscribe = FeatureFlags.subscribe((event) => {
      this.flagCache = { ...event.flags };
      this.handleConnectionState(event.connectionState);

      if (event.changedKeys.length) {
        this.events.emit(ProviderEvents.ConfigurationChanged, {
          flagsChanged: event.changedKeys,
        });
      }
    });

    try {
      const state = await FeatureFlags.init({
        mode: strategy === "server" ? "bootstrap" : "direct",
        endpoint: strategy === "server" && typeof window !== "undefined" ? this.options.endpoint || window.location.origin : undefined,
        clientId,
        clientSecret,
        environment: this.options.environment,
        pollIntervalMs: this.options.pollIntervalMs,
        tokenManagedSubscriptionRetryMs: this.options.tokenManagedSubscriptionRetryMs,
        tokenManagedSafetyResyncMs: this.options.tokenManagedSafetyResyncMs,
        fetchImpl: this.options.fetchImpl,
        CentrifugeCtor: this.options.CentrifugeCtor,
      });

      this.flagCache = { ...state.flags };
      this.ready = true;
      this.handleConnectionState(state.connectionState);
      this.events.emit(ProviderEvents.Ready, {
        message: "FeatureFlagsOpenFeatureProvider initialized",
      });
    } catch (error: any) {
      const message = String(error?.message || "Failed to initialize feature flag provider");
      this.events.emit(ProviderEvents.Error, { message });
      throw error;
    }
  }

  async onClose(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.ready = false;
    this.stale = false;
    this.lastConnectionState = null;
    this.flagCache = {};
    FeatureFlags.shutdown();
  }

  onContextChange(_oldContext: EvaluationContext, _newContext: EvaluationContext): void {
    this.flagCache = { ...FeatureFlags.getFlags() };
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    _context: EvaluationContext,
    _logger: Logger,
  ): ResolutionDetails<boolean> {
    return this.resolveTyped(flagKey, defaultValue, "boolean");
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    _context: EvaluationContext,
    _logger: Logger,
  ): ResolutionDetails<string> {
    return this.resolveTyped(flagKey, defaultValue, "string");
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    _context: EvaluationContext,
    _logger: Logger,
  ): ResolutionDetails<number> {
    return this.resolveTyped(flagKey, defaultValue, "number");
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    _context: EvaluationContext,
    _logger: Logger,
  ): ResolutionDetails<T> {
    return this.resolveTyped(flagKey, defaultValue, "object");
  }

  private handleConnectionState(connectionState: FeatureFlagsConnectionState): void {
    if (connectionState === this.lastConnectionState) {
      return;
    }

    this.lastConnectionState = connectionState;

    const isStale = connectionState === "degraded" || connectionState === "reconnecting";
    if (connectionState === "degraded") {
      this.events.emit(ProviderEvents.Error, {
        message: "Feature flag provider connection is degraded",
      });
    }

    if (isStale && !this.stale) {
      this.stale = true;
      this.events.emit(ProviderEvents.Stale, {
        message: `Provider connection is ${connectionState}`,
      });
      return;
    }

    if (this.stale && connectionState === "live") {
      this.events.emit(ProviderEvents.Ready, {
        message: "Feature flag provider connection recovered",
      });
    }

    if (!isStale) {
      this.stale = false;
    }
  }

  private resolveTyped<T extends PrimitiveFlagValue>(
    flagKey: string,
    defaultValue: T,
    expectedType: "boolean" | "string" | "number" | "object",
  ): ResolutionDetails<T> {
    const normalizedKey = String(flagKey || "").trim();

    if (!this.ready) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.PROVIDER_NOT_READY,
        errorMessage: "Provider is not ready",
      };
    }

    if (!normalizedKey || !(normalizedKey in this.flagCache)) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DEFAULT,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `Flag ${normalizedKey || "<empty>"} was not found`,
      };
    }

    const rawValue = this.flagCache[normalizedKey] as PrimitiveFlagValue;
    const rawType = Array.isArray(rawValue) ? "object" : typeof rawValue;
    if (rawType !== expectedType) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: `Flag ${normalizedKey} is ${rawType}, expected ${expectedType}`,
      };
    }

    return {
      value: rawValue as T,
      reason: this.stale ? StandardResolutionReasons.STALE : StandardResolutionReasons.CACHED,
    };
  }
}
