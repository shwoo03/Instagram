(() => {
  "use strict";

  const STORAGE_PREFIX = "ig_run_progress:tab:";
  const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
  const numberFormatter = new Intl.NumberFormat("ko-KR");

  const elements = Object.fromEntries(
    [
      "stateBadge", "statusIcon", "statusKicker", "statusTitle", "statusDescription",
      "progressRegion", "progressLabel", "progressValue", "progressBar", "startButton",
      "startButtonLabel", "connectionDot", "connectionLabel", "connectionDescription",
      "resultsSection", "integrityBadge", "followersCount", "followingCount", "mutualCount",
      "followingOnlyCount", "followersOnlyCount", "candidateCount", "warningSection",
      "warningList", "accountDetailsSection", "accountSetBadge", "accountDetailHost",
      "runContext", "runProfile", "runAge", "liveStatus", "errorStatus"
    ].map((id) => [id, document.getElementById(id)])
  );

  const ui = {
    tabId: null,
    storageKey: null,
    validInstagramTab: false,
    currentProfile: "",
    record: null,
    starting: false
  };

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function safeNumber(value) {
    if (value === null || value === undefined || value === "") return null;
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

  function normalizeRecord(value) {
    const outer = isObject(value) ? value : {};
    const record = isObject(outer.progress) ? outer.progress : outer;
    const counts = isObject(record.counts) ? record.counts : {};
    const verdict = isObject(record.verdict) ? record.verdict : {};
    const sources = isObject(record.sources) ? record.sources : {};
    return {
      profile: globalThis.IGRunContext?.normalizeProfile(record.profile) || "",
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
      accounts: globalThis.IGAccountListContract?.sanitizeAccounts(record.accounts) || null,
      sources: {
        devtoolsReady: sources.devtoolsReady === true,
        debuggerReady: sources.debuggerReady === true,
        debuggerEvidence: sources.debuggerEvidence === true,
        pageNetworkReady: sources.pageNetworkReady === true,
        domOnly: sources.domOnly === true
      },
      verdict: {
        code: typeof verdict.code === "string" ? verdict.code : "",
        labelKo: typeof verdict.labelKo === "string" ? verdict.labelKo : "",
        severity: typeof verdict.severity === "string" ? verdict.severity : "",
        reasons: Array.isArray(verdict.reasons) ? verdict.reasons.filter((item) => typeof item === "string").slice(0, 4) : [],
        recommendedActionKo: typeof verdict.recommendedActionKo === "string" ? verdict.recommendedActionKo : ""
      },
      warnings: Array.isArray(record.warnings) ? record.warnings.filter((item) => typeof item === "string").slice(0, 4) : []
    };
  }

  function isRunning(record) {
    const status = `${record?.status || ""} ${record?.stage || ""}`.toLowerCase();
    return /running|collect|scroll|preflight|starting|followers|following/.test(status) && !/complete|completed|terminal|error|partial/.test(status);
  }

  function deriveState(record) {
    if (!ui.validInstagramTab) return "no-tab";
    if (ui.starting) return "running";
    if (!record || (!record.status && !record.verdict.code)) return "ready";
    if (globalThis.IGRunContext?.hasProfileMismatch(record.profile, ui.currentProfile)) return "stale-profile";
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

  function setTone(tone) {
    elements.stateBadge.dataset.tone = tone;
    elements.statusIcon.dataset.tone = tone === "info" ? "running" : tone;
  }

  function announce(message, isError = false) {
    if (isError) {
      elements.errorStatus.textContent = "";
      requestAnimationFrame(() => { elements.errorStatus.textContent = message; });
      return;
    }
    elements.liveStatus.textContent = "";
    requestAnimationFrame(() => { elements.liveStatus.textContent = message; });
  }

  function setStatusView(state, record) {
    const verdictLabel = record?.verdict.labelKo;
    const action = record?.verdict.recommendedActionKo === "없음" ? "" : record?.verdict.recommendedActionKo;
    const views = {
      "no-tab": ["사용 불가", "danger", "Instagram 탭 필요", "Instagram 프로필을 열어 주세요", "현재 선택된 탭에서는 비교를 시작할 수 없습니다."],
      ready: ["실행 준비", "neutral", "프로필 준비됨", "비교를 시작할 수 있어요", "실행 중 자동 네트워크 캡처를 먼저 시도하고, 사용할 수 없으면 참고용 수집으로 계속합니다."],
      running: ["수집 중", "info", "목록 수집 진행 중", "잠시만 기다려 주세요", "현재 실행을 유지한 채 팔로워와 팔로잉 증거를 확인하고 있습니다."],
      "stale-profile": ["이전 결과", "warning", "프로필 불일치", "다른 프로필의 결과입니다", `저장된 결과는 @${record?.profile || "알 수 없음"} 기준입니다. 현재 @${ui.currentProfile || "알 수 없음"}에서 다시 실행해 주세요.`],
      confirmed: ["확정", "success", "검증 완료", verdictLabel || "확정 비교 가능", action || "두 목록의 수집 완료 조건과 비교 계산이 확인되었습니다."],
      reference: ["참고용", "info", "비교 완료", verdictLabel || "참고용 결과", action || "DOM 또는 보조 증거를 사용했습니다. 결과를 참고용으로 확인해 주세요."],
      partial: ["일부 완료", "warning", "부분 결과 보존됨", verdictLabel || "수집이 끝까지 완료되지 않았습니다", action || "확인된 데이터는 보존했습니다. 목록을 다시 연 뒤 재실행할 수 있습니다."],
      superseded: ["교체됨", "warning", "이전 실행 종료", "새 실행으로 교체되었습니다", "기존 부분 결과를 보존하고 최신 실행 상태를 기다립니다."],
      retry: ["재실행 필요", "warning", "추가 확인 필요", verdictLabel || "DevTools 재실행 필요", action || "DevTools를 연 뒤 프로필을 새로고침하고 다시 실행해 주세요."],
      error: ["오류", "danger", "실행 중 문제 발생", verdictLabel || "비교를 완료하지 못했습니다", action || "저장 또는 실행 상태를 확인한 뒤 다시 시도해 주세요."]
    };
    const [badge, tone, kicker, title, description] = views[state];
    elements.stateBadge.textContent = badge;
    setTone(tone);
    elements.statusKicker.textContent = kicker;
    elements.statusTitle.textContent = title;
    elements.statusDescription.textContent = description;
  }

  function renderRunContext(state, record) {
    const savedProfile = ui.starting ? "" : record?.profile || "";
    const displayProfile = savedProfile || ui.currentProfile;
    const hasAge = !ui.starting && Boolean(record?.updatedAt);
    elements.runContext.hidden = !displayProfile && !hasAge;
    if (elements.runContext.hidden) return;
    elements.runContext.dataset.tone = state === "stale-profile" ? "warning" : "neutral";
    elements.runProfile.textContent = state === "stale-profile"
      ? `이전 결과 @${savedProfile}`
      : savedProfile ? `결과 @${savedProfile}` : `현재 @${ui.currentProfile}`;
    elements.runAge.hidden = !hasAge;
    elements.runAge.previousElementSibling.hidden = !hasAge;
    if (hasAge) {
      elements.runAge.dateTime = record.updatedAt;
      elements.runAge.textContent = globalThis.IGRunContext?.formatRelativeTime(record.updatedAt) || "시각 알 수 없음";
      const exactDate = new Date(record.updatedAt);
      elements.runAge.title = Number.isNaN(exactDate.getTime()) ? "" : exactDate.toLocaleString("ko-KR");
    }
  }

  function renderProgress(state, record) {
    const running = state === "running";
    elements.progressRegion.hidden = !running;
    if (!running) return;

    const mode = /following/i.test(record?.stage || "") ? "following" : "followers";
    const list = record?.counts?.[mode] || normalizeList(null);
    const current = Math.max(list.confirmed || 0, list.assisted || 0);
    const expected = list.expected;
    const percent = expected && expected > 0 ? Math.min(100, Math.round((current / expected) * 100)) : 18;
    elements.progressLabel.textContent = mode === "following" ? "팔로잉 수집 중" : "팔로워 수집 중";
    elements.progressValue.textContent = `${formatCount(current)} / ${formatCount(expected)}`;
    elements.progressBar.style.width = `${percent}%`;
    const track = elements.progressBar.parentElement;
    track.setAttribute("aria-valuenow", String(percent));
    if (expected === null) track.removeAttribute("aria-valuetext");
    else track.setAttribute("aria-valuetext", `${current}명 중 ${expected}명`);
  }

  function renderConnection(record, state) {
    if (state === "stale-profile") {
      elements.connectionDot.dataset.connected = "false";
      elements.connectionLabel.textContent = "현재 프로필에서 다시 확인 필요";
      elements.connectionDescription.textContent = "이전 프로필의 수집 환경과 결과는 현재 프로필에 적용하지 않습니다.";
      return;
    }
    const debuggerConnected = record?.sources.debuggerReady === true;
    const debuggerEvidence = record?.sources.debuggerEvidence === true;
    const devtoolsConnected = record?.sources.devtoolsReady === true;
    const connected = debuggerConnected || debuggerEvidence || devtoolsConnected;
    elements.connectionDot.dataset.connected = String(connected);
    if (connected) {
      elements.connectionLabel.textContent = debuggerConnected
        ? "자동 네트워크 캡처 연결됨"
        : debuggerEvidence ? "자동 네트워크 증거 수집 완료" : "DevTools 증거 사용 가능";
      elements.connectionDescription.textContent = debuggerConnected
        ? "비교 실행 중에만 연결하며 종료되면 자동으로 분리합니다."
        : debuggerEvidence ? "원본 응답은 버리고 파생된 확정 증거만 이번 결과에 반영했습니다."
        : "정확한 목록 응답이 포착되면 확정 비교로 판정합니다.";
    } else {
      elements.connectionLabel.textContent = "DOM 참고용 수집 가능";
      elements.connectionDescription.textContent = "자동 캡처를 사용할 수 없어도 실행하며 신뢰도는 낮춰 표시합니다.";
    }
  }

  function renderResults(state, record) {
    const visible = ["confirmed", "reference", "partial", "retry", "superseded"].includes(state);
    elements.resultsSection.hidden = !visible;
    if (!visible || !record) return;

    const followers = record.counts.followers;
    const following = record.counts.following;
    const followerTotal = state === "confirmed" ? followers.confirmed : (followers.assisted ?? followers.confirmed);
    const followingTotal = state === "confirmed" ? following.confirmed : (following.assisted ?? following.confirmed);
    elements.followersCount.textContent = formatCount(followerTotal);
    elements.followingCount.textContent = formatCount(followingTotal);
    elements.mutualCount.textContent = formatCount(record.counts.mutual);
    elements.followingOnlyCount.textContent = formatCount(record.counts.followingOnly);
    elements.followersOnlyCount.textContent = formatCount(record.counts.followersOnly);
    elements.candidateCount.textContent = formatCount((followers.candidates || 0) + (following.candidates || 0));

    const integrityPassed = /CONFIRMED/.test(record.verdict.code) && state === "confirmed";
    elements.integrityBadge.textContent = integrityPassed ? "비교 계산 일치" : state === "reference" ? "참고용" : "부분 결과";
    elements.integrityBadge.title = "맞팔과 한쪽에만 있는 계정의 합계를 확인합니다. 수집 완료 여부는 상단 판정을 확인하세요.";
    elements.integrityBadge.dataset.tone = integrityPassed ? "success" : state === "reference" ? "info" : "warning";
  }

  function renderWarnings(record, state) {
    if (state === "stale-profile") {
      elements.warningSection.hidden = true;
      elements.warningList.replaceChildren();
      return;
    }
    const warnings = [...(record?.warnings || [])];
    if (record?.verdict.recommendedActionKo && ["partial", "retry", "error"].includes(state)) {
      warnings.unshift(record.verdict.recommendedActionKo);
    }
    const unique = Array.from(new Set(warnings)).slice(0, 4);
    elements.warningSection.hidden = unique.length === 0;
    elements.warningList.replaceChildren(...unique.map((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      return item;
    }));
  }

  function renderAccountDetails(record, state) {
    const visible = Boolean(record?.accounts) && ["confirmed", "reference", "partial", "retry", "superseded"].includes(state);
    elements.accountDetailsSection.hidden = !visible;
    if (!visible) {
      elements.accountDetailHost.replaceChildren();
      return;
    }
    const rendered = globalThis.IGAccountListUI?.render({
      container: elements.accountDetailHost,
      badge: elements.accountSetBadge,
      accounts: record.accounts
    });
    elements.accountDetailsSection.hidden = !rendered;
  }

  function renderButton(state) {
    const runnable = ui.validInstagramTab && state !== "running";
    elements.startButton.disabled = !runnable;
    elements.startButtonLabel.textContent = ["confirmed", "reference", "partial", "retry", "error", "superseded"].includes(state)
      ? "비교 다시 실행"
      : state === "stale-profile" ? "현재 프로필 비교 시작" : state === "running" ? "비교 진행 중" : "비교 시작";
  }

  function render(rawRecord = ui.record) {
    const record = rawRecord ? normalizeRecord(rawRecord) : null;
    const state = deriveState(record);
    setStatusView(state, record);
    renderRunContext(state, record);
    renderProgress(state, record);
    renderConnection(record, state);
    renderResults(state, record);
    renderAccountDetails(record, state);
    renderWarnings(record, state);
    renderButton(state);
  }

  function isInstagramUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && INSTAGRAM_HOSTS.has(url.hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  async function readInitialState() {
    let tabs;
    try {
      tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch {
      ui.validInstagramTab = false;
      render();
      announce("현재 탭을 확인하지 못했습니다.", true);
      return;
    }

    const tab = tabs?.[0];
    ui.tabId = Number.isInteger(tab?.id) ? tab.id : null;
    ui.currentProfile = globalThis.IGRunContext?.profileFromInstagramUrl(tab?.url || "") || "";
    ui.validInstagramTab = ui.tabId !== null && isInstagramUrl(tab?.url || "") && Boolean(ui.currentProfile);
    ui.storageKey = ui.tabId === null ? null : `${STORAGE_PREFIX}${ui.tabId}`;

    if (!ui.storageKey) {
      render();
      return;
    }

    try {
      const stored = await chrome.storage.session.get(ui.storageKey);
      ui.record = stored?.[ui.storageKey] || null;
    } catch {
      ui.record = null;
      announce("저장된 실행 상태를 읽지 못했습니다.", true);
    }
    render();
  }

  async function startCollection() {
    if (!ui.validInstagramTab || ui.tabId === null || ui.starting) return;
    ui.starting = true;
    render();
    announce("비교 실행을 요청했습니다.");
    try {
      const response = await chrome.runtime.sendMessage({ type: "IG_START_COLLECTION", tabId: ui.tabId });
      if (response?.ok === false) throw new Error(response.error || "start-rejected");
      if (response?.capture?.mode === "fallback") {
        announce(response.capture.reason === "debugger-busy"
          ? "다른 디버거가 탭을 사용 중이라 참고용 수집으로 계속합니다."
          : "자동 네트워크 캡처를 사용할 수 없어 참고용 수집으로 계속합니다.");
      }
    } catch {
      ui.starting = false;
      setStatusView("error", normalizeRecord({
        status: "error",
        verdict: {
          labelKo: "비교를 시작하지 못했습니다",
          recommendedActionKo: "확장 프로그램과 Instagram 탭을 새로고침한 뒤 다시 시도해 주세요."
        }
      }));
      renderButton("error");
      announce("비교를 시작하지 못했습니다.", true);
      return;
    }

    window.setTimeout(() => {
      if (!ui.record) {
        ui.starting = false;
        render();
      }
    }, 2500);
  }

  chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
    if (tabId !== ui.tabId || !changeInfo.url) return;
    ui.currentProfile = globalThis.IGRunContext?.profileFromInstagramUrl(changeInfo.url) || "";
    ui.validInstagramTab = Boolean(ui.currentProfile);
    ui.starting = false;
    render();
  });
  const ageTimer = window.setInterval(() => {
    if (document.hidden) return;
    const record = ui.record ? normalizeRecord(ui.record) : null;
    renderRunContext(deriveState(record), record);
  }, 15000);
  window.addEventListener("pagehide", () => window.clearInterval(ageTimer), { once: true });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "session" || !ui.storageKey || !Object.hasOwn(changes, ui.storageKey)) return;
    ui.starting = false;
    ui.record = changes[ui.storageKey].newValue || null;
    const normalized = ui.record ? normalizeRecord(ui.record) : null;
    render();
    if (normalized) announce(normalized.verdict.labelKo || "비교 상태가 업데이트되었습니다.");
  });

  elements.startButton.addEventListener("click", startCollection);
  readInitialState();
})();
