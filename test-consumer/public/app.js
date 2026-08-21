(function start() {
  const statusEl = document.getElementById("status");
  const statusDetailEl = document.getElementById("statusDetail");
  const flagsEl = document.getElementById("flags");
  const emptyEl = document.getElementById("empty");

  const sdk = window.ConsumerSdk && window.ConsumerSdk.FeatureFlags;
  if (!sdk) {
    statusEl.textContent = "SDK not loaded";
    return;
  }

  const config = window.__APP_CONFIG__ || {};
  const endpoint = window.location.origin;
  const centrifugoUrl = String(config.sdkCentrifugoUrl || config.centrifugoUrl || "").trim();

  const viewState = {
    connectionState: "connecting",
    stateSinceMs: Date.now(),
    flags: {},
    lastStatusText: "",
    lastStatusDetail: "",
  };

  function renderStatus() {
    const flagsCount = Object.keys(viewState.flags || {}).length;
    const elapsed = Date.now() - viewState.stateSinceMs;

    let statusText = "Connection: connecting";
    let detail = "Initializing SDK connection...";

    if (viewState.connectionState === "live") {
      statusText = "Connection: live";
      detail = "Realtime websocket connected.";
    } else if (viewState.connectionState === "reconnecting") {
      statusText = "Connection: reconnecting";
      detail = "Re-establishing realtime websocket...";
    } else if (viewState.connectionState === "degraded") {
      statusText = "Connection: degraded";
      detail =
        flagsCount > 0
          ? "Using last known flags while SDK retries realtime."
          : "SDK could not establish realtime. Check credentials and endpoint config.";
    } else if (flagsCount > 0 && elapsed >= 8000) {
      statusText = "Connection: ready (polling)";
      detail = "Flags are current via SDK fallback polling while realtime connects.";
    }

    if (viewState.lastStatusText !== statusText) {
      statusEl.textContent = statusText;
      viewState.lastStatusText = statusText;
    }

    if (viewState.lastStatusDetail !== detail) {
      statusDetailEl.textContent = detail;
      viewState.lastStatusDetail = detail;
    }
  }

  function renderFlags(flags) {
    const entries = Object.entries(flags || {}).sort(([a], [b]) => a.localeCompare(b));
    flagsEl.innerHTML = "";

    if (!entries.length) {
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;

    entries.forEach(([key, enabled]) => {
      const item = document.createElement("li");
      const state = enabled ? "enabled" : "disabled";
      item.innerHTML = `<strong>${key}</strong>: <span class="${state}">${state}</span>`;
      flagsEl.appendChild(item);
    });
  }

  sdk.subscribe(({ connectionState, flags }) => {
    if (viewState.connectionState !== connectionState) {
      viewState.connectionState = connectionState;
      viewState.stateSinceMs = Date.now();
    }

    viewState.flags = flags || {};
    renderStatus();
    renderFlags(flags);
  });

  const statusTick = setInterval(renderStatus, 2000);

  sdk
    .init({
      endpoint,
      mode: "bootstrap",
    })
    .catch((error) => {
      clearInterval(statusTick);
      statusEl.textContent = `Connection failed: ${error.message}`;
      statusDetailEl.textContent = "Verify FEATURE_FLAGS_API_URL and credentials.";
    });
})();
