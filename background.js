function sendToInstagramTab(tabId, payload, sendResponse) {
  chrome.tabs.sendMessage(tabId, payload, (response) => {
    if (chrome.runtime.lastError) {
      sendResponse({
        ok: false,
        error: chrome.runtime.lastError.message || "tabs-send-message-failed"
      });
      return;
    }

    sendResponse({ ok: true, response });
  });
}

function getValidTabId(value) {
  const tabId = Number(value);
  return Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
}

function getSafeSourceLabel(payload) {
  const profile = payload?.profile || "unknown_profile";
  return `instagram-profile:${profile}`;
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
    overallReliability: value.overallReliability || "",
    accuracyMode: value.accuracyMode || null,
    warnings: Array.isArray(value.warnings) ? value.warnings.slice(0, 50) : [],
    followers: value.followers || null,
    following: value.following || null,
    sources: {
      devtoolsBridge: value.sources?.devtoolsBridge || null,
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
    profile: payload.profile || "unknown_profile",
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
    expectedCounts: payload.expectedCounts || null,
    scroll: payload.scroll || null,
    collectionDiagnostics: sanitizeCollectionDiagnostics(payload.collectionDiagnostics),
    followClicks: payload.followClicks || null,
    debugReport: compactDebugReport(payload.debugReport)
  };
}

const devtoolsTabs = new Map();

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
    readyCount: 0,
    statusCount: 0,
    payloadCount: 0,
    lastReadyAt: "",
    lastStatusAt: "",
    lastPayloadAt: "",
    lastError: "",
    stats: null
  };
  const next = { ...current, ...patch, tabId: key };
  devtoolsTabs.set(key, next);
  return next;
}

function markDevtoolsMessageState(message) {
  const tabId = getValidTabId(message.tabId);
  if (tabId === null) return null;

  if (message.type === "IG_DEVTOOLS_READY") {
    const current = getDevtoolsTabState(tabId);
    return setDevtoolsTabState(tabId, {
      connected: true,
      readyCount: (current?.readyCount || 0) + 1,
      lastReadyAt: message.capturedAt || new Date().toISOString(),
      lastError: ""
    });
  }

  if (message.type === "IG_DEVTOOLS_STATUS") {
    const current = getDevtoolsTabState(tabId);
    return setDevtoolsTabState(tabId, {
      connected: true,
      statusCount: (current?.statusCount || 0) + 1,
      lastStatusAt: message.capturedAt || new Date().toISOString(),
      lastError: message.error || current?.lastError || "",
      stats: message.stats || current?.stats || null
    });
  }

  if (message.type === "IG_DEVTOOLS_USERNAMES") {
    const current = getDevtoolsTabState(tabId);
    return setDevtoolsTabState(tabId, {
      connected: true,
      payloadCount: (current?.payloadCount || 0) + 1,
      lastPayloadAt: message.capturedAt || new Date().toISOString(),
      lastError: ""
    });
  }

  return getDevtoolsTabState(tabId);
}

function buildDevtoolsStatePayload(tabId, reason = "background-state") {
  const state = getDevtoolsTabState(tabId);
  if (!state?.connected) return null;
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

  const key = message.storageKey || `ig_follower_snapshot:${snapshot.profile}`;
  chrome.storage.session.set({
    [key]: snapshot,
    "ig_follower_snapshot:lastRun": snapshot
  }).then(() => {
    sendResponse({ ok: true, key });
  }).catch((error) => {
    sendResponse({ ok: false, error: error?.message || "storage-session-set-failed" });
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
    files: ["main.js"]
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
      url: message.url || "",
      method: message.method || "",
      status: message.status || 0,
      mimeType: message.mimeType || "",
      usernames: Array.isArray(message.usernames) ? message.usernames.slice(0, 2000) : [],
      mode: message.mode || "unknown",
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
      callback({
        ok: false,
        error: chrome.runtime.lastError.message || "tabs-send-message-failed"
      });
      return;
    }

    callback({ ok: true, response });
  });
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !tab.url || !tab.url.includes("instagram.com")) {
    return;
  }

  injectInstagramCollector(tab.id).catch((error) => {
    console.log("[IG Comparator] injection failed:", error?.message || error);
  });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ig-devtools-network") {
    return;
  }

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "IG_STORE_RUN_SNAPSHOT") {
    storeRunSnapshot(message, sendResponse);
    return true;
  }

  if (message.type === "IG_CONTENT_BRIDGE_READY") {
    const tabId = getValidTabId(sender?.tab?.id);
    if (tabId === null) {
      sendResponse({ ok: false, error: "sender-tab-unavailable" });
      return false;
    }

    const payload = buildDevtoolsStatePayload(tabId, "content-bridge-ready");
    if (!payload) {
      sendResponse({ ok: true, devtoolsConnected: false });
      return false;
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
