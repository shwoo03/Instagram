(() => {
  "use strict";

  const STORAGE_PREFIX = "ig_run_progress:tab:";
  const numberFormatter = new Intl.NumberFormat("ko-KR");
  const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const elementIds = [
    "stateBadge", "copyButton", "verdictIcon", "verdictKicker", "verdictTitle",
    "verdictDescription", "updatedAt", "integrityBadge", "followersHeadline",
    "followersExpected", "followersConfirmed", "followersAssisted", "followersCandidates",
    "followersPagination", "followingHeadline", "followingExpected", "followingConfirmed",
    "followingAssisted", "followingCandidates", "followingPagination", "mutualCount",
    "followingOnlyCount", "followersOnlyCount", "devtoolsStatus", "debuggerStatus", "pageNetworkStatus",
    "domStatus", "stageStatus", "runStatus", "emptyWarnings", "warningList",
    "timelineList", "liveStatus", "errorStatus"
  ];
  const elements = Object.fromEntries(elementIds.map((id) => [id, document.getElementById(id)]));

  const inspectedTabId = Number.isInteger(chrome.devtools?.inspectedWindow?.tabId)
    ? chrome.devtools.inspectedWindow.tabId
    : null;
  const storageKey = inspectedTabId === null ? null : `${STORAGE_PREFIX}${inspectedTabId}`;
  let rawRecord = null;
  let validInstagramTarget = true;

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : null;
  }

  function formatCount(value) {
    const number = safeNumber(value);
    return number === null ? "—" : numberFormatter.format(number);
  }

  function normalizeList(value) {
    const list = isObject(value) ? value : {};
    return {
      expected: safeNumber(list.expected),
      confirmed: safeNumber(list.confirmed),
      assisted: safeNumber(list.assisted),
      candidates: safeNumber(list.candidates)
    };
  }

  function normalizePagination(value) {
    const pagination = isObject(value) ? value : {};
    return {
      recognized: pagination.recognized === true,
      terminal: pagination.terminal === true
    };
  }

  function normalizeTimeline(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(-8).map((item) => {
      if (typeof item === "string") return { code: item, labelKo: item, at: "" };
      if (!isObject(item)) return null;
      const code = typeof item.code === "string" ? item.code : typeof item.type === "string" ? item.type : "event";
      const at = typeof item.at === "string" ? item.at : typeof item.timestamp === "string" ? item.timestamp : "";
      return { code, at };
    }).filter(Boolean);
  }

  function normalizeRecord(value) {
    const outer = isObject(value) ? value : {};
    const record = isObject(outer.progress) ? outer.progress : outer;
    const counts = isObject(record.counts) ? record.counts : {};
    const sources = isObject(record.sources) ? record.sources : {};
    const pagination = isObject(record.pagination) ? record.pagination : {};
    const verdict = isObject(record.verdict) ? record.verdict : {};
    return {
      schemaVersion: safeNumber(record.schemaVersion) || 1,
      stage: typeof record.stage === "string" ? record.stage : "",
      status: typeof record.status === "string" ? record.status : "",
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
      counts: {
        followers: normalizeList(counts.followers),
        following: normalizeList(counts.following),
        mutual: safeNumber(counts.mutual),
        followersOnly: safeNumber(counts.followersOnly),
        followingOnly: safeNumber(counts.followingOnly)
      },
      sources: {
        devtoolsReady: sources.devtoolsReady === true,
        debuggerReady: sources.debuggerReady === true,
        debuggerEvidence: sources.debuggerEvidence === true,
        pageNetworkReady: sources.pageNetworkReady === true,
        domOnly: sources.domOnly === true
      },
      pagination: {
        followers: normalizePagination(pagination.followers),
        following: normalizePagination(pagination.following)
      },
      verdict: {
        code: typeof verdict.code === "string" ? verdict.code : "",
        labelKo: typeof verdict.labelKo === "string" ? verdict.labelKo : "",
        severity: typeof verdict.severity === "string" ? verdict.severity : "",
        reasons: Array.isArray(verdict.reasons) ? verdict.reasons.filter((item) => typeof item === "string").slice(0, 8) : [],
        recommendedActionKo: typeof verdict.recommendedActionKo === "string" ? verdict.recommendedActionKo : ""
      },
      warnings: Array.isArray(record.warnings) ? record.warnings.filter((item) => typeof item === "string").slice(0, 8) : [],
      timeline: normalizeTimeline(record.timeline)
    };
  }

  function isRunning(record) {
    const status = `${record?.status || ""} ${record?.stage || ""}`.toLowerCase();
    return /running|collect|scroll|preflight|starting|followers|following/.test(status) && !/complete|completed|terminal|error|partial/.test(status);
  }

  function deriveState(record) {
    if (!validInstagramTarget) return "no-tab";
    if (!record || (!record.status && !record.verdict.code)) return "ready";
    if (isRunning(record)) return "running";
    const haystack = `${record.status} ${record.verdict.code} ${record.verdict.severity}`.toUpperCase();
    if (/ERROR|FAILED|RUNTIME_ERROR|STORAGE_ERROR/.test(haystack)) return "error";
    if (/RETRY|INTEGRITY_FAILED/.test(haystack)) return "retry";
    if (/SUPERSEDED/.test(haystack)) return "superseded";
    if (/PARTIAL|INCOMPLETE/.test(haystack)) return "partial";
    if (/\bCONFIRMED\b|CONFIRMED_EXACT_COUNT|CONFIRMED_NETWORK_END|CONFIRMED_COMPLETE/.test(haystack)) return "confirmed";
    if (/ASSISTED|REFERENCE|DOM_PREVIEW|PROVISIONAL/.test(haystack)) return "reference";
    if (/COMPLETE|COMPLETED|DONE/.test(haystack)) return (record.sources.devtoolsReady || record.sources.debuggerReady || record.sources.debuggerEvidence) ? "confirmed" : "reference";
    return "ready";
  }

  function formatTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
  }

  function announce(message, isError = false) {
    const target = isError ? elements.errorStatus : elements.liveStatus;
    target.textContent = "";
    requestAnimationFrame(() => { target.textContent = message; });
  }

  function renderVerdict(state, record) {
    const views = {
      "no-tab": ["Instagram 대상 아님", "danger", "대상 탭 확인 필요", "Instagram 프로필 탭을 검사해 주세요", "이 패널은 Instagram 프로필 비교 상태만 표시합니다."],
      ready: ["실행 대기", "neutral", "수집 준비됨", "비교 실행을 기다리고 있습니다", "확장 팝업에서 비교를 시작하면 근거와 진행 상태가 표시됩니다."],
      running: ["수집 중", "info", "실행 진행 중", "목록 증거를 수집하고 있습니다", "탭을 유지한 채 팔로워와 팔로잉 수집이 끝날 때까지 기다려 주세요."],
      confirmed: ["확정", "success", "검증 완료", record?.verdict.labelKo || "확정 비교 가능", record?.verdict.recommendedActionKo || "정확한 네트워크 증거와 비교 무결성이 확인되었습니다."],
      reference: ["참고용", "info", "보조 증거 사용", record?.verdict.labelKo || "참고용 결과", record?.verdict.recommendedActionKo || "확정 네트워크 증거가 부족해 결과 신뢰도를 낮췄습니다."],
      partial: ["일부 완료", "warning", "부분 결과 보존", record?.verdict.labelKo || "수집이 일부만 완료되었습니다", record?.verdict.recommendedActionKo || "확인된 데이터는 보존했습니다. 종료 이유를 확인해 주세요."],
      superseded: ["교체됨", "warning", "이전 실행 종료", "최신 실행으로 교체되었습니다", "기존 실행은 더 이상 갱신되지 않으며 부분 결과로 보존됩니다."],
      retry: ["재실행 필요", "warning", "증거 부족", record?.verdict.labelKo || "DevTools 재실행 필요", record?.verdict.recommendedActionKo || "프로필을 새로고침하고 목록을 다시 열어 주세요."],
      error: ["오류", "danger", "실행 실패", record?.verdict.labelKo || "진단을 완료하지 못했습니다", record?.verdict.recommendedActionKo || "확장 프로그램과 대상 탭을 새로고침한 뒤 다시 시도해 주세요."]
    };
    const [badge, tone, kicker, title, description] = views[state];
    elements.stateBadge.textContent = badge;
    elements.stateBadge.dataset.tone = tone;
    elements.verdictIcon.dataset.tone = tone === "info" && state === "running" ? "running" : tone;
    elements.verdictKicker.textContent = kicker;
    elements.verdictTitle.textContent = title;
    elements.verdictDescription.textContent = description;
    elements.updatedAt.textContent = formatTime(record?.updatedAt);
  }

  function renderList(prefix, list, pagination) {
    const headline = list.confirmed && list.confirmed > 0 ? list.confirmed : list.assisted;
    elements[`${prefix}Headline`].textContent = formatCount(headline);
    elements[`${prefix}Expected`].textContent = formatCount(list.expected);
    elements[`${prefix}Confirmed`].textContent = formatCount(list.confirmed);
    elements[`${prefix}Assisted`].textContent = formatCount(list.assisted);
    elements[`${prefix}Candidates`].textContent = formatCount(list.candidates);
    elements[`${prefix}Pagination`].textContent = pagination.terminal
      ? "끝 확인됨"
      : pagination.recognized ? "계속 수집 필요" : "인식 전";
  }

  function renderCounts(state, record) {
    const fallback = normalizeRecord(null);
    const data = record || fallback;
    renderList("followers", data.counts.followers, data.pagination.followers);
    renderList("following", data.counts.following, data.pagination.following);
    elements.mutualCount.textContent = formatCount(data.counts.mutual);
    elements.followingOnlyCount.textContent = formatCount(data.counts.followingOnly);
    elements.followersOnlyCount.textContent = formatCount(data.counts.followersOnly);

    const integrityPassed = state === "confirmed" && /CONFIRMED/.test(data.verdict.code);
    elements.integrityBadge.textContent = integrityPassed ? "비교 무결성 확인" : state === "reference" ? "참고용 집합" : state === "ready" ? "실행 대기" : "확인 필요";
    elements.integrityBadge.dataset.tone = integrityPassed ? "success" : state === "reference" ? "info" : ["partial", "retry", "superseded"].includes(state) ? "warning" : state === "error" ? "danger" : "neutral";
  }

  function setSource(element, enabled, enabledText, disabledText) {
    element.textContent = enabled ? enabledText : disabledText;
    element.dataset.state = enabled ? "on" : "off";
  }

  function renderDiagnostics(record) {
    const sources = record?.sources || normalizeRecord(null).sources;
    setSource(elements.devtoolsStatus, sources.devtoolsReady, "연결됨", "연결 대기");
    setSource(
      elements.debuggerStatus,
      sources.debuggerReady || sources.debuggerEvidence,
      sources.debuggerReady ? "자동 캡처 중" : "증거 수집 완료",
      "비활성"
    );
    setSource(elements.pageNetworkStatus, sources.pageNetworkReady, "보조 증거 있음", "비활성");
    setSource(elements.domStatus, sources.domOnly || Boolean(record), sources.domOnly ? "DOM 전용" : "증거 수집", record ? "대기" : "실행 전");
    elements.stageStatus.textContent = record?.stage || "—";
    elements.runStatus.textContent = record?.status || "—";
  }

  function renderWarnings(record, state) {
    const warnings = [...(record?.warnings || [])];
    if (record?.verdict.recommendedActionKo && ["partial", "retry", "error"].includes(state)) {
      warnings.unshift(record.verdict.recommendedActionKo);
    }
    const unique = Array.from(new Set(warnings)).slice(0, 8);
    elements.emptyWarnings.hidden = unique.length > 0;
    elements.warningList.hidden = unique.length === 0;
    elements.warningList.replaceChildren(...unique.map((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      return item;
    }));
  }

  function renderTimeline(record) {
    let timeline = record?.timeline || [];
    if (timeline.length === 0 && record?.updatedAt) {
      timeline = [{ code: record.status || "state_updated", at: record.updatedAt }];
    }
    if (timeline.length === 0) {
      const item = document.createElement("li");
      item.className = "timeline-empty";
      item.textContent = "실행 이벤트를 기다리고 있습니다.";
      elements.timelineList.replaceChildren(item);
      return;
    }

    elements.timelineList.replaceChildren(...timeline.map((event) => {
      const item = document.createElement("li");
      const time = document.createElement("time");
      time.dateTime = event.at || "";
      time.textContent = formatTime(event.at);
      const dot = document.createElement("span");
      dot.className = "timeline-dot";
      dot.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "timeline-label";
      label.textContent = eventLabel(event.code);
      item.append(time, dot, label);
      return item;
    }));
  }

  function eventLabel(code) {
    const labels = {
      ready: "실행 준비가 완료되었습니다.",
      starting: "비교 실행을 시작했습니다.",
      collecting_followers: "팔로워 목록을 수집하고 있습니다.",
      collecting_following: "팔로잉 목록을 수집하고 있습니다.",
      devtools_capture_navigated: "DevTools 캡처 대상이 이동했습니다.",
      devtools_port_disconnected: "DevTools 연결이 끊겼습니다.",
      rate_limited: "요청 제한 신호를 확인했습니다.",
      profile_changed: "실행 중 프로필 변경을 감지했습니다.",
      superseded: "새 실행이 기존 실행을 교체했습니다.",
      completed: "비교 실행이 완료되었습니다.",
      partial: "부분 결과를 보존했습니다.",
      retry_required: "재실행이 필요한 상태입니다.",
      error: "실행 오류가 기록되었습니다.",
      state_updated: "현재 실행 상태가 저장되었습니다."
    };
    const normalized = String(code || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return labels[normalized] || "실행 상태가 변경되었습니다.";
  }

  function render() {
    const record = rawRecord ? normalizeRecord(rawRecord) : null;
    const state = deriveState(record);
    renderVerdict(state, record);
    renderCounts(state, record);
    renderDiagnostics(record);
    renderWarnings(record, state);
    renderTimeline(record);
    elements.copyButton.disabled = !record;
  }

  function privacySafeDiagnostic(record) {
    return {
      schemaVersion: record.schemaVersion,
      stage: record.stage,
      status: record.status,
      updatedAt: record.updatedAt,
      counts: record.counts,
      sources: record.sources,
      pagination: record.pagination,
      verdict: {
        code: record.verdict.code,
        severity: record.verdict.severity,
        reasons: record.verdict.reasons
      },
      warnings: record.warnings,
      timeline: record.timeline.map(({ code, at }) => ({ code, at }))
    };
  }

  async function copyDiagnostic() {
    if (!rawRecord) return;
    const payload = JSON.stringify(privacySafeDiagnostic(normalizeRecord(rawRecord)), null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      const original = elements.copyButton.textContent;
      elements.copyButton.textContent = "복사됨";
      announce("개인정보를 제외한 진단을 복사했습니다.");
      window.setTimeout(() => { elements.copyButton.textContent = original; }, 1400);
    } catch {
      announce("클립보드에 진단을 복사하지 못했습니다.", true);
    }
  }

  function inspectTarget() {
    if (!chrome.devtools?.inspectedWindow?.eval) return;
    chrome.devtools.inspectedWindow.eval("location.hostname", (hostname, exceptionInfo) => {
      if (exceptionInfo?.isException) return;
      const normalized = typeof hostname === "string" ? hostname.toLowerCase() : "";
      validInstagramTarget = normalized === "instagram.com" || normalized === "www.instagram.com";
      render();
    });
  }

  async function readInitialState() {
    if (!storageKey) {
      validInstagramTarget = false;
      render();
      announce("검사 중인 탭 ID를 확인하지 못했습니다.", true);
      return;
    }
    try {
      const stored = await chrome.storage.session.get(storageKey);
      rawRecord = stored?.[storageKey] || null;
    } catch {
      rawRecord = null;
      announce("저장된 진단 상태를 읽지 못했습니다.", true);
    }
    render();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "session" || !storageKey || !Object.hasOwn(changes, storageKey)) return;
    rawRecord = changes[storageKey].newValue || null;
    render();
    if (rawRecord) {
      const record = normalizeRecord(rawRecord);
      announce(record.verdict.labelKo || "진단 상태가 업데이트되었습니다.");
    }
  });

  elements.copyButton.addEventListener("click", copyDiagnostic);
  inspectTarget();
  readInitialState();
})();
