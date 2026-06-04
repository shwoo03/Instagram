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

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["main.js"]
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
