(() => {
  "use strict";
  const modes = ["followers", "following"];
  const states = {
    CONFIRMED_EXACT_COUNT: "표시 수량과 정확한 목록 응답이 일치",
    CONFIRMED_NETWORK_END: "목록 응답과 화면에서 끝을 확인",
    ASSISTED_COMPLETE: "보조 자료 수집 완료 · 참고용",
    PARTIAL: "수집 완료 근거 부족",
    RETRY_REQUIRED: "다시 수집해야 함"
  };
  const reasons = {
    integrity_failed: "비교 계산 검증 실패",
    capture_pending: "아직 처리 중인 응답이 있음",
    capture_failed: "처리에 실패한 응답이 있음",
    cdp_connected_no_exact_payload: "캡처 연결은 있지만 정확한 목록 응답은 없음",
    exact_displayed_count_matches_cdp: "정확한 표시 수량과 네트워크 수량이 일치",
    cdp_pagination_terminal: "네트워크에서 다음 페이지 없음 확인",
    dom_list_end_observed: "화면 목록 끝 확인",
    small_gap_within_tolerance: "표시 수량과 작은 차이만 남음",
    assisted_exact_count_match: "보조 수량만 표시 수량과 일치",
    assisted_dom_end_observed: "보조 자료로 화면 끝 확인",
    pagination_terminal_not_proven: "네트워크 목록 끝 미확인",
    expected_count_unknown: "전체 수량을 알 수 없음",
    expected_count_approximate: "표시 수량이 근삿값임",
    safe_completion_not_proven: "안전한 완료 조건 미충족",
    unsafe_end: "중단 또는 불안정한 목록 종료"
  };
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1000000) : 0;
  const nullableCount = (value) => Number.isSafeInteger(value) && value >= 0 ? count(value) : null;
  const username = (value) => {
    const name = typeof value === "string" ? value.trim().replace(/^@/, "").toLowerCase() : "";
    return /^[a-z0-9._]{1,30}$/.test(name) ? name : "";
  };
  function sanitizeCompletion(value) {
    return Object.fromEntries(modes.map((mode) => {
      const item = value?.[mode];
      if (!item || !Object.hasOwn(states, item.state)) return [mode, null];
      return [mode, {
        state: item.state,
        expectedCount: nullableCount(item.expectedCount),
        expectedCountExact: item.expectedCountExact === true,
        confirmedCount: count(item.confirmedCount),
        capturePendingCount: count(item.capturePendingCount),
        captureFailedCount: count(item.captureFailedCount),
        evidence: {
          devtoolsExactPayloadCount: count(item.evidence?.devtoolsExactPayloadCount),
          debuggerExactPayloadCount: count(item.evidence?.debuggerExactPayloadCount)
        },
        reasons: [...new Set((Array.isArray(item.reasons) ? item.reasons : [])
          .map((reason) => typeof reason === "string" && reason.startsWith("unsafe_end_reason:") ? "unsafe_end" : reason)
          .filter((reason) => typeof reason === "string" && Object.hasOwn(reasons, reason)))].slice(0, 8)
      }];
    }));
  }
  function completionText(item) {
    if (!item) return "이전 결과에 세부 근거가 없습니다. 다시 비교하면 확인할 수 있습니다.";
    return `${states[item.state]}. 정확한 목록 응답: DevTools ${item.evidence.devtoolsExactPayloadCount}개 · 자동 캡처 ${item.evidence.debuggerExactPayloadCount}개. 응답 처리: 대기 ${item.capturePendingCount}개 · 실패 ${item.captureFailedCount}개. ${item.reasons.map((code) => reasons[code]).join(" · ")}`;
  }
  function lookupResult(input) {
    const evidence = Object.fromEntries(modes.map((mode) => [mode, {
      exact: input?.evidence?.[mode]?.exact === true,
      observed: input?.evidence?.[mode]?.observed === true
    }]));
    const complete = input?.complete === true;
    const followers = evidence.followers.exact;
    const following = evidence.following.exact;
    const category = !complete ? "insufficient" : followers && following ? "mutual"
      : following ? "following_only" : followers ? "followers_only" : "not_observed";
    return { complete, evidence, category };
  }
  function diagnostic(value) {
    const record = value || {};
    // Explicit fields only: no profile, account, run ID, URLs, warning text or raw events.
    return {
      schemaVersion: 1,
      counts: Object.fromEntries(modes.map((mode) => [mode, Object.fromEntries(
        ["expected", "confirmed", "assisted", "candidates"].map((key) => [key, nullableCount(record.counts?.[mode]?.[key])])
      )])),
      completion: sanitizeCompletion(record.completion),
      diagnostics: globalThis.IGRunDiagnostics.sanitize(record.diagnostics),
      verdict: { code: ["CONFIRMED", "REFERENCE_ONLY", "PARTIAL", "RETRY_REQUIRED", "RUNNING"].includes(record.verdict?.code) ? record.verdict.code : "UNKNOWN" }
    };
  }
  globalThis.IGResultInsights = Object.freeze({ username, sanitizeCompletion, completionText, lookupResult, diagnostic });
})();
