{
  const USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;
  const MAX_BODY_CHARS = 512_000;
  const READY_RETRY_MS = 2000;
  const STATUS_RETRY_MS = 5000;
  const CANDIDATE_URL_RE = /(graphql|friendships|followers|following|\/api\/v1\/|\/web\/friendships)/i;
  const JSON_MIME_RE = /(json|javascript|text\/plain)/i;

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

  function getSafeUrlLabel(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}${parsed.pathname}`;
    } catch {
      return String(url || "").split("?")[0].slice(0, 120);
    }
  }

  function getStatsSnapshot() {
    return { ...stats, pending: pending.size };
  }

  function getInspectedTabId() {
    return chrome.devtools.inspectedWindow.tabId;
  }

  function isInstagramUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" &&
        (parsed.hostname === "instagram.com" || parsed.hostname.endsWith(".instagram.com"));
    } catch {
      return false;
    }
  }

  function isCandidateRequest(request) {
    const url = request?.request?.url || "";
    if (!isInstagramUrl(url)) return false;
    if (!CANDIDATE_URL_RE.test(url)) return false;

    const mimeType = request?.response?.content?.mimeType || request?.response?.mimeType || "";
    if (mimeType && !JSON_MIME_RE.test(mimeType)) return false;

    return true;
  }

  function detectMode(url) {
    let pathname = "";
    try {
      pathname = new URL(String(url || "")).pathname.toLowerCase();
    } catch {
      pathname = String(url || "").split("?")[0].toLowerCase();
    }

    const lower = String(url || "").toLowerCase();
    if (pathname.includes("/followers/")) return "followers";
    if (pathname.includes("/following/")) return "following";
    if (lower.includes("graphql") || lower.includes("friendships") || lower.includes("followers") || lower.includes("following")) return "active";
    return "unknown";
  }

  function looksLikeJsonUserPayload(text) {
    if (!text || typeof text !== "string") return false;
    const trimmed = text.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return false;
    return /"username"|"users"|"items"|"edges"|"nodes"|"data"/.test(trimmed);
  }

  function addUsername(username, targetSet) {
    if (typeof username !== "string") return false;
    const trimmed = username.trim();
    if (!USERNAME_RE.test(trimmed)) return false;
    const before = targetSet.size;
    targetSet.add(trimmed.toLowerCase());
    return targetSet.size > before;
  }

  // [ig-walker:start] 이 블록은 devtools.js / page-network-bridge.js 간 byte-identical 해야 함 (tools/walker-fixtures.mjs가 검증)
  function collectUsernamesFromPayload(payload, targetSet, seen = new WeakSet(), depth = 0, insideListContainer = false) {
    if (!payload || typeof payload !== "object" || seen.has(payload) || depth > 12) {
      return;
    }

    seen.add(payload);

    if (Array.isArray(payload)) {
      payload.forEach((item) => collectUsernamesFromPayload(item, targetSet, seen, depth + 1, insideListContainer));
      return;
    }

    if (insideListContainer && Object.prototype.hasOwnProperty.call(payload, "username")) {
      addUsername(payload.username, targetSet);
    }

    const userListFields = ["users", "items", "edges", "nodes", "data"];
    for (const field of userListFields) {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
      const value = payload[field];

      if (field === "edges" && Array.isArray(value)) {
        value.forEach((edge) => {
          if (edge?.node) collectUsernamesFromPayload(edge.node, targetSet, seen, depth + 1, true);
        });
        continue;
      }

      collectUsernamesFromPayload(value, targetSet, seen, depth + 1, insideListContainer || field !== "data");
    }
  }
  // [ig-walker:end]

  function decodeContent(content, encoding) {
    if (encoding !== "base64") return content || "";
    try {
      const binary = atob(content || "");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return "";
    }
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
        pending.delete(message.seq);
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

  function sendStatus(reason = "heartbeat") {
    stats.statusSent++;
    postToBackground("IG_DEVTOOLS_STATUS", {
      reason,
      error: stats.lastError || ""
    });
  }

  function sendUsernamesToInspectedTab(request, body, encoding) {
    const url = request.request.url || "";
    const mode = detectMode(url);
    if (mode !== "followers" && mode !== "following" && mode !== "active") {
      stats.ignored++;
      return;
    }

    const decodedBody = decodeContent(body, encoding);
    if (!looksLikeJsonUserPayload(decodedBody)) {
      stats.ignored++;
      return;
    }

    if (decodedBody.length > MAX_BODY_CHARS) {
      stats.ignored++;
      stats.lastError = `body-too-large:${decodedBody.length}`;
      console.log("[IG DevTools] body too large, ignored:", getSafeUrlLabel(url), decodedBody.length);
      sendStatus("body-too-large");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(decodedBody);
    } catch {
      stats.ignored++;
      return;
    }

    const usernames = new Set();
    collectUsernamesFromPayload(parsed, usernames);
    if (usernames.size === 0) {
      stats.ignored++;
      return;
    }

    stats.sent++;
    stats.lastCaptureAt = new Date().toISOString();
    postToBackground("IG_DEVTOOLS_USERNAMES", {
      url,
      method: request.request.method || "",
      status: request.response.status || 0,
      mimeType: request.response.content?.mimeType || request.response.mimeType || "",
      usernames: Array.from(usernames),
      mode
    });
    console.log("[IG DevTools] captured JSON response:", getSafeUrlLabel(url), usernames.size, getStatsSnapshot());
  }

  chrome.devtools.network.onRequestFinished.addListener((request) => {
    const requestUrl = request?.request?.url || "";
    const responseStatus = request?.response?.status || 0;
    if (responseStatus === 429 && isInstagramUrl(requestUrl) && CANDIDATE_URL_RE.test(requestUrl)) {
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
    request.getContent((content, encoding) => {
      if (!content) {
        stats.failed++;
        stats.lastError = "empty-response-body";
        console.log("[IG DevTools] empty response body:", getSafeUrlLabel(request.request.url || ""));
        sendStatus("empty-response-body");
        return;
      }

      sendUsernamesToInspectedTab(request, content, encoding || "");
    });
  });

  chrome.devtools.network.onNavigated.addListener((url) => {
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
}
