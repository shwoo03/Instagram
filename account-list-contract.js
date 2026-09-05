(function installIGAccountListContract(globalObject) {
  "use strict";

  if (globalObject.IGAccountListContract && Object.isFrozen(globalObject.IGAccountListContract)) {
    return;
  }

  const USERNAME_PATTERN = /^[a-zA-Z0-9._]{1,30}$/;
  const MAX_USERNAMES_PER_LIST = 1000;
  const LIST_KEYS = Object.freeze([
    "iFollowButNotReturned",
    "followersWithoutMeFollowing",
    "followersCandidates",
    "followingCandidates"
  ]);
  const RELATIONSHIP_SETS = new Set(["strict", "assisted", "partial"]);
  const EVIDENCE_SOURCES = new Set([
    "debugger",
    "devtools",
    "page-network",
    "dom-fallback",
    "dom",
    "mixed",
    "unknown"
  ]);

  function normalizeLimit(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return MAX_USERNAMES_PER_LIST;
    return Math.min(Math.floor(number), MAX_USERNAMES_PER_LIST);
  }

  function normalizeUsername(value) {
    if (typeof value !== "string") return "";
    const username = value.trim().toLowerCase();
    return USERNAME_PATTERN.test(username) ? username : "";
  }

  function sanitizeUsernameList(value, limit = MAX_USERNAMES_PER_LIST) {
    const usernames = new Set();
    for (const item of Array.isArray(value) ? value : []) {
      const username = normalizeUsername(item);
      if (username) usernames.add(username);
    }
    const sorted = Array.from(usernames).sort();
    const safeLimit = normalizeLimit(limit);
    return Object.freeze({
      usernames: Object.freeze(sorted.slice(0, safeLimit)),
      truncated: sorted.length > safeLimit,
      totalValid: sorted.length
    });
  }

  function sanitizeEvidenceList(value, usernames, level) {
    const byUsername = new Map();
    for (const item of Array.isArray(value) ? value : []) {
      const username = normalizeUsername(item?.username);
      if (!username || byUsername.has(username)) continue;
      byUsername.set(username, {
        username,
        level,
        source: EVIDENCE_SOURCES.has(item?.source) ? item.source : "unknown"
      });
      if (["dom_not_network", "ambiguous_network", "insufficient_evidence"].includes(item?.reason)) {
        byUsername.get(username).reason = item.reason;
      }
    }

    return Object.freeze(usernames.map((username) => {
      const evidence = byUsername.get(username) || { username, level, source: "unknown" };
      return Object.freeze(evidence);
    }));
  }

  function sanitizeAccounts(value, limit = MAX_USERNAMES_PER_LIST) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const relationshipSet = RELATIONSHIP_SETS.has(value.relationshipSet)
      ? value.relationshipSet
      : "partial";
    const result = { relationshipSet };
    const truncated = {};
    const evidence = {};

    for (const key of LIST_KEYS) {
      const list = sanitizeUsernameList(value[key], limit);
      result[key] = list.usernames;
      truncated[key] = list.truncated || value.truncated?.[key] === true;
      const level = key.endsWith("Candidates")
        ? "candidate"
        : relationshipSet === "strict" ? "confirmed" : "reference";
      evidence[key] = sanitizeEvidenceList(value.evidence?.[key], list.usernames, level);
    }

    result.truncated = Object.freeze(truncated);
    result.evidence = Object.freeze(evidence);
    return Object.freeze(result);
  }

  function profileUrl(value) {
    const username = normalizeUsername(value);
    return username ? `https://www.instagram.com/${encodeURIComponent(username)}/` : "";
  }

  const namespace = Object.freeze({
    LIST_KEYS,
    MAX_USERNAMES_PER_LIST,
    USERNAME_PATTERN,
    normalizeUsername,
    profileUrl,
    sanitizeAccounts,
    sanitizeUsernameList
  });

  Object.defineProperty(globalObject, "IGAccountListContract", {
    value: namespace,
    writable: false,
    configurable: true,
    enumerable: true
  });
})(globalThis);
