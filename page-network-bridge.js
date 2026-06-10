{
  const BRIDGE_SOURCE = "ig-page-network-bridge";
  const FOLLOWERS_URL_RE = /(friendships|followers|following|graphql)/i;
  const IGNORED_URL_RE = /(edge-chat|mqtt|realtime|presence|logging|analytics|beacon|direct_v2|\/direct\/|upload|media\/upload)/i;
  const MAX_BODY_CHARS = 512_000;
  const USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;

  if (window.__igFollowerPageNetworkBridgeInstalled) {
    window.postMessage({
      source: BRIDGE_SOURCE,
      schemaVersion: 1,
      type: "IG_PAGE_NETWORK_STATUS",
      reason: "already-installed",
      capturedAt: new Date().toISOString()
    }, "*");
  } else {
    window.__igFollowerPageNetworkBridgeInstalled = true;
    let hooksInstalled = false;

    function getRequestUrl(input) {
      if (typeof input === "string") return input;
      if (input instanceof URL) return input.href;
      return input?.url || "";
    }

    function postStatus(reason, extra = {}) {
      window.postMessage({
        ...extra,
        source: BRIDGE_SOURCE,
        schemaVersion: 1,
        type: "IG_PAGE_NETWORK_STATUS",
        reason,
        capturedAt: new Date().toISOString()
      }, "*");
    }

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const message = event.data;
      if (!message || message.source !== "ig-follower-content" || message.schemaVersion !== 1) return;
      if (message.type === "IG_PAGE_NETWORK_PING") {
        postStatus(hooksInstalled ? "ready-enabled" : "ready-passive", { hooksInstalled });
      }
      if (message.type === "IG_PAGE_NETWORK_ENABLE") {
        installHooks();
      }
    });

    function detectMode(url) {
      let pathname = "";
      try {
        pathname = new URL(String(url || ""), window.location.href).pathname.toLowerCase();
      } catch {
        pathname = String(url || "").split("?")[0].toLowerCase();
      }

      const lower = String(url || "").toLowerCase();
      if (pathname.includes("/followers/")) return "followers";
      if (pathname.includes("/following/")) return "following";
      if (lower.includes("graphql") || lower.includes("friendships")) return "active";
      return "unknown";
    }

    function shouldInspectUrl(url) {
      if (!url || typeof url !== "string") return false;
      if (IGNORED_URL_RE.test(url)) return false;
      return FOLLOWERS_URL_RE.test(url);
    }

    function getSafeUrlLabel(url) {
      const mode = detectMode(url);
      if (mode === "followers") return "instagram:endpoint:followers";
      if (mode === "following") return "instagram:endpoint:following";
      if (/graphql/i.test(url)) return "instagram:graphql:candidate";
      if (/friendships/i.test(url)) return "instagram:friendships:candidate";
      return "instagram:network:candidate";
    }

    function addUsername(username, targetSet) {
      if (typeof username !== "string") return;
      const trimmed = username.trim().toLowerCase();
      if (USERNAME_RE.test(trimmed)) {
        targetSet.add(trimmed);
      }
    }


    function looksLikeJsonUserPayload(text) {
      if (!text || typeof text !== "string") return false;
      const trimmed = text.trim();
      if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return false;
      return /"username"|"users"|"items"|"edges"|"nodes"|"data"/.test(trimmed);
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

    function postResponse(url, bodyText, transport) {
      if (!bodyText || typeof bodyText !== "string") return;
      if (bodyText.length > MAX_BODY_CHARS) {
        postStatus("body-too-large", { transport, bodyLength: bodyText.length });
        return;
      }
      if (!looksLikeJsonUserPayload(bodyText)) return;

      let parsed;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        return;
      }

      const usernames = new Set();
      collectUsernamesFromPayload(parsed, usernames);
      if (usernames.size === 0) return;

      window.postMessage({
        source: BRIDGE_SOURCE,
        schemaVersion: 1,
        type: "IG_PAGE_NETWORK_USERNAMES",
        url: getSafeUrlLabel(url),
        transport,
        mode: detectMode(url),
        modeConfidence: detectMode(url) === "active" ? "candidate" : "confirmed",
        reason: detectMode(url) === "active" ? "active-mode-network-candidate" : "exact-list-endpoint",
        usernames: Array.from(usernames).slice(0, 2000),
        capturedAt: new Date().toISOString()
      }, "*");
    }

    function installHooks() {
      if (hooksInstalled) {
        postStatus("already-enabled", { hooksInstalled: true });
        return;
      }
      hooksInstalled = true;

      const OriginalXHR = window.XMLHttpRequest;
      const originalOpen = OriginalXHR?.prototype?.open;
      const originalSend = OriginalXHR?.prototype?.send;

      if (OriginalXHR && originalOpen && originalSend) {
        OriginalXHR.prototype.open = function(method, url) {
          this.__igFollowerRequestUrl = getRequestUrl(url);
          return originalOpen.apply(this, arguments);
        };

        OriginalXHR.prototype.send = function() {
          this.addEventListener("load", function() {
            const url = this.__igFollowerRequestUrl || "";
            // 429 관측은 page-network hooks가 명시적으로 enable된 경우에만 동작한다.
            if (this.status === 429 && shouldInspectUrl(url)) {
              postStatus("rate-limited", { transport: "page-XHR", httpStatus: 429 });
              return;
            }
            if (!shouldInspectUrl(url) || (this.responseType && this.responseType !== "text")) return;

            let responseText = "";
            try {
              responseText = this.responseText;
            } catch {
              postStatus("xhr-response-text-unavailable", { transport: "page-XHR" });
              return;
            }

            if (typeof responseText !== "string") return;
            postResponse(url, responseText, "page-XHR");
          });

          return originalSend.apply(this, arguments);
        };
      }

      const originalFetch = window.fetch;
      if (typeof originalFetch === "function") {
        window.fetch = async (...args) => {
          const url = getRequestUrl(args[0]);
          if (!shouldInspectUrl(url)) {
            return originalFetch.apply(window, args);
          }

          const response = await originalFetch.apply(window, args);

          // 429 관측은 page-network hooks가 명시적으로 enable된 경우에만 동작한다.
          if (response?.status === 429) {
            postStatus("rate-limited", { transport: "page-fetch", httpStatus: 429 });
            return response;
          }

          if (response?.ok) {
            response.clone().text()
              .then((text) => postResponse(url, text, "page-fetch"))
              .catch(() => postStatus("fetch-clone-read-failed", { transport: "page-fetch" }));
          }

          return response;
        };
      }

      postStatus("enabled", { hooksInstalled: true });
    }

    postStatus("installed-passive", { hooksInstalled: false });
    if (window.__igFollowerAutoEnablePageNetworkBridge === true) {
      installHooks();
    }
  }
}
