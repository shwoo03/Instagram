(function installIGRunContext(globalObject) {
  "use strict";

  if (globalObject.IGRunContext && Object.isFrozen(globalObject.IGRunContext)) {
    return;
  }

  const PROFILE_PATTERN = /^[a-z0-9._]{1,30}$/;
  const RESERVED_PROFILE_NAMES = new Set([
    "about",
    "accounts",
    "api",
    "challenge",
    "direct",
    "explore",
    "graphql",
    "legal",
    "oauth",
    "p",
    "privacy",
    "reel",
    "reels",
    "stories",
    "threads",
    "tv"
  ]);

  function normalizeProfile(value) {
    const profile = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!PROFILE_PATTERN.test(profile) || profile === "unknown_profile" || RESERVED_PROFILE_NAMES.has(profile)) {
      return "";
    }
    return profile;
  }

  function profileFromInstagramUrl(value) {
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      if (url.protocol !== "https:" || (hostname !== "instagram.com" && hostname !== "www.instagram.com")) {
        return "";
      }
      return normalizeProfile(url.pathname.split("/").filter(Boolean)[0] || "");
    } catch {
      return "";
    }
  }

  function hasProfileMismatch(savedProfile, currentProfile) {
    const saved = normalizeProfile(savedProfile);
    const current = normalizeProfile(currentProfile);
    return Boolean(saved && current && saved !== current);
  }

  function formatRelativeTime(value, nowMs = Date.now()) {
    const timestamp = Date.parse(value || "");
    const now = Number(nowMs);
    if (!Number.isFinite(timestamp) || !Number.isFinite(now)) return "시각 알 수 없음";
    const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
    if (elapsedSeconds < 60) return "방금 전";
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `${elapsedHours}시간 전`;
    return `${Math.floor(elapsedHours / 24)}일 전`;
  }

  const namespace = Object.freeze({
    PROFILE_PATTERN,
    formatRelativeTime,
    hasProfileMismatch,
    normalizeProfile,
    profileFromInstagramUrl
  });

  Object.defineProperty(globalObject, "IGRunContext", {
    value: namespace,
    writable: false,
    configurable: true,
    enumerable: true
  });
})(globalThis);
