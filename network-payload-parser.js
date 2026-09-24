(function installIGNetworkPayloadParser(globalObject) {
  "use strict";

  if (globalObject.IGNetworkPayloadParser && Object.isFrozen(globalObject.IGNetworkPayloadParser)) {
    return;
  }

  const USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;
  const MAX_BODY_CHARS = 512_000;
  const CANDIDATE_URL_RE = /(graphql|friendships|followers|following|\/api\/v1\/|\/web\/friendships)/i;
  const JSON_MIME_RE = /(json|javascript|text\/plain)/i;
  const NETWORK_RESOURCE_TYPES = new Set(["xhr", "fetch"]);
  const BLOCK_CODES = Object.freeze([
    "checkpoint_required",
    "feedback_required",
    "login_required",
    "please_wait",
    "access_denied",
    "blocked_page",
    "unknown_warning"
  ]);
  const BLOCK_HINT_RE = /checkpoint|challenge|feedback|login_required|please wait|"spam"|"status"\s*:\s*"fail"/i;

  function isInstagramUrl(url) {
    try {
      const parsed = new URL(String(url || ""));
      return parsed.protocol === "https:" &&
        (parsed.hostname === "instagram.com" || parsed.hostname.endsWith(".instagram.com"));
    } catch {
      return false;
    }
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
    if (lower.includes("graphql") || lower.includes("friendships") || lower.includes("followers") || lower.includes("following")) {
      return "active";
    }
    return "unknown";
  }

  function getSafeEndpointLabel(mode) {
    if (mode === "followers" || mode === "following") {
      return `instagram:endpoint:${mode}`;
    }
    return "instagram:network:candidate";
  }

  function getSafeEndpointLabelFromUrl(url) {
    return getSafeEndpointLabel(detectMode(url));
  }

  function normalizeResourceType(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isCandidateRequestMetadata(input = {}) {
    const url = String(input.url || "");
    if (!isInstagramUrl(url) || !CANDIDATE_URL_RE.test(url)) return false;

    const resourceType = normalizeResourceType(input.resourceType);
    if (resourceType && !NETWORK_RESOURCE_TYPES.has(resourceType)) return false;

    const mimeType = String(input.mimeType || "");
    if (mimeType && !JSON_MIME_RE.test(mimeType)) return false;
    return true;
  }

  function looksLikeJsonUserPayload(text) {
    if (!text || typeof text !== "string") return false;
    const trimmed = text.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return false;
    return /"username"|"users"|"items"|"edges"|"nodes"|"data"|"has_more"|"has_next_page"/.test(trimmed);
  }

  function addUsername(username, targetSet) {
    if (typeof username !== "string") return false;
    const trimmed = username.trim();
    if (!USERNAME_RE.test(trimmed)) return false;
    const before = targetSet.size;
    targetSet.add(trimmed.toLowerCase());
    return targetSet.size > before;
  }

  // [ig-walker:start] 이 블록은 strict parser / page bridge 간 byte-identical 해야 함 (tools/walker-fixtures.mjs가 검증)
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

  function decodeBase64Utf8(content) {
    try {
      const binary = globalObject.atob(String(content || ""));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return null;
    }
  }

  function decodeContent(content, options = {}) {
    const base64Encoded = options.base64Encoded === true || options.encoding === "base64";
    if (!base64Encoded) return typeof content === "string" ? content : "";
    return decodeBase64Utf8(content);
  }

  function buildPagination(parsed, exactEndpoint) {
    const paginationEvidence = globalObject.IGAccuracyEngine?.extractPaginationEvidence(parsed) || null;
    if (!paginationEvidence) return null;
    return {
      exactEndpoint,
      itemCount: Number.isSafeInteger(paginationEvidence.itemCount) ? paginationEvidence.itemCount : 0,
      recognized: paginationEvidence.paginationRecognized === true,
      hasMore: typeof paginationEvidence.hasMore === "boolean" ? paginationEvidence.hasMore : null,
      terminal: paginationEvidence.terminal === true,
      terminalReason: String(paginationEvidence.terminalReason || "").slice(0, 80)
    };
  }

  function failure(reason, details = {}) {
    return Object.freeze({ ok: false, reason, ...details });
  }

  function sanitizeBlockCode(value) {
    return BLOCK_CODES.includes(value) ? value : "";
  }

  // Instagram 경고 응답은 고정 코드로만 분류하고 원문 메시지/URL은 남기지 않는다.
  function classifyBlockPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
    const message = String(payload.message || "").toLowerCase();
    const errorType = String(payload.error_type || "").toLowerCase();
    if (
      /checkpoint|challenge/.test(message) ||
      /checkpoint|challenge/.test(errorType) ||
      typeof payload.checkpoint_url === "string" ||
      (payload.challenge && typeof payload.challenge === "object")
    ) {
      return "checkpoint_required";
    }
    if (
      message === "feedback_required" ||
      errorType === "feedback_required" ||
      payload.feedback_required === true ||
      payload.spam === true
    ) {
      return "feedback_required";
    }
    if (message === "login_required" || errorType === "login_required") return "login_required";
    if (message.includes("please wait a few minutes")) return "please_wait";
    return "";
  }

  function classifyBlockResponse(input = {}) {
    const url = String(input.url || "");
    const status = Number(input.status || 0);
    // 오류 응답은 HTML일 수 있으므로 MIME 대신 URL/리소스 종류만 확인한다.
    if (!isCandidateRequestMetadata({ url, resourceType: input.resourceType })) return null;
    if (status === 429) return null;

    const success = status >= 200 && status < 300;
    let code = "";
    const decodedBody = decodeContent(input.body, {
      encoding: input.encoding,
      base64Encoded: input.base64Encoded
    });
    if (decodedBody && decodedBody.length <= MAX_BODY_CHARS && BLOCK_HINT_RE.test(decodedBody)) {
      try {
        const parsed = JSON.parse(decodedBody);
        if (!success || String(parsed?.status || "").toLowerCase() === "fail") {
          code = classifyBlockPayload(parsed);
        }
      } catch {
        // JSON이 아닌 오류 본문은 아래 상태 코드 기준으로만 판단한다.
      }
    }

    const mode = detectMode(url);
    const exactEndpoint = mode === "followers" || mode === "following";
    if (!code && exactEndpoint && status === 401) code = "login_required";
    if (!code && exactEndpoint && status === 403) code = "access_denied";
    return code ? Object.freeze({ code, status, mode: exactEndpoint ? mode : "active" }) : null;
  }

  function parseResponse(input = {}) {
    const url = String(input.url || "");
    const status = Number(input.status || 0);
    const mimeType = String(input.mimeType || "").slice(0, 120);
    const mode = detectMode(url);

    if (!isCandidateRequestMetadata({
      url,
      mimeType,
      resourceType: input.resourceType
    })) {
      return failure("request-not-candidate");
    }
    if (status < 200 || status >= 300) return failure("non-success-status", { status });
    if (mode === "unknown") return failure("unknown-mode");

    const decodedBody = decodeContent(input.body, {
      encoding: input.encoding,
      base64Encoded: input.base64Encoded
    });
    if (decodedBody === null) return failure("base64-decode-failed");
    if (!decodedBody) return failure("empty-response-body");
    if (decodedBody.length > MAX_BODY_CHARS) {
      return failure("body-too-large", { bodyLength: decodedBody.length });
    }
    const block = classifyBlockResponse({ url, status, resourceType: input.resourceType, body: decodedBody });
    if (block) return failure("instagram-block-signal", { blockCode: block.code });
    if (!looksLikeJsonUserPayload(decodedBody)) return failure("not-list-json");

    let parsed;
    try {
      parsed = JSON.parse(decodedBody);
    } catch {
      return failure("invalid-json");
    }

    const usernames = new Set();
    collectUsernamesFromPayload(parsed, usernames);
    const exactEndpoint = mode === "followers" || mode === "following";
    const pagination = buildPagination(parsed, exactEndpoint);
    if (usernames.size === 0 && !(exactEndpoint && pagination?.recognized)) {
      return failure("no-list-evidence");
    }

    return Object.freeze({
      ok: true,
      evidence: Object.freeze({
        endpoint: getSafeEndpointLabel(mode),
        status,
        mimeType,
        usernames: Object.freeze(Array.from(usernames)),
        mode,
        confidence: exactEndpoint ? "exact" : "candidate",
        pagination: pagination ? Object.freeze(pagination) : null
      })
    });
  }

  const namespace = Object.freeze({
    BLOCK_CODES,
    MAX_BODY_CHARS,
    classifyBlockResponse,
    collectUsernamesFromPayload,
    decodeContent,
    detectMode,
    getSafeEndpointLabel,
    getSafeEndpointLabelFromUrl,
    isCandidateRequestMetadata,
    isInstagramUrl,
    parseResponse,
    sanitizeBlockCode
  });

  Object.defineProperty(globalObject, "IGNetworkPayloadParser", {
    value: namespace,
    writable: false,
    configurable: true,
    enumerable: true
  });
})(globalThis);
