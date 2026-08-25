importScripts("accuracy-engine.js", "account-list-contract.js", "network-payload-parser.js", "debugger-capture.js");

const SNAPSHOT_BUDGET_BYTES = 4 * 1024 * 1024;
const RUN_PROGRESS_PREFIX = "ig_run_progress:tab:";
const automaticCaptureAttempts = new Map();

function getValidTabId(value) {
  const tabId = Number(value);
  return Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
}

function measureApproxBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function getSafeSourceLabel(payload) {
  const profile = getSafeProfile(payload?.profile);
  return `instagram-profile:${profile}`;
}

function getSafeProfile(value) {
  const profile = String(value || "unknown_profile").trim().toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(profile) ? profile : "unknown_profile";
}

function isInstagramTabUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      (parsed.hostname === "instagram.com" || parsed.hostname.endsWith(".instagram.com"));
  } catch {
    return false;
  }
}

function getRunProgressKey(tabId) {
  const key = getValidTabId(tabId);
  return key === null ? "" : `${RUN_PROGRESS_PREFIX}${key}`;
}

function getSafeNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function sanitizeProgressList(value) {
  return {
    expected: getSafeNonNegativeInteger(value?.expected),
    confirmed: getSafeNonNegativeInteger(value?.confirmed),
    assisted: getSafeNonNegativeInteger(value?.assisted),
    candidates: getSafeNonNegativeInteger(value?.candidates)
  };
}

function sanitizeRunProgress(value, tabId) {
  if (!value || typeof value !== "object") return null;
  const safeTabId = getValidTabId(tabId);
  if (safeTabId === null) return null;

  const allowedVerdictCodes = new Set(["CONFIRMED", "REFERENCE_ONLY", "PARTIAL", "RETRY_REQUIRED", "RUNNING", ""]);
  const verdictCode = allowedVerdictCodes.has(value.verdict?.code) ? value.verdict.code : "";
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((item) => typeof item === "string").slice(0, 20).map((item) => item.slice(0, 300))
    : [];

  return {
    schemaVersion: 1,
    tabId: safeTabId,
    runId: String(value.runId || "").slice(0, 100),
    profile: String(value.profile || "unknown_profile").slice(0, 64),
    stage: String(value.stage || "idle").slice(0, 64),
    status: String(value.status || "idle").slice(0, 64),
    updatedAt: value.updatedAt || new Date().toISOString(),
    counts: {
      followers: sanitizeProgressList(value.counts?.followers),
      following: sanitizeProgressList(value.counts?.following),
      mutual: getSafeNonNegativeInteger(value.counts?.mutual),
      followersOnly: getSafeNonNegativeInteger(value.counts?.followersOnly),
      followingOnly: getSafeNonNegativeInteger(value.counts?.followingOnly)
    },
    accounts: globalThis.IGAccountListContract.sanitizeAccounts(value.accounts),
    sources: {
      devtoolsReady: Boolean(value.sources?.devtoolsReady),
      debuggerReady: Boolean(value.sources?.debuggerReady),
      debuggerEvidence: Boolean(value.sources?.debuggerEvidence),
      pageNetworkReady: Boolean(value.sources?.pageNetworkReady),
      domOnly: Boolean(value.sources?.domOnly)
    },
    pagination: {
      followers: {
        recognized: Boolean(value.pagination?.followers?.recognized),
        terminal: Boolean(value.pagination?.followers?.terminal)
      },
      following: {
        recognized: Boolean(value.pagination?.following?.recognized),
        terminal: Boolean(value.pagination?.following?.terminal)
      }
    },
    verdict: {
      code: verdictCode,
      labelKo: String(value.verdict?.labelKo || "").slice(0, 80),
      severity: String(value.verdict?.severity || "info").slice(0, 24),
      reasons: Array.isArray(value.verdict?.reasons)
        ? value.verdict.reasons.filter((item) => typeof item === "string").slice(0, 20).map((item) => item.slice(0, 80))
        : [],
      recommendedActionKo: String(value.verdict?.recommendedActionKo || "").slice(0, 200)
    },
    warnings,
    timeline: Array.isArray(value.timeline)
      ? value.timeline.slice(-8).map((item) => ({
        code: String(item?.code || "event").slice(0, 80),
        at: String(item?.at || "").slice(0, 40)
      }))
      : []
  };
}

function storeRunProgress(message, sender, sendResponse) {
  const tabId = getValidTabId(sender?.tab?.id);
  const key = getRunProgressKey(tabId);
  const progress = sanitizeRunProgress(message.progress, tabId);
  if (!key || !progress || !chrome.storage?.session) {
    sendResponse({ ok: false, error: "invalid-run-progress" });
    return;
  }

  chrome.storage.session.set({ [key]: progress }).then(() => {
    sendResponse({ ok: true, key });
  }).catch((error) => {
    sendResponse({ ok: false, error: error?.message || "run-progress-storage-failed" });
  });
}

async function prepareAutomaticCapture(tabId) {
  await devtoolsTabsHydration;
  if (buildDevtoolsStatePayload(tabId, "collection-start")) {
    const result = { mode: "devtools", ok: true, reason: "devtools-bridge-fresh" };
    automaticCaptureAttempts.set(tabId, result);
    return result;
  }
  const result = await debuggerController.start(tabId);
  const prepared = {
    mode: result.ok ? "debugger" : "fallback",
    ok: result.ok,
    reason: result.reason || "debugger-ready",
    captureSessionId: result.session?.captureSessionId || ""
  };
  automaticCaptureAttempts.set(tabId, prepared);
  return prepared;
}

function startCollectionFromUi(message, sendResponse) {
  const tabId = getValidTabId(message.tabId);
  if (tabId === null) {
    sendResponse({ ok: false, error: "invalid-tab-id" });
    return;
  }

  chrome.tabs.get(tabId).then((tab) => {
    if (!tab?.url || !isInstagramTabUrl(tab.url)) {
      sendResponse({ ok: false, error: "instagram-tab-required" });
      return;
    }

    return prepareAutomaticCapture(tabId).then((capture) => injectInstagramCollector(tabId).then(() => {
      sendResponse({ ok: true, tabId, capture });
    }).catch(async (error) => {
      if (capture.captureSessionId) {
        await debuggerController.stop(tabId, "collector-injection-failed", capture.captureSessionId);
      }
      throw error;
    })).catch((error) => {
      throw error;
    });
  }).catch((error) => {
    sendResponse({ ok: false, error: error?.message || "collection-start-failed" });
  });
}

function sanitizeCollectionDiagnostics(value) {
  if (!value || typeof value !== "object") return value || null;
  if (Array.isArray(value)) {
    return value.map(sanitizeCollectionDiagnostics);
  }

  const sanitized = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "unresolvedRows" || key === "text" || key === "textContent") {
      continue;
    }
    sanitized[key] = typeof item === "object" && item !== null ? sanitizeCollectionDiagnostics(item) : item;
  }
  return sanitized;
}

function compactProvenance(value) {
  if (!value || typeof value !== "object") return null;
  const entries = Object.entries(value).slice(0, 5000);
  return Object.fromEntries(entries.map(([username, info]) => [
    username,
    {
      sources: Array.isArray(info?.sources) ? info.sources.slice(0, 8) : [],
      confidence: info?.confidence || "",
      confidences: Array.isArray(info?.confidences) ? info.confidences.slice(0, 8) : [],
      reasons: Array.isArray(info?.reasons) ? info.reasons.slice(0, 8) : [],
      seenCount: info?.seenCount || 0
    }
  ]));
}

function compactSnapshot(value) {
  if (!value || typeof value !== "object") return null;
  return {
    type: value.type || "",
    confidence: value.confidence || "",
    usernames: Array.isArray(value.usernames) ? value.usernames.slice(0, 5000) : [],
    candidates: Array.isArray(value.candidates) ? value.candidates.slice(0, 1000) : [],
    sourceCounts: value.sourceCounts || null
  };
}

function compactDebugReport(value) {
  if (!value || typeof value !== "object") return null;
  return {
    runId: value.runId || "",
    generatedAt: value.generatedAt || "",
    targetProfile: value.targetProfile || "",
    executionMode: value.executionMode || "",
    followActionEnabled: Boolean(value.followActionEnabled),
    finalDiffPolicy: value.finalDiffPolicy || "",
    rateLimit: value.rateLimit || null,
    overallReliability: value.overallReliability || "",
    trustVerdict: value.trustVerdict || null,
    completion: value.completion || null,
    accuracyMode: value.accuracyMode || null,
    warnings: Array.isArray(value.warnings) ? value.warnings.slice(0, 50) : [],
    followers: value.followers || null,
    following: value.following || null,
    sources: {
      devtoolsBridge: value.sources?.devtoolsBridge || null,
      debuggerBridge: value.sources?.debuggerBridge || null,
      pageNetworkBridge: value.sources?.pageNetworkBridge || null,
      dom: {
        followersEndReason: value.sources?.dom?.followersEndReason || null,
        scrollRecovery: value.sources?.dom?.scrollRecovery || null,
        collectionDiagnostics: sanitizeCollectionDiagnostics(value.sources?.dom?.collectionDiagnostics)
      },
      officialExport: value.sources?.officialExport || { used: false }
    },
    excludedFromDiff: {
      followersCandidates: Array.isArray(value.excludedFromDiff?.followersCandidates) ? value.excludedFromDiff.followersCandidates.slice(0, 1000) : [],
      followingCandidates: Array.isArray(value.excludedFromDiff?.followingCandidates) ? value.excludedFromDiff.followingCandidates.slice(0, 1000) : []
    },
    summaryStatus: value.summaryStatus || null
  };
}

function getSafeRunSnapshot(payload) {
  if (!payload || typeof payload !== "object") return null;

  return {
    profile: getSafeProfile(payload.profile),
    runId: payload.runId || "",
    collectedAt: payload.collectedAt || new Date().toISOString(),
    source: getSafeSourceLabel(payload),
    executionMode: payload.executionMode || "",
    followActionEnabled: Boolean(payload.followActionEnabled),
    finalDiffPolicy: payload.finalDiffPolicy || "",
    accuracyMode: payload.accuracyMode || null,
    followers: Array.isArray(payload.followers) ? payload.followers.slice(0, 5000) : [],
    following: Array.isArray(payload.following) ? payload.following.slice(0, 5000) : [],
    snapshots: {
      followers: compactSnapshot(payload.snapshots?.followers),
      following: compactSnapshot(payload.snapshots?.following)
    },
    provenance: {
      followers: compactProvenance(payload.provenance?.followers),
      following: compactProvenance(payload.provenance?.following)
    },
    candidates: payload.candidates || null,
    diffs: payload.diffs || null,
    trustVerdict: payload.trustVerdict || null,
    completion: payload.completion || null,
    followersCompletion: payload.followersCompletion || payload.completion?.followers || null,
    followingCompletion: payload.followingCompletion || payload.completion?.following || null,
    expectedCounts: payload.expectedCounts || null,
    expectedCountEvidence: payload.expectedCountEvidence || null,
    pagination: payload.pagination || null,
    scroll: payload.scroll || null,
    collectionDiagnostics: sanitizeCollectionDiagnostics(payload.collectionDiagnostics),
    followClicks: payload.followClicks || null,
    debugReport: compactDebugReport(payload.debugReport)
  };
}

function buildMinimalSnapshot(snapshot) {
  return {
    profile: snapshot.profile,
    runId: snapshot.runId,
    collectedAt: snapshot.collectedAt,
    source: snapshot.source,
    followers: (snapshot.followers || []).slice(0, 5000),
    following: (snapshot.following || []).slice(0, 5000),
    expectedCounts: snapshot.expectedCounts || null,
    trustVerdict: snapshot.trustVerdict || null,
    summaryStatus: snapshot.debugReport?.summaryStatus || null
  };
}

function applySnapshotBudget(snapshot, budgetBytes = SNAPSHOT_BUDGET_BYTES) {
  const truncatedSections = [];
  let approxBytes = measureApproxBytes(snapshot);

  const stages = [
    ["provenance", (s) => { s.provenance = { followers: null, following: null }; }],
    ["candidates", (s) => {
      if (s.snapshots?.followers) s.snapshots.followers.candidates = (s.snapshots.followers.candidates || []).slice(0, 200);
      if (s.snapshots?.following) s.snapshots.following.candidates = (s.snapshots.following.candidates || []).slice(0, 200);
      if (s.candidates?.followers) s.candidates.followers = s.candidates.followers.slice(0, 200);
      if (s.candidates?.following) s.candidates.following = s.candidates.following.slice(0, 200);
      if (s.debugReport?.excludedFromDiff) {
        s.debugReport.excludedFromDiff.followersCandidates = (s.debugReport.excludedFromDiff.followersCandidates || []).slice(0, 200);
        s.debugReport.excludedFromDiff.followingCandidates = (s.debugReport.excludedFromDiff.followingCandidates || []).slice(0, 200);
      }
    }],
    ["diagnostics", (s) => {
      s.collectionDiagnostics = null;
      if (s.scroll) {
        s.scroll.followersDiagnostics = (s.scroll.followersDiagnostics || []).slice(-5);
        s.scroll.followingDiagnostics = (s.scroll.followingDiagnostics || []).slice(-5);
      }
      if (s.debugReport?.sources?.dom) s.debugReport.sources.dom.collectionDiagnostics = null;
    }]
  ];

  for (const [name, apply] of stages) {
    if (approxBytes <= budgetBytes) break;
    apply(snapshot);
    truncatedSections.push(name);
    approxBytes = measureApproxBytes(snapshot);
  }

  if (approxBytes > budgetBytes) {
    truncatedSections.push("minimal");
    const minimal = buildMinimalSnapshot(snapshot);
    return { snapshot: minimal, truncatedSections, approxBytes: measureApproxBytes(minimal) };
  }

  return { snapshot, truncatedSections, approxBytes };
}

function buildLastRunRef(key, snapshot, approxBytes) {
  return {
    ref: key,
    profile: snapshot.profile,
    runId: snapshot.runId,
    collectedAt: snapshot.collectedAt,
    approxBytes
  };
}

function buildSnapshotStoragePatch(key, snapshot, approxBytes) {
  return {
    [key]: snapshot,
    "ig_follower_snapshot:lastRun": buildLastRunRef(key, snapshot, approxBytes)
  };
}

const devtoolsTabs = new Map();
const DEVTOOLS_STATE_TTL_MS = 15000;
const DEVTOOLS_TABS_STORAGE_KEY = "ig_devtools_tabs_state:v1";

const devtoolsTabsHydration = (async () => {
  try {
    if (!chrome.storage?.session) return;
    const stored = await chrome.storage.session.get(DEVTOOLS_TABS_STORAGE_KEY);
    const entries = stored?.[DEVTOOLS_TABS_STORAGE_KEY] || {};
    for (const [key, value] of Object.entries(entries)) {
      const tabId = getValidTabId(key);
      if (tabId === null || devtoolsTabs.has(tabId)) continue;
      devtoolsTabs.set(tabId, value);
    }
  } catch (error) {
    console.log("[IG Comparator] devtools state hydration failed:", error?.message || error);
  }
})();

let devtoolsTabsPersistTimer = null;

function schedulePersistDevtoolsTabs() {
  if (!chrome.storage?.session || devtoolsTabsPersistTimer) return;
  devtoolsTabsPersistTimer = setTimeout(() => {
    devtoolsTabsPersistTimer = null;
    const entries = Object.fromEntries(
      Array.from(devtoolsTabs.entries()).slice(0, 20).map(([key, value]) => [String(key), value])
    );
    chrome.storage.session.set({ [DEVTOOLS_TABS_STORAGE_KEY]: entries }).catch(() => {});
  }, 250);
}

function isFreshTimestamp(value, ttlMs = DEVTOOLS_STATE_TTL_MS) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) && Date.now() - time <= ttlMs;
}

function getDevtoolsTabState(tabId) {
  const key = getValidTabId(tabId);
  if (key === null) return null;
  return devtoolsTabs.get(key) || null;
}

function setDevtoolsTabState(tabId, patch) {
  const key = getValidTabId(tabId);
  if (key === null) return null;
  const current = devtoolsTabs.get(key) || {
    tabId: key,
    connected: false,
    portConnected: false,
    contentDelivered: false,
    readyCount: 0,
    statusCount: 0,
    payloadCount: 0,
    lastReadyAt: "",
    lastStatusAt: "",
    lastPayloadAt: "",
    lastContentDeliveredAt: "",
    disconnectedAt: "",
    lastError: "",
    stats: null
  };
  const next = { ...current, ...patch, tabId: key };
  devtoolsTabs.set(key, next);
  // DevTools writes do not wait for hydration; the hydration merge keeps in-memory state authoritative.
  schedulePersistDevtoolsTabs();
  return next;
}

function markDevtoolsMessageState(message) {
  const tabId = getValidTabId(message.tabId);
  if (tabId === null) return null;

  if (message.type === "IG_DEVTOOLS_READY") {
    const current = getDevtoolsTabState(tabId);
    return setDevtoolsTabState(tabId, {
      portConnected: true,
      readyCount: (current?.readyCount || 0) + 1,
      lastReadyAt: message.capturedAt || new Date().toISOString(),
      lastError: ""
    });
  }

  if (message.type === "IG_DEVTOOLS_STATUS") {
    const current = getDevtoolsTabState(tabId);
    return setDevtoolsTabState(tabId, {
      portConnected: true,
      statusCount: (current?.statusCount || 0) + 1,
      lastStatusAt: message.capturedAt || new Date().toISOString(),
      lastError: message.error || current?.lastError || "",
      stats: message.stats || current?.stats || null
    });
  }

  if (message.type === "IG_DEVTOOLS_USERNAMES") {
    const current = getDevtoolsTabState(tabId);
    return setDevtoolsTabState(tabId, {
      portConnected: true,
      payloadCount: (current?.payloadCount || 0) + 1,
      lastPayloadAt: message.capturedAt || new Date().toISOString(),
      lastError: ""
    });
  }

  return getDevtoolsTabState(tabId);
}

function buildDevtoolsStatePayload(tabId, reason = "background-state") {
  const state = getDevtoolsTabState(tabId);
  const hasFreshPort = state?.portConnected && (
    isFreshTimestamp(state.lastReadyAt) ||
    isFreshTimestamp(state.lastStatusAt) ||
    isFreshTimestamp(state.lastPayloadAt)
  );
  if (!hasFreshPort) return null;
  return {
    type: "IG_DEVTOOLS_READY",
    source: "devtools-network",
    schemaVersion: 1,
    reason,
    stats: state.stats || null,
    error: state.lastError || "",
    capturedAt: state.lastReadyAt || state.lastStatusAt || new Date().toISOString()
  };
}

function sanitizeDebuggerPagination(value) {
  if (!value || typeof value !== "object") return null;
  return {
    exactEndpoint: Boolean(value.exactEndpoint),
    itemCount: getSafeNonNegativeInteger(value.itemCount),
    recognized: Boolean(value.recognized),
    hasMore: typeof value.hasMore === "boolean" ? value.hasMore : null,
    terminal: Boolean(value.terminal),
    terminalReason: String(value.terminalReason || "").slice(0, 80)
  };
}

function relayDebuggerPayload(tabId, payload) {
  const safeId = getValidTabId(tabId);
  if (safeId === null) return;
  chrome.tabs.sendMessage(safeId, payload, () => {
    void chrome.runtime.lastError;
  });
}

function relayDebuggerEvidence(evidence) {
  relayDebuggerPayload(evidence.tabId, {
    type: "IG_DEBUGGER_USERNAMES",
    source: "debugger-network",
    schemaVersion: 1,
    captureSessionId: String(evidence.captureSessionId || "").slice(0, 100),
    runId: String(evidence.runId || "").slice(0, 100),
    profile: getSafeProfile(evidence.profile),
    endpoint: String(evidence.endpoint || "instagram:network:candidate").slice(0, 80),
    status: getSafeNonNegativeInteger(evidence.status),
    mimeType: String(evidence.mimeType || "").slice(0, 120),
    usernames: Array.isArray(evidence.usernames) ? evidence.usernames.slice(0, 2000) : [],
    mode: ["followers", "following", "active"].includes(evidence.mode) ? evidence.mode : "unknown",
    confidence: evidence.confidence === "exact" ? "exact" : "candidate",
    pagination: sanitizeDebuggerPagination(evidence.pagination),
    capturedAt: evidence.capturedAt || new Date().toISOString()
  });
}

function relayDebuggerStatus(status) {
  const messageType = status.type === "ready"
    ? "IG_DEBUGGER_READY"
    : (status.type === "detached" ? "IG_DEBUGGER_DETACHED" : "IG_DEBUGGER_STATUS");
  relayDebuggerPayload(status.tabId, {
    type: messageType,
    source: "debugger-network",
    schemaVersion: 1,
    captureSessionId: String(status.captureSessionId || "").slice(0, 100),
    runId: String(status.runId || "").slice(0, 100),
    profile: getSafeProfile(status.profile),
    status: String(status.type || "status").slice(0, 40),
    reason: String(status.reason || "unknown").slice(0, 100),
    error: String(status.error || "").slice(0, 120),
    httpStatus: getSafeNonNegativeInteger(status.httpStatus),
    capturedAt: status.capturedAt || new Date().toISOString()
  });
}

const debuggerController = globalThis.IGDebuggerCapture.createController({
  chromeApi: chrome,
  parser: globalThis.IGNetworkPayloadParser,
  onEvidence: relayDebuggerEvidence,
  onStatus: relayDebuggerStatus
});

function storeRunSnapshot(message, sendResponse) {
  if (!chrome.storage?.session) {
    sendResponse({ ok: false, error: "storage-session-unavailable" });
    return;
  }

  const snapshot = getSafeRunSnapshot(message.payload);
  if (!snapshot) {
    sendResponse({ ok: false, error: "invalid-run-snapshot" });
    return;
  }

  const key = `ig_follower_snapshot:${snapshot.profile}`;
  const budgeted = applySnapshotBudget(snapshot);
  const storageInfo = {
    approxBytes: budgeted.approxBytes,
    truncatedSections: budgeted.truncatedSections,
    budgetBytes: SNAPSHOT_BUDGET_BYTES
  };
  budgeted.snapshot.storage = storageInfo;

  chrome.storage.session.set(buildSnapshotStoragePatch(key, budgeted.snapshot, budgeted.approxBytes)).then(() => {
    sendResponse({ ok: true, key, approxBytes: budgeted.approxBytes, truncatedSections: budgeted.truncatedSections });
  }).catch((error) => {
    const message = error?.message || "";
    if (/quota/i.test(message) && !budgeted.truncatedSections.includes("minimal")) {
      const minimal = buildMinimalSnapshot(budgeted.snapshot);
      const approxBytes = measureApproxBytes(minimal);
      minimal.storage = {
        approxBytes,
        truncatedSections: [...budgeted.truncatedSections, "minimal-after-quota-error"],
        budgetBytes: SNAPSHOT_BUDGET_BYTES
      };
      chrome.storage.session.set(buildSnapshotStoragePatch(key, minimal, approxBytes)).then(() => {
        sendResponse({ ok: true, key, approxBytes, truncatedSections: minimal.storage.truncatedSections });
      }).catch((retryError) => {
        sendResponse({ ok: false, error: retryError?.message || "storage-session-set-failed" });
      });
      return;
    }
    sendResponse({ ok: false, error: message || "storage-session-set-failed" });
  });
}

async function injectInstagramCollector(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["page-network-bridge.js"],
      world: "MAIN"
    });
  } catch (error) {
    console.log("[IG Comparator] page network bridge injection failed:", error?.message || error);
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["accuracy-engine.js", "account-list-contract.js", "main.js"]
  });
}

function buildRelayPayload(message) {
  if (message.type === "IG_DEVTOOLS_READY" || message.type === "IG_DEVTOOLS_STATUS") {
    return {
      type: message.type,
      source: "devtools-network",
      schemaVersion: 1,
      reason: message.reason || "",
      stats: message.stats || null,
      error: message.error || "",
      capturedAt: message.capturedAt || new Date().toISOString()
    };
  }

  if (message.type === "IG_DEVTOOLS_USERNAMES") {
    return {
      type: "IG_DEVTOOLS_USERNAMES",
      source: "devtools-network",
      schemaVersion: 1,
      endpoint: String(message.endpoint || "instagram:network:candidate").slice(0, 80),
      status: message.status || 0,
      mimeType: message.mimeType || "",
      usernames: Array.isArray(message.usernames) ? message.usernames.slice(0, 2000) : [],
      mode: message.mode || "unknown",
      pagination: message.pagination && typeof message.pagination === "object" ? {
        exactEndpoint: Boolean(message.pagination.exactEndpoint),
        itemCount: getSafeNonNegativeInteger(message.pagination.itemCount),
        recognized: Boolean(message.pagination.recognized),
        hasMore: typeof message.pagination.hasMore === "boolean" ? message.pagination.hasMore : null,
        terminal: Boolean(message.pagination.terminal),
        terminalReason: String(message.pagination.terminalReason || "").slice(0, 80)
      } : null,
      capturedAt: message.capturedAt || new Date().toISOString()
    };
  }

  return null;
}

function relayDevtoolsMessageToTab(message, callback) {
  markDevtoolsMessageState(message);

  const tabId = getValidTabId(message.tabId);
  if (tabId === null) {
    callback({ ok: false, error: "invalid-tab-id" });
    return;
  }

  const payload = buildRelayPayload(message);
  if (!payload) {
    callback({ ok: false, error: "unsupported-message-type" });
    return;
  }

  chrome.tabs.sendMessage(tabId, payload, (response) => {
    if (chrome.runtime.lastError) {
      setDevtoolsTabState(tabId, {
        connected: false,
        contentDelivered: false,
        lastError: chrome.runtime.lastError.message || "tabs-send-message-failed"
      });
      callback({
        ok: false,
        error: chrome.runtime.lastError.message || "tabs-send-message-failed"
      });
      return;
    }

    setDevtoolsTabState(tabId, {
      connected: true,
      contentDelivered: true,
      lastContentDeliveredAt: new Date().toISOString(),
      lastError: ""
    });
    callback({ ok: true, response });
  });
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !tab.url || !isInstagramTabUrl(tab.url)) {
    return;
  }

  prepareAutomaticCapture(tab.id).then(() => injectInstagramCollector(tab.id)).catch((error) => {
    console.log("[IG Comparator] injection failed:", error?.message || error);
  });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ig-devtools-network") {
    return;
  }

  let connectedTabId = null;
  port.onDisconnect.addListener(() => {
    if (connectedTabId === null) return;
    setDevtoolsTabState(connectedTabId, {
      connected: false,
      portConnected: false,
      contentDelivered: false,
      disconnectedAt: new Date().toISOString(),
      lastError: "devtools-port-disconnected"
    });
    chrome.tabs.sendMessage(connectedTabId, {
      type: "IG_DEVTOOLS_DISCONNECTED",
      source: "devtools-network",
      schemaVersion: 1,
      reason: "devtools-port-disconnected",
      capturedAt: new Date().toISOString()
    }, () => {
      void chrome.runtime.lastError;
    });
  });

  port.onMessage.addListener((message) => {
    if (!message || message.source !== "devtools-network" || message.schemaVersion !== 1) {
      port.postMessage({
        type: "IG_DEVTOOLS_ACK",
        ok: false,
        error: "invalid-devtools-schema",
        seq: message?.seq || 0,
        ackType: message?.type || "unknown",
        capturedAt: new Date().toISOString()
      });
      return;
    }

    const tabId = getValidTabId(message.tabId);
    if (tabId !== null) connectedTabId = tabId;

    relayDevtoolsMessageToTab(message, (result) => {
      port.postMessage({
        type: "IG_DEVTOOLS_ACK",
        ok: result.ok,
        error: result.error || "",
        response: result.response || null,
        seq: message.seq || 0,
        ackType: message.type || "unknown",
        capturedAt: new Date().toISOString()
      });
    });
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  debuggerController.stop(tabId, "tab-removed").catch(() => {});
  automaticCaptureAttempts.delete(tabId);
  devtoolsTabs.delete(tabId);
  schedulePersistDevtoolsTabs();
  const progressKey = getRunProgressKey(tabId);
  if (progressKey && chrome.storage?.session) {
    chrome.storage.session.remove(progressKey).catch(() => {});
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    debuggerController.stop(tabId, "tab-navigated").catch(() => {});
    automaticCaptureAttempts.delete(tabId);
    devtoolsTabs.delete(tabId);
    schedulePersistDevtoolsTabs();
    const progressKey = getRunProgressKey(tabId);
    if (progressKey && chrome.storage?.session) {
      chrome.storage.session.remove(progressKey).catch(() => {});
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "IG_START_COLLECTION") {
    startCollectionFromUi(message, sendResponse);
    return true;
  }

  if (message.type === "IG_DEBUGGER_BIND") {
    if (message.source !== "instagram-collector" || message.schemaVersion !== 1) {
      sendResponse({ ok: false, reason: "invalid-debugger-bind-schema" });
      return false;
    }
    const tabId = getValidTabId(sender?.tab?.id);
    if (tabId === null) {
      sendResponse({ ok: false, reason: "sender-tab-unavailable" });
      return false;
    }
    const bindResult = debuggerController.bind(tabId, {
      runId: message.runId,
      profile: message.profile
    });
    const preparation = automaticCaptureAttempts.get(tabId);
    sendResponse(bindResult.ok ? bindResult : {
      ...bindResult,
      reason: preparation?.reason || bindResult.reason,
      captureMode: preparation?.mode || "fallback"
    });
    return false;
  }

  if (message.type === "IG_DEBUGGER_STOP") {
    if (message.source !== "instagram-collector" || message.schemaVersion !== 1) {
      sendResponse({ ok: false, reason: "invalid-debugger-stop-schema" });
      return false;
    }
    const tabId = getValidTabId(sender?.tab?.id);
    if (tabId === null) {
      sendResponse({ ok: false, reason: "sender-tab-unavailable" });
      return false;
    }
    debuggerController.stop(
      tabId,
      message.reason || "run-finished",
      String(message.captureSessionId || ""),
      String(message.runId || "")
    ).then((result) => {
      automaticCaptureAttempts.delete(tabId);
      sendResponse(result);
    }).catch((error) => {
      sendResponse({ ok: false, reason: error?.message || "debugger-stop-failed" });
    });
    return true;
  }

  if (message.type === "IG_RUN_PROGRESS") {
    if (message.source !== "instagram-collector" || message.schemaVersion !== 1) {
      sendResponse({ ok: false, error: "invalid-run-progress-schema" });
      return false;
    }
    storeRunProgress(message, sender, sendResponse);
    return true;
  }

  if (message.type === "IG_STORE_RUN_SNAPSHOT") {
    if (
      message.source !== "instagram-collector" ||
      message.schemaVersion !== 1 ||
      getValidTabId(sender?.tab?.id) === null
    ) {
      sendResponse({ ok: false, error: "invalid-run-snapshot-schema" });
      return false;
    }
    storeRunSnapshot(message, sendResponse);
    return true;
  }

  if (message.type === "IG_CONTENT_BRIDGE_READY") {
    const tabId = getValidTabId(sender?.tab?.id);
    if (tabId === null) {
      sendResponse({ ok: false, error: "sender-tab-unavailable" });
      return false;
    }

    devtoolsTabsHydration.then(() => {
      const payload = buildDevtoolsStatePayload(tabId, "content-bridge-ready");
      if (!payload) {
        sendResponse({ ok: true, devtoolsConnected: false });
        return;
      }

      chrome.tabs.sendMessage(tabId, payload, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            ok: false,
            devtoolsConnected: true,
            error: chrome.runtime.lastError.message || "tabs-send-message-failed"
          });
          return;
        }

        sendResponse({ ok: true, devtoolsConnected: true, response });
      });
    }).catch((error) => {
      console.log("[IG Comparator] devtools state hydration wait failed:", error?.message || error);
      sendResponse({ ok: true, devtoolsConnected: false });
    });
    return true;
  }

  if (message.type === "IG_DEVTOOLS_READY" || message.type === "IG_DEVTOOLS_STATUS") {
    const tabId = getValidTabId(message.tabId);
    if (tabId === null) {
      sendResponse({ ok: false, error: "invalid-tab-id" });
      return false;
    }

    relayDevtoolsMessageToTab(message, sendResponse);

    return true;
  }

  if (message.type !== "IG_DEVTOOLS_USERNAMES") {
    return false;
  }

  const tabId = getValidTabId(message.tabId);
  if (tabId === null) {
    sendResponse({ ok: false, error: "invalid-tab-id" });
    return false;
  }

  relayDevtoolsMessageToTab(message, sendResponse);

  return true;
});
