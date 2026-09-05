{
  const READY_RETRY_MS = 2000;
  const STATUS_RETRY_MS = 5000;
  const parser = globalThis.IGNetworkPayloadParser;

  const stats = {
    matched: 0,
    sent: 0,
    ignored: 0,
    failed: 0,
    acked: 0,
    portConnected: false,
    readySent: 0,
    statusSent: 0,
    lastSeq: 0,
    lastAckSeq: 0,
    lastCaptureAt: "",
    lastAckAt: "",
    lastError: "",
    consecutiveFailures: 0,
    navigations: 0,
    lastNavigatedAt: ""
  };

  let port = null;
  const pending = new Map();
  const reading = { followers: 0, following: 0 };
  let navigationEpoch = 0;

  function captureHealth() {
    return Object.fromEntries(["followers", "following"].map((mode) => [mode, {
      pendingCount: reading[mode] + [...pending.values()].filter((item) => item.type === "IG_DEVTOOLS_USERNAMES" && item.mode === mode).length
    }]));
  }

  function getSafeUrlLabel(url) {
    return parser?.getSafeEndpointLabelFromUrl(url) || "instagram:network:candidate";
  }

  function getStatsSnapshot() {
    return { ...stats, pending: pending.size };
  }

  function getInspectedTabId() {
    return chrome.devtools.inspectedWindow.tabId;
  }

  function isCandidateRequest(request) {
    return parser?.isCandidateRequestMetadata({
      url: request?.request?.url || "",
      mimeType: request?.response?.content?.mimeType || request?.response?.mimeType || "",
      resourceType: request?._resourceType || request?.resourceType || ""
    }) === true;
  }

  function connectPort() {
    if (port) return;

    try {
      port = chrome.runtime.connect({ name: "ig-devtools-network" });
      stats.portConnected = true;
      stats.lastError = "";
      stats.consecutiveFailures = 0;
      console.log("[IG DevTools] Port connected.");

      port.onMessage.addListener((message) => {
        if (message?.type !== "IG_DEVTOOLS_ACK") return;
        stats.acked++;
        stats.lastAckSeq = message.seq || 0;
        stats.lastAckAt = message.capturedAt || new Date().toISOString();
        if (!message.ok) {
          stats.lastError = message.error || "relay-failed";
          console.log("[IG DevTools] relay ack failed:", message.ackType, stats.lastError, getStatsSnapshot());
        }
        stats.consecutiveFailures = 0;
        const delivered = pending.get(message.seq);
        pending.delete(message.seq);
        if (delivered?.type === "IG_DEVTOOLS_USERNAMES") {
          sendStatus("capture-progress", message.ok ? "" : delivered.mode);
        }
      });

      port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError?.message || "port-disconnected";
        stats.portConnected = false;
        stats.lastError = error;
        stats.consecutiveFailures++;
        port = null;
        pending.clear();
        console.log("[IG DevTools] Port disconnected:", error);
      });
    } catch (e) {
      stats.portConnected = false;
      stats.lastError = e?.message || "port-connect-failed";
      stats.consecutiveFailures++;
      port = null;
      console.log("[IG DevTools] Port connect failed:", stats.lastError);
    }
  }

  function postToBackground(type, payload = {}) {
    connectPort();
    if (!port) {
      stats.failed++;
      return;
    }

    const seq = ++stats.lastSeq;
    const message = {
      ...payload,
      type,
      source: "devtools-network",
      schemaVersion: 1,
      tabId: getInspectedTabId(),
      seq,
      stats: getStatsSnapshot(),
      capturedAt: new Date().toISOString()
    };

    try {
      pending.set(seq, message);
      port.postMessage(message);
    } catch (e) {
      pending.delete(seq);
      stats.failed++;
      stats.lastError = e?.message || "port-post-failed";
      console.log("[IG DevTools] Port post failed:", type, stats.lastError);
    }
  }

  function sendReady(reason = "heartbeat") {
    stats.readySent++;
    postToBackground("IG_DEVTOOLS_READY", { reason });
  }

  function sendStatus(reason = "heartbeat", failedMode = "") {
    stats.statusSent++;
    postToBackground("IG_DEVTOOLS_STATUS", {
      reason,
      captureHealth: captureHealth(),
      failedMode,
      error: stats.lastError || ""
    });
  }

  function sendUsernamesToInspectedTab(request, body, encoding) {
    const url = request.request.url || "";
    const result = parser?.parseResponse({
      url,
      status: request.response.status || 0,
      mimeType: request.response.content?.mimeType || request.response.mimeType || "",
      resourceType: request?._resourceType || request?.resourceType || "",
      body,
      encoding
    });
    if (!result?.ok) {
      stats.ignored++;
      if (result?.reason === "body-too-large" || result?.reason === "base64-decode-failed") {
        stats.lastError = result.reason;
        console.log("[IG DevTools] response ignored:", getSafeUrlLabel(url), result.reason);
        sendStatus(result.reason);
      }
      sendStatus("response-parse-failed", parser.detectMode(url));
      return;
    }

    const evidence = result.evidence;
    stats.sent++;
    stats.lastCaptureAt = new Date().toISOString();
    postToBackground("IG_DEVTOOLS_USERNAMES", {
      endpoint: evidence.endpoint,
      status: evidence.status,
      mimeType: evidence.mimeType,
      usernames: evidence.usernames,
      mode: evidence.mode,
      pagination: evidence.pagination,
      requestOrder: Date.parse(request.startedDateTime || "") || 0
    });
    console.log("[IG DevTools] captured JSON response:", evidence.endpoint, evidence.usernames.length, getStatsSnapshot());
  }

  chrome.devtools.network.onRequestFinished.addListener((request) => {
    const requestUrl = request?.request?.url || "";
    const responseStatus = request?.response?.status || 0;
    if (responseStatus === 429 && parser?.isCandidateRequestMetadata({
      url: requestUrl,
      mimeType: request?.response?.content?.mimeType || request?.response?.mimeType || "",
      resourceType: request?._resourceType || request?.resourceType || ""
    })) {
      stats.lastError = "rate-limited-429";
      console.log("[IG DevTools] 429 rate limit observed:", getSafeUrlLabel(requestUrl));
      sendStatus("rate-limited");
      stats.ignored++;
      return;
    }

    if (!isCandidateRequest(request)) {
      stats.ignored++;
      return;
    }

    stats.matched++;
    const mode = parser.detectMode(requestUrl);
    const epoch = navigationEpoch;
    if (mode in reading) reading[mode]++;
    sendStatus("capture-progress");
    request.getContent((content, encoding) => {
      if (epoch !== navigationEpoch) return;
      if (mode in reading) reading[mode]--;
      if (!content) {
        stats.failed++;
        stats.lastError = "empty-response-body";
        console.log("[IG DevTools] empty response body:", getSafeUrlLabel(request.request.url || ""));
        sendStatus("empty-response-body", mode);
        return;
      }

      sendUsernamesToInspectedTab(request, content, encoding || "");
      sendStatus("capture-progress");
    });
  });

  chrome.devtools.network.onNavigated.addListener((url) => {
    navigationEpoch++;
    reading.followers = 0;
    reading.following = 0;
    pending.clear();
    stats.navigations++;
    stats.lastNavigatedAt = new Date().toISOString();
    stats.matched = 0;
    stats.sent = 0;
    stats.ignored = 0;
    stats.failed = 0;
    console.log("[IG DevTools] inspected page navigated:", getSafeUrlLabel(url || ""), getStatsSnapshot());
    sendStatus("navigated");
  });

  console.log("[IG DevTools] Network response capture ready. Keep DevTools open, then reload/open Instagram lists.");
  connectPort();
  sendReady("initial");
  sendStatus("initial");
  const MAX_HEARTBEAT_BACKOFF_MS = 30000;
  function heartbeatDelay(baseMs) {
    if (stats.consecutiveFailures === 0) return baseMs;
    return Math.min(baseMs * 2 ** stats.consecutiveFailures, MAX_HEARTBEAT_BACKOFF_MS);
  }
  function scheduleReadyHeartbeat() {
    setTimeout(() => { sendReady("heartbeat"); scheduleReadyHeartbeat(); }, heartbeatDelay(READY_RETRY_MS));
  }
  function scheduleStatusHeartbeat() {
    setTimeout(() => { sendStatus("heartbeat"); scheduleStatusHeartbeat(); }, heartbeatDelay(STATUS_RETRY_MS));
  }
  scheduleReadyHeartbeat();
  scheduleStatusHeartbeat();

  chrome.devtools.panels.create("IG Comparator", "", "devtools-panel.html");
}
