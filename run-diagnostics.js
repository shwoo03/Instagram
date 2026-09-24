(function installIGRunDiagnostics(globalObject) {
  "use strict";

  const MAX_COUNT = 1_000_000;
  const failureLabels = Object.freeze({
    response_timeout: "응답 처리 시간 초과",
    http_failed: "서버 응답 오류",
    body_unavailable: "응답 본문 읽기 실패",
    delivery_failed: "수집 결과 전달 실패",
    body_too_large: "응답 크기 제한 초과",
    invalid_payload: "응답 해석 실패",
    unrecognized_list: "목록으로 해석할 수 없는 응답",
    capture_failed: "기타 수집 처리 실패"
  });
  const reasonCodes = Object.freeze({
    "response-timeout": "response_timeout",
    "http-response-failed": "http_failed",
    "non-success-status": "http_failed",
    "instagram-block-signal": "http_failed",
    "loading-failed": "body_unavailable",
    "empty-response-body": "body_unavailable",
    "response-body-unavailable": "body_unavailable",
    "response-body-or-delivery-unavailable": "capture_failed",
    "delivery-failed": "delivery_failed",
    "body-too-large": "body_too_large",
    "base64-decode-failed": "invalid_payload",
    "invalid-json": "invalid_payload",
    "not-list-json": "unrecognized_list",
    "no-list-evidence": "unrecognized_list"
  });

  function count(value) {
    return typeof value === "number" && Number.isFinite(value)
      ? Math.min(MAX_COUNT, Math.max(0, Math.floor(value))) : 0;
  }

  function failureCode(reason) {
    return Object.hasOwn(failureLabels, reason) ? reason
      : Object.hasOwn(reasonCodes, reason) ? reasonCodes[reason] : "capture_failed";
  }

  function sanitizeFailures(value) {
    return Object.fromEntries(Object.keys(failureLabels)
      .filter((key) => count(value?.[key]) > 0).map((key) => [key, count(value[key])]));
  }

  function sanitize(value) {
    const pausedUntilMs = value?.rateLimit?.pausedUntilMs;
    return {
      rateLimit: {
        count: count(value?.rateLimit?.count),
        pausedUntilMs: Number.isSafeInteger(pausedUntilMs) && pausedUntilMs >= 0 && pausedUntilMs <= 8.64e15 ? pausedUntilMs : 0
      },
      capture: Object.fromEntries(["followers", "following"].map((mode) => [mode, {
        pendingCount: count(value?.capture?.[mode]?.pendingCount),
        failures: sanitizeFailures(value?.capture?.[mode]?.failures)
      }]))
    };
  }

  function fromCaptureHealth(rateLimit, health) {
    const capture = {};
    for (const mode of ["followers", "following"]) {
      const failures = {};
      let pendingCount = 0;
      for (const source of ["debugger", "devtools"]) {
        const entry = health?.[source]?.[mode];
        pendingCount += count(entry?.pendingCount);
        const reasons = sanitizeFailures(entry?.failureReasons);
        for (const [reason, total] of Object.entries(reasons)) failures[reason] = (failures[reason] || 0) + total;
        const unknown = Math.max(0, count(entry?.failedCount) - Object.values(reasons).reduce((sum, total) => sum + total, 0));
        if (unknown) failures.capture_failed = (failures.capture_failed || 0) + unknown;
      }
      capture[mode] = { pendingCount, failures };
    }
    return sanitize({ rateLimit, capture });
  }

  function cooldownText(value, running, now = Date.now()) {
    if (!running) return "";
    const { rateLimit } = sanitize(value);
    const seconds = Math.ceil((rateLimit.pausedUntilMs - now) / 1000);
    if (!rateLimit.count || seconds <= 0) return "";
    return `Instagram 요청 제한으로 대기 중 · 약 ${seconds}초 후 재개 예정. 지금 중단해도 수집한 결과는 보존합니다.`;
  }

  function messages(value) {
    const { capture } = sanitize(value);
    const output = [];
    for (const mode of ["followers", "following"]) {
      const side = mode === "followers" ? "팔로워" : "팔로잉";
      const { pendingCount, failures } = capture[mode];
      const pending = pendingCount ? `응답 ${pendingCount}건 처리 중입니다. 완료 판정까지 기다려 주세요. ` : "";
      const reasons = Object.entries(failures);
      if (!reasons.length) {
        if (pending) output.push(`${side}: ${pending.trim()}`);
        continue;
      }
      const inspect = reasons.some(([code]) => ["invalid_payload", "unrecognized_list", "body_too_large"].includes(code));
      const action = inspect
        ? "반복되면 진단을 복사해 응답 처리 코드를 점검해 주세요. 응답 형식 변경으로 단정하지 않습니다."
        : "현재 결과를 확인한 뒤 프로필을 새로고침하고 다시 실행해 주세요. 요청 제한 대기 중이면 먼저 기다려 주세요.";
      output.push(`${side}: ${pending}${reasons.map(([code, total]) => `${failureLabels[code]} ${total}건`).join(" · ")}. ${action}`);
    }
    return output;
  }

  globalObject.IGRunDiagnostics = Object.freeze({ sanitize, sanitizeFailures, failureCode, fromCaptureHealth, cooldownText, messages });
})(globalThis);
