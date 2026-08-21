const { useEffect, useMemo, useRef, useState } = React;

const CONNECTION_STATES = Object.freeze({
  CONNECTING: "connecting",
  LIVE: "live",
  RECONNECTING: "reconnecting",
  DEGRADED: "degraded",
});

const FALLBACK_POLL_INTERVAL_MS = 5000;
const CONNECTING_GRACE_PERIOD_MS = 12000;

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function resolveSessionScopeFromToken(token) {
  const claims = decodeJwtPayload(token);
  if (!claims) {
    return null;
  }

  const accountId = String(claims.accountId || claims.account_id || "").trim();
  const appId = String(claims.appId || claims.application_id || "").trim();
  const channels = Array.isArray(claims.channels) ? claims.channels.filter(Boolean) : [];
  const channel = typeof channels[0] === "string" ? channels[0] : "";

  if (!accountId || !appId || !channel) {
    return null;
  }

  return {
    accountId,
    appId,
    channel,
  };
}

function toWebsocketEndpoint(baseUrl) {
  const url = new URL(baseUrl);
  if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol === "http:") {
    url.protocol = "ws:";
  }

  const normalizedPath = url.pathname.replace(/\/$/, "");
  if (!normalizedPath.endsWith("/connection/websocket")) {
    url.pathname = `${normalizedPath}/connection/websocket`;
  } else {
    url.pathname = normalizedPath;
  }

  url.search = "";
  url.hash = "";
  return url.toString();
}

function toDescription(flagKey) {
  return flagKey
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

const RUNTIME_CENTRIFUGO_URL = String(window.__APP_CONFIG__?.centrifugoUrl || "").trim();

function App() {
  const [statusText, setStatusText] = useState("Connection: Connecting...");
  const [statusLive, setStatusLive] = useState(false);
  const [project, setProject] = useState("-");
  const [env, setEnv] = useState("-");
  const [lastUpdatedText, setLastUpdatedText] = useState("Waiting for data...");
  const [lastPublicationText, setLastPublicationText] = useState("No realtime push received yet.");
  const [flags, setFlags] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortSelect, setSortSelect] = useState("name-asc");
  const [togglesInFlight, setTogglesInFlight] = useState(new Set());
  const [flagDescriptions, setFlagDescriptions] = useState({});
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createFlagKey, setCreateFlagKey] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createEnabled, setCreateEnabled] = useState(true);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");

  const currentFlagsRef = useRef({});
  const flagUpdatedAtRef = useRef({});
  const flagRevisionsRef = useRef({});
  const currentRevisionRef = useRef(0);
  const connectionStateRef = useRef(CONNECTION_STATES.CONNECTING);
  const shouldResyncAfterReconnectRef = useRef(false);
  const hasConnectedOnceRef = useRef(false);
  const centrifugeRef = useRef(null);
  const tokenScopeRef = useRef(null);
  const connectingStartedAtRef = useRef(0);

  const summary = useMemo(() => {
    const entries = Object.entries(flags || {});
    const total = entries.length;
    const enabled = entries.filter(([, value]) => Boolean(value)).length;
    const disabled = total - enabled;
    const enabledPct = total ? Math.round((enabled / total) * 100) : 0;
    const disabledPct = total ? 100 - enabledPct : 0;

    return {
      total,
      enabled,
      disabled,
      enabledPct,
      disabledPct,
    };
  }, [flags]);

  const visibleEntries = useMemo(() => {
    const entries = Object.entries(flags || {}).map(([key, value]) => {
      const updated = flagUpdatedAtRef.current[key] || Date.now();
      return {
        key,
        enabled: Boolean(value),
        description: flagDescriptions[key] || toDescription(key),
        updated,
      };
    });

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      const statusMatches =
        statusFilter === "all" ||
        (statusFilter === "enabled" && entry.enabled) ||
        (statusFilter === "disabled" && !entry.enabled);

      const searchMatches =
        !normalizedSearch ||
        entry.key.toLowerCase().includes(normalizedSearch) ||
        entry.description.toLowerCase().includes(normalizedSearch);

      return statusMatches && searchMatches;
    });

    filtered.sort((a, b) => {
      if (sortSelect === "name-desc") {
        return b.key.localeCompare(a.key);
      }

      if (sortSelect === "updated-desc") {
        return b.updated - a.updated;
      }

      return a.key.localeCompare(b.key);
    });

    return filtered;
  }, [flags, flagDescriptions, searchTerm, statusFilter, sortSelect]);

  function setConnectionState(nextState) {
    connectionStateRef.current = nextState;
  }

  function setStatus(text, live) {
    setStatusText(text);
    setStatusLive(Boolean(live));
  }

  function renderMeta(scope) {
    if (!scope) {
      setProject("-");
      setEnv("-");
      return;
    }

    setProject(scope.accountId || "-");
    setEnv(scope.appId || "-");
  }

  function mergeFlags(newFlags, options = {}) {
    const preserveUpdatedAt = Boolean(options.preserveUpdatedAt);
    const now = Date.now();
    const previous = currentFlagsRef.current;
    const incoming = newFlags || {};

    Object.keys(previous).forEach((key) => {
      if (!(key in incoming)) {
        delete flagUpdatedAtRef.current[key];
        delete flagRevisionsRef.current[key];
      }
    });

    Object.entries(incoming).forEach(([key, value]) => {
      if (!(key in previous) || previous[key] !== value) {
        if (!preserveUpdatedAt || !flagUpdatedAtRef.current[key]) {
          flagUpdatedAtRef.current[key] = now;
        }
      } else if (!flagUpdatedAtRef.current[key]) {
        flagUpdatedAtRef.current[key] = now;
      }
    });

    currentFlagsRef.current = incoming;
    setFlags(incoming);
    setFlagDescriptions((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (!(key in incoming)) {
          delete next[key];
        }
      });
      return next;
    });
    setLastUpdatedText(new Date(now).toLocaleString());
  }

  function applySnapshot(snapshot) {
    if (!snapshot || !snapshot.flags) {
      return false;
    }

    const snapshotRevision = Number(snapshot.revision) || Date.now();
    if (snapshotRevision < currentRevisionRef.current) {
      return false;
    }

    currentRevisionRef.current = snapshotRevision;

    const nextFlagRevisions = {};
    Object.keys(snapshot.flags).forEach((flagKey) => {
      nextFlagRevisions[flagKey] = snapshotRevision;
    });

    flagRevisionsRef.current = nextFlagRevisions;
    mergeFlags(snapshot.flags, { preserveUpdatedAt: true });
    if (snapshot.descriptions && typeof snapshot.descriptions === "object") {
      setFlagDescriptions((prev) => {
        const next = {};
        Object.keys(snapshot.flags).forEach((flagKey) => {
          if (typeof snapshot.descriptions[flagKey] === "string") {
            next[flagKey] = snapshot.descriptions[flagKey];
          } else if (typeof prev[flagKey] === "string") {
            next[flagKey] = prev[flagKey];
          }
        });
        return next;
      });
    }
    return true;
  }

  function applyDeltaPayload(payload) {
    if (!payload || !Array.isArray(payload.changes)) {
      return false;
    }

    const payloadRevision = Number(payload.revision) || 0;
    if (payloadRevision && payloadRevision <= currentRevisionRef.current) {
      return false;
    }

    const nextFlags = { ...currentFlagsRef.current };
    let hasChanges = false;
    let maxRevision = Math.max(currentRevisionRef.current, payloadRevision);

    payload.changes.forEach((change) => {
      if (!change || typeof change.flagKey !== "string") {
        return;
      }

      const changeRevision = Number(change.revision) || payloadRevision || Date.now();
      const previousRevision = Number(flagRevisionsRef.current[change.flagKey]) || 0;

      if (changeRevision <= previousRevision) {
        return;
      }

      maxRevision = Math.max(maxRevision, changeRevision);

      if (change.deleted) {
        if (change.flagKey in nextFlags) {
          delete nextFlags[change.flagKey];
          hasChanges = true;
        }

        delete flagRevisionsRef.current[change.flagKey];
        delete flagUpdatedAtRef.current[change.flagKey];
        return;
      }

      const nextEnabled = Boolean(change.enabled);
      if (nextFlags[change.flagKey] !== nextEnabled) {
        hasChanges = true;
      }

      nextFlags[change.flagKey] = nextEnabled;
      flagRevisionsRef.current[change.flagKey] = changeRevision;
      flagUpdatedAtRef.current[change.flagKey] = changeRevision;
    });

    if (!hasChanges) {
      return false;
    }

    currentRevisionRef.current = maxRevision;
    mergeFlags(nextFlags, { preserveUpdatedAt: true });
    return true;
  }

  function applyRealtimePayload(payload) {
    if (!payload || typeof payload !== "object") {
      return false;
    }

    if (payload.flags) {
      return applySnapshot(payload);
    }

    if (payload.changes) {
      return applyDeltaPayload(payload);
    }

    return false;
  }

  async function fetchSession() {
    const response = await fetch("/realtime/bootstrap", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Session request failed with status ${response.status}`);
    }

    return response.json();
  }

  async function fetchLatestSnapshot() {
    const response = await fetch("/flags", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Snapshot request failed with status ${response.status}`);
    }

    const snapshot = await response.json();
    applySnapshot(snapshot);
  }

  async function resyncSnapshotAfterReconnect() {
    await fetchLatestSnapshot();
    shouldResyncAfterReconnectRef.current = false;
  }

  async function toggleFlag(flagKey, nextEnabled) {
    setTogglesInFlight((prev) => {
      const next = new Set(prev);
      next.add(flagKey);
      return next;
    });

    try {
      const response = await fetch(`/flags/${encodeURIComponent(flagKey)}/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: nextEnabled }),
      });

      if (!response.ok) {
        let message = `Toggle failed with status ${response.status}`;
        try {
          const body = await response.json();
          if (body && body.error) {
            message = body.error;
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }

      await fetchLatestSnapshot();
    } finally {
      setTogglesInFlight((prev) => {
        const next = new Set(prev);
        next.delete(flagKey);
        return next;
      });
    }
  }

  async function deleteFlag(flagKey) {
    setTogglesInFlight((prev) => {
      const next = new Set(prev);
      next.add(flagKey);
      return next;
    });

    try {
      const response = await fetch(`/flags/${encodeURIComponent(flagKey)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        let message = `Delete failed with status ${response.status}`;
        try {
          const body = await response.json();
          if (body && body.error) {
            message = body.error;
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }

      await fetchLatestSnapshot();
    } finally {
      setTogglesInFlight((prev) => {
        const next = new Set(prev);
        next.delete(flagKey);
        return next;
      });
    }
  }

  async function createFlag(event) {
    event.preventDefault();
    const nextFlagKey = createFlagKey.trim();
    const nextDescription = createDescription.trim();

    if (!nextFlagKey) {
      setCreateError("Flag Key is required.");
      return;
    }

    if (typeof createEnabled !== "boolean") {
      setCreateError("Enabled is required.");
      return;
    }

    setCreateSaving(true);
    setCreateError("");

    try {
      const response = await fetch("/flags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          flagKey: nextFlagKey,
          description: nextDescription,
          enabled: createEnabled,
        }),
      });

      if (!response.ok) {
        let message = `Create failed with status ${response.status}`;
        try {
          const body = await response.json();
          if (body && (body.error || body.message)) {
            message = body.error || body.message;
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }

      setIsCreateModalOpen(false);
      setCreateFlagKey("");
      setCreateDescription("");
      setCreateEnabled(true);
      await fetchLatestSnapshot();
    } catch (error) {
      setCreateError(error?.message || "Failed to create flag.");
    } finally {
      setCreateSaving(false);
    }
  }

  useEffect(() => {
    let isMounted = true;
    const fallbackPollTimer = setInterval(() => {
      if (!isMounted) {
        return;
      }

      if (
        connectionStateRef.current !== CONNECTION_STATES.DEGRADED &&
        connectionStateRef.current !== CONNECTION_STATES.RECONNECTING
      ) {
        return;
      }

      fetchLatestSnapshot().catch((error) => {
        console.error("Fallback snapshot poll error:", error);
      });
    }, FALLBACK_POLL_INTERVAL_MS);

    const connectingWatchdogTimer = setInterval(() => {
      if (!isMounted) {
        return;
      }

      if (connectionStateRef.current !== CONNECTION_STATES.CONNECTING) {
        return;
      }

      if (!connectingStartedAtRef.current) {
        return;
      }

      if (Date.now() - connectingStartedAtRef.current < CONNECTING_GRACE_PERIOD_MS) {
        return;
      }

      setConnectionState(CONNECTION_STATES.DEGRADED);
      setStatus("Connection: Realtime unavailable, using fallback", false);
    }, 1000);

    async function start() {
      if (!window.Centrifuge) {
        throw new Error("Centrifuge SDK is not loaded");
      }

      const { Centrifuge } = window;
      let session = await fetchSession();
      const scope = resolveSessionScopeFromToken(session.token || "");
      tokenScopeRef.current = scope;
      const jwtPayload = decodeJwtPayload(session.token || "");
      if (scope) {
        console.log("Session tenant scope:", scope.accountId, scope.appId, scope.channel);
      }
      if (jwtPayload && jwtPayload.exp) {
        const remainingSeconds = jwtPayload.exp - Math.floor(Date.now() / 1000);
        console.log("Session token remaining seconds:", remainingSeconds);
      }

      if (!isMounted) {
        return;
      }

      if (!RUNTIME_CENTRIFUGO_URL) {
        throw new Error("Centrifugo URL is missing from runtime config");
      }

      renderMeta(scope);
      applySnapshot(session);

      if (centrifugeRef.current) {
        centrifugeRef.current.disconnect();
        centrifugeRef.current = null;
      }

      const centrifuge = new Centrifuge(toWebsocketEndpoint(RUNTIME_CENTRIFUGO_URL), {
        token: session.token,
        getToken: async () => {
          const nextSession = await fetchSession();
          session = nextSession;
          const nextScope = resolveSessionScopeFromToken(nextSession.token || "");
          tokenScopeRef.current = nextScope;

          if (!isMounted) {
            return nextSession.token;
          }

          renderMeta(nextScope);
          applySnapshot(nextSession);
          return nextSession.token;
        },
      });

      centrifugeRef.current = centrifuge;
      connectingStartedAtRef.current = Date.now();
      const subscription = scope?.channel && typeof centrifuge.getSubscription === "function"
        ? centrifuge.getSubscription(scope.channel)
        : null;

      centrifuge.on("connecting", (ctx) => {
        console.log("Centrifuge connecting:", ctx);
        if (!connectingStartedAtRef.current) {
          connectingStartedAtRef.current = Date.now();
        }

        if (hasConnectedOnceRef.current) {
          shouldResyncAfterReconnectRef.current = true;
          setConnectionState(CONNECTION_STATES.RECONNECTING);
          setStatus(
            `Connection: Reconnecting (${ctx.reason || "connection lost"})...`,
            false
          );
          return;
        }

        setConnectionState(CONNECTION_STATES.CONNECTING);
        setStatus("Connection: Connecting...", false);
      });

      centrifuge.on("connected", () => {
        console.log("Centrifuge connected");
        const didReconnect = hasConnectedOnceRef.current;
        hasConnectedOnceRef.current = true;
        connectingStartedAtRef.current = 0;
        setConnectionState(CONNECTION_STATES.LIVE);
        setStatus("Connection: Live", true);

        if (didReconnect && shouldResyncAfterReconnectRef.current) {
          resyncSnapshotAfterReconnect().catch((error) => {
            console.error("Post-reconnect resync error:", error);
          });
        }
      });

      centrifuge.on("disconnected", (ctx) => {
        console.log("Centrifuge disconnected:", ctx);
        if (!hasConnectedOnceRef.current && !connectingStartedAtRef.current) {
          connectingStartedAtRef.current = Date.now();
        }
        setConnectionState(CONNECTION_STATES.DEGRADED);
        setStatus(`Connection: Disconnected (${ctx.reason || "disconnected"})`, false);
      });

      centrifuge.on("error", (ctx) => {
        console.error("Centrifuge client error:", ctx);
      });

      const handlePublication = (ctx) => {
        setConnectionState(CONNECTION_STATES.LIVE);
        setStatus("Connection: Live", true);
        const payload = ctx && ctx.data;
        const change = payload?.changes?.[0];
        setLastPublicationText(
          change
            ? `push ${scope?.channel}: ${change.flagKey}=${String(change.enabled)}`
            : `push ${scope?.channel}: ${JSON.stringify(payload)}`
        );

        if (!applyRealtimePayload(payload)) {
          console.log("Ignored publication payload:", payload);
        }
      };

      centrifuge.on("publication", handlePublication);
      subscription?.on("publication", handlePublication);

      centrifuge.connect();
    }

    start().catch((error) => {
      console.error(error);
      setConnectionState(CONNECTION_STATES.DEGRADED);
      setStatus("Connection: Reconnecting...", false);
    });

    return () => {
      isMounted = false;
      clearInterval(fallbackPollTimer);
      clearInterval(connectingWatchdogTimer);
      if (centrifugeRef.current) {
        centrifugeRef.current.disconnect();
        centrifugeRef.current = null;
      }
    };
  }, []);

  return (
    <main className="shell">
      <section className="dashboard">
        <header className="header">
          <div>
            <h1>Feature Flag Control</h1>
            <p className="subtitle">
              Monitor feature flags in real time. Current values are loaded automatically whenever changes occur.
            </p>
          </div>

          <div className="header-meta" aria-label="Connection metadata">
            <div className={`status-badge${statusLive ? " status-live" : ""}`}>
              <span className="status-dot"></span>
              <span>{statusText}</span>
            </div>
            <span className="meta-divider" aria-hidden="true"></span>
            <div className="updated">
              Last updated: <span>{lastUpdatedText}</span>
            </div>
            <div data-testid="last-realtime-push">
              Last realtime push: <span>{lastPublicationText}</span>
            </div>
          </div>
        </header>

        <section className="overview" aria-label="Feature flag summary">
          <article className="summary-card summary-total">
            <div className="summary-main">
              <span className="summary-icon icon-flag" aria-hidden="true"></span>
              <div>
                <p className="summary-label">Total flags</p>
                <p className="summary-value">{summary.total}</p>
                <p className="summary-note">Across all environments</p>
              </div>
            </div>
          </article>

          <article className="summary-card summary-good">
            <div className="summary-main">
              <span className="summary-icon icon-check" aria-hidden="true"></span>
              <div>
                <p className="summary-label">Enabled</p>
                <p className="summary-value">{summary.enabled}</p>
                <p className="summary-note">{summary.enabledPct}% of total flags</p>
              </div>
            </div>
          </article>

          <article className="summary-card summary-alert">
            <div className="summary-main">
              <span className="summary-icon icon-close" aria-hidden="true"></span>
              <div>
                <p className="summary-label">Disabled</p>
                <p className="summary-value">{summary.disabled}</p>
                <p className="summary-note">{summary.disabledPct}% of total flags</p>
              </div>
            </div>
          </article>

          <article className="summary-card summary-project">
            <div className="summary-main">
              <span className="summary-icon icon-project" aria-hidden="true"></span>
              <div>
                <p className="summary-label">Project</p>
                <p className="summary-text" id="projectValue">
                  {project}
                </p>
                <p className="summary-note summary-note-meta">Repository scope</p>
              </div>
            </div>
          </article>

          <article className="summary-card summary-env">
            <div className="summary-main">
              <span className="summary-icon icon-env" aria-hidden="true"></span>
              <div>
                <p className="summary-label">Environment</p>
                <p className="summary-text" id="envValue">
                  {env}
                </p>
                <p className="summary-note summary-note-meta">Active target</p>
              </div>
            </div>
          </article>
        </section>

        <section className="table-card">
          <div className="table-header">
            <h2>All Feature Flags</h2>

            <div className="table-controls" role="group" aria-label="Feature flag controls">
              <label className="input-wrap" htmlFor="searchInput">
                <input
                  id="searchInput"
                  type="search"
                  placeholder="Search flags..."
                  autoComplete="off"
                  value={searchTerm}
                  onInput={(event) => setSearchTerm(event.target.value)}
                />
              </label>

              <label className="select-wrap" htmlFor="statusFilter">
                <select
                  id="statusFilter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>

              <label className="select-wrap" htmlFor="sortSelect">
                <select
                  id="sortSelect"
                  value={sortSelect}
                  onChange={(event) => setSortSelect(event.target.value)}
                >
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                  <option value="updated-desc">Recently Updated</option>
                </select>
              </label>

              <button
                type="button"
                className="create-flag-btn"
                onClick={() => {
                  setCreateError("");
                  setIsCreateModalOpen(true);
                }}
              >
                Create Flag
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table aria-label="Feature flags">
              <thead>
                <tr>
                  <th>Feature Flag</th>
                  <th>Description</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.length === 0 ? (
                  <tr>
                    <td className="empty-row" colSpan="4">
                      No feature flags match the current filters.
                    </td>
                  </tr>
                ) : (
                  visibleEntries.map((entry) => {
                    const isLoading = togglesInFlight.has(entry.key);
                    return (
                      <tr key={entry.key}>
                        <td className="flag-name">{entry.key}</td>
                        <td className="flag-description">{entry.description}</td>
                        <td className="flag-updated">{new Date(entry.updated).toLocaleString()}</td>
                        <td>
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <button
                               type="button"
                               role="switch"
                               aria-checked={entry.enabled ? "true" : "false"}
                               aria-label={`${entry.enabled ? "Disable" : "Enable"} ${entry.key}`}
                               className={`flag-switch ${entry.enabled ? "is-on" : "is-off"} ${
                                 isLoading ? "is-loading" : ""
                               }`}
                               disabled={isLoading}
                               onClick={() => {
                                 if (isLoading) {
                                   return;
                                 }

                                 toggleFlag(entry.key, !entry.enabled).catch((error) => {
                                   console.error(error);
                                 });
                               }}
                             >
                               <span className="flag-switch-track" aria-hidden="true">
                                 <span className="flag-switch-thumb"></span>
                               </span>
                               <span className="flag-switch-text">
                                 {isLoading ? "Saving..." : entry.enabled ? "Enabled" : "Disabled"}
                               </span>
                            </button>

                             <button
                                type="button"
                                className={`flag-delete ${isLoading ? "is-loading" : ""}`}
                                disabled={isLoading}
                                aria-label={`Delete ${entry.key}`}
                                onClick={() => {
                                 if (isLoading) {
                                   return;
                                 }

                                 const accepted = window.confirm(
                                   `Delete feature flag \"${entry.key}\"?`
                                 );
                                 if (!accepted) {
                                   return;
                                 }

                                 deleteFlag(entry.key).catch((error) => {
                                   console.error(error);
                                 });
                               }}
                             >
                               {isLoading ? "Deleting..." : "Delete"}
                             </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {isCreateModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (createSaving) {
              return;
            }
            setIsCreateModalOpen(false);
            setCreateError("");
          }}
        >
          <section
            className="create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="createFlagTitle"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="create-modal-header">
              <h3 id="createFlagTitle">Create Feature Flag</h3>
              <p>Only required fields are shown. Tenant scope is derived from your session.</p>
            </header>

            <form className="create-form" onSubmit={createFlag}>
              <label className="create-field" htmlFor="createFlagKey">
                <span>Flag Key</span>
                <input
                  id="createFlagKey"
                  type="text"
                  autoComplete="off"
                  value={createFlagKey}
                  onChange={(event) => setCreateFlagKey(event.target.value)}
                  required
                />
              </label>

              <label className="create-field" htmlFor="createDescription">
                <span>Description</span>
                <input
                  id="createDescription"
                  type="text"
                  autoComplete="off"
                  value={createDescription}
                  onChange={(event) => setCreateDescription(event.target.value)}
                />
              </label>

              <label className="create-toggle" htmlFor="createEnabled">
                <input
                  id="createEnabled"
                  type="checkbox"
                  checked={createEnabled}
                  onChange={(event) => setCreateEnabled(event.target.checked)}
                />
                <span>Enabled</span>
              </label>

              {createError ? <p className="create-error">{createError}</p> : null}

              <div className="create-actions">
                <button
                  type="button"
                  className="create-cancel"
                  disabled={createSaving}
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setCreateError("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="create-submit" disabled={createSaving}>
                  {createSaving ? "Creating..." : "Create Flag"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
