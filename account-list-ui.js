(function installIGAccountListUI(globalObject) {
  "use strict";

  if (globalObject.IGAccountListUI && Object.isFrozen(globalObject.IGAccountListUI)) {
    return;
  }

  const PAGE_SIZE = 20;
  let evidenceControlSequence = 0;

  function toEvidenceMap(entries) {
    return Object.freeze(Object.fromEntries((entries || []).map((item) => [item.username, item])));
  }

  function nextVisibleCount(current, total, pageSize = PAGE_SIZE) {
    const safeCurrent = Number.isFinite(Number(current)) ? Math.max(0, Math.floor(Number(current))) : 0;
    const safeTotal = Number.isFinite(Number(total)) ? Math.max(0, Math.floor(Number(total))) : 0;
    const safePage = Number.isFinite(Number(pageSize)) ? Math.max(1, Math.floor(Number(pageSize))) : PAGE_SIZE;
    return Math.min(safeTotal, safeCurrent + safePage);
  }

  function buildViewModel(value) {
    const accounts = globalObject.IGAccountListContract?.sanitizeAccounts(value);
    if (!accounts) return null;
    const metadata = {
      strict: { labelKo: "확정 집합", tone: "success" },
      assisted: { labelKo: "참고용 집합", tone: "info" },
      partial: { labelKo: "부분 결과", tone: "warning" }
    }[accounts.relationshipSet];
    return Object.freeze({
      relationshipSet: accounts.relationshipSet,
      ...metadata,
      sections: Object.freeze([
        Object.freeze({
          key: "iFollowButNotReturned",
          labelKo: "나만 팔로우",
          usernames: accounts.iFollowButNotReturned,
          evidenceByUsername: toEvidenceMap(accounts.evidence.iFollowButNotReturned),
          truncated: accounts.truncated.iFollowButNotReturned,
          candidate: false
        }),
        Object.freeze({
          key: "followersWithoutMeFollowing",
          labelKo: "나를 팔로우",
          usernames: accounts.followersWithoutMeFollowing,
          evidenceByUsername: toEvidenceMap(accounts.evidence.followersWithoutMeFollowing),
          truncated: accounts.truncated.followersWithoutMeFollowing,
          candidate: false
        }),
        Object.freeze({
          key: "candidates",
          labelKo: "검토 후보",
          usernames: Object.freeze([...accounts.followersCandidates, ...accounts.followingCandidates]),
          truncated: accounts.truncated.followersCandidates || accounts.truncated.followingCandidates,
          candidate: true,
          groups: Object.freeze([
            Object.freeze({
              key: "followersCandidates",
              labelKo: "팔로워 후보",
              usernames: accounts.followersCandidates,
              evidenceByUsername: toEvidenceMap(accounts.evidence.followersCandidates),
              truncated: accounts.truncated.followersCandidates
            }),
            Object.freeze({
              key: "followingCandidates",
              labelKo: "팔로잉 후보",
              usernames: accounts.followingCandidates,
              evidenceByUsername: toEvidenceMap(accounts.evidence.followingCandidates),
              truncated: accounts.truncated.followingCandidates
            })
          ])
        })
      ])
    });
  }

  function getSourcePhrase(source, level) {
    const candidate = level === "candidate";
    return {
      debugger: candidate ? "자동 네트워크(Debugger)의 후보 응답" : "자동 네트워크(Debugger)의 정확한 목록 응답",
      devtools: candidate ? "DevTools Network의 후보 응답" : "DevTools Network의 정확한 목록 응답",
      "page-network": candidate
        ? "페이지 네트워크의 후보 응답"
        : level === "confirmed" ? "페이지 네트워크의 정확한 목록 응답" : "페이지 네트워크 보조 수집",
      "dom-fallback": "수량 부족을 보완한 DOM 근거",
      dom: "Instagram 목록 화면(DOM)",
      mixed: "둘 이상의 수집 근거",
      unknown: "저장된 비교 집합"
    }[source] || "저장된 비교 집합";
  }

  function getEvidencePresentation(sectionKey, evidence = {}) {
    const level = ["confirmed", "reference", "candidate"].includes(evidence.level)
      ? evidence.level
      : sectionKey.endsWith("Candidates") ? "candidate" : "reference";
    const source = evidence.source || "unknown";
    const sourcePhrase = getSourcePhrase(source, level);
    const badge = {
      confirmed: { badgeKo: "확정", tone: "success" },
      reference: { badgeKo: "참고", tone: "info" },
      candidate: { badgeKo: "후보", tone: "warning" }
    }[level];

    if (source === "unknown") {
      const reasonKo = level === "confirmed"
        ? "확정 비교 집합에 포함됐지만 세부 수집 출처는 저장 과정에서 생략되었습니다."
        : level === "candidate"
          ? "검토 후보로 보관했지만 세부 수집 출처는 저장 과정에서 생략되었습니다. 최종 비교에서는 제외했습니다."
          : "참고용 비교 집합에 포함됐지만 세부 수집 출처는 저장 과정에서 생략되었습니다. 확정 비교로는 보지 않습니다.";
      return Object.freeze({ ...badge, level, source, reasonKo });
    }

    if (sectionKey === "followersCandidates" || sectionKey === "followingCandidates") {
      const side = sectionKey === "followersCandidates" ? "팔로워" : "팔로잉";
      return Object.freeze({
        ...badge,
        level: "candidate",
        source,
        reasonKo: `${sourcePhrase}에서 ${side} 후보로 발견됐지만 확정 조건을 충족하지 않아 최종 비교에서는 제외했습니다.`
      });
    }

    const isFollowingOnly = sectionKey === "iFollowButNotReturned";
    const presentSide = isFollowingOnly ? "팔로잉" : "팔로워";
    const missingSide = isFollowingOnly ? "팔로워" : "팔로잉";
    const relationship = isFollowingOnly ? "나만 팔로우" : "나를 팔로우";
    const reasonKo = level === "confirmed"
      ? `${sourcePhrase}에서 ${presentSide} 계정으로 확인됐고, 확정 ${missingSide} 집합에는 없어 ‘${relationship}’로 분류했습니다.`
      : `${sourcePhrase}에서 ${presentSide} 계정으로 발견됐고, 참고용 ${missingSide} 집합에는 없어 ‘${relationship}’ 참고 결과로 표시했습니다. 확정 비교로는 보지 않습니다.`;
    return Object.freeze({ ...badge, level, source, reasonKo });
  }

  function createSummary(documentObject, label, count, interactive = true) {
    const summary = documentObject.createElement(interactive ? "summary" : "div");
    summary.className = "account-summary";
    const title = documentObject.createElement("span");
    title.textContent = label;
    const total = documentObject.createElement("strong");
    total.textContent = `${count.toLocaleString("ko-KR")}명`;
    summary.append(title, total);
    return summary;
  }

  function renderPagedList(documentObject, host, usernames, options = {}) {
    let visibleCount = Math.min(PAGE_SIZE, usernames.length);
    const list = documentObject.createElement("ul");
    list.className = `account-name-list${options.candidate ? " is-candidate" : ""}`;
    const controls = documentObject.createElement("div");
    controls.className = "account-list-controls";

    function renderPage() {
      list.replaceChildren(...usernames.slice(0, visibleCount).map((username) => {
        const item = documentObject.createElement("li");
        item.className = "account-evidence-item";
        const row = documentObject.createElement("div");
        row.className = "account-evidence-row";
        const link = documentObject.createElement("a");
        link.href = globalObject.IGAccountListContract.profileUrl(username);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `@${username}`;
        const arrow = documentObject.createElement("span");
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "↗";
        link.append(arrow);
        const presentation = getEvidencePresentation(options.sectionKey || "", options.evidenceByUsername?.[username]);
        const reasonId = `ig-account-evidence-${++evidenceControlSequence}`;
        const evidenceButton = documentObject.createElement("button");
        evidenceButton.type = "button";
        evidenceButton.className = "account-evidence-button";
        evidenceButton.dataset.tone = presentation.tone;
        evidenceButton.setAttribute("aria-expanded", "false");
        evidenceButton.setAttribute("aria-controls", reasonId);
        evidenceButton.setAttribute("aria-label", `@${username} 판정 근거 보기`);
        evidenceButton.textContent = presentation.badgeKo;
        const reason = documentObject.createElement("p");
        reason.id = reasonId;
        reason.className = "account-evidence-reason";
        reason.hidden = true;
        reason.textContent = presentation.reasonKo;
        evidenceButton.addEventListener("click", () => {
          const expanded = evidenceButton.getAttribute("aria-expanded") === "true";
          evidenceButton.setAttribute("aria-expanded", String(!expanded));
          evidenceButton.setAttribute("aria-label", `@${username} 판정 근거 ${expanded ? "보기" : "접기"}`);
          reason.hidden = expanded;
        });
        row.append(link, evidenceButton);
        item.append(row, reason);
        return item;
      }));

      controls.replaceChildren();
      if (visibleCount < usernames.length) {
        const button = documentObject.createElement("button");
        button.type = "button";
        button.className = "account-more-button";
        button.textContent = `20명 더 보기 (${visibleCount.toLocaleString("ko-KR")}/${usernames.length.toLocaleString("ko-KR")})`;
        button.addEventListener("click", () => {
          visibleCount = nextVisibleCount(visibleCount, usernames.length);
          renderPage();
        });
        controls.append(button);
      }
    }

    renderPage();
    host.append(list, controls);
    if (options.truncated) {
      const notice = documentObject.createElement("p");
      notice.className = "account-truncated-notice";
      notice.textContent = "세션 UI 저장 한도에 따라 처음 1,000명만 표시합니다.";
      host.append(notice);
    }
  }

  function renderEmpty(documentObject, host) {
    const empty = documentObject.createElement("p");
    empty.className = "account-empty";
    empty.textContent = "없음";
    host.append(empty);
  }

  function renderSection(documentObject, section) {
    if (section.usernames.length === 0) {
      const emptyRow = documentObject.createElement("div");
      emptyRow.className = "account-disclosure is-empty";
      emptyRow.append(createSummary(documentObject, section.labelKo, 0, false));
      return emptyRow;
    }

    const details = documentObject.createElement("details");
    details.className = `account-disclosure${section.candidate ? " is-candidate" : ""}`;
    details.append(createSummary(documentObject, section.labelKo, section.usernames.length));
    const body = documentObject.createElement("div");
    body.className = "account-disclosure-body";

    if (section.candidate) {
      for (const group of section.groups) {
        const groupElement = documentObject.createElement("section");
        groupElement.className = "account-candidate-group";
        const heading = documentObject.createElement("h4");
        heading.textContent = `${group.labelKo} · ${group.usernames.length.toLocaleString("ko-KR")}명`;
        groupElement.append(heading);
        if (group.usernames.length > 0) {
          renderPagedList(documentObject, groupElement, group.usernames, {
            candidate: true,
            truncated: group.truncated,
            sectionKey: group.key,
            evidenceByUsername: group.evidenceByUsername
          });
        } else {
          renderEmpty(documentObject, groupElement);
        }
        body.append(groupElement);
      }
    } else {
      renderPagedList(documentObject, body, section.usernames, {
        truncated: section.truncated,
        sectionKey: section.key,
        evidenceByUsername: section.evidenceByUsername
      });
    }

    details.append(body);
    return details;
  }

  function render(options = {}) {
    const container = options.container;
    const documentObject = options.document || container?.ownerDocument;
    const viewModel = buildViewModel(options.accounts);
    if (!container || !documentObject || !viewModel) return false;
    container.replaceChildren(...viewModel.sections.map((section) => renderSection(documentObject, section)));
    if (options.badge) {
      options.badge.textContent = viewModel.labelKo;
      options.badge.dataset.tone = viewModel.tone;
    }
    return true;
  }

  const namespace = Object.freeze({
    PAGE_SIZE,
    buildViewModel,
    getEvidencePresentation,
    nextVisibleCount,
    render
  });

  Object.defineProperty(globalObject, "IGAccountListUI", {
    value: namespace,
    writable: false,
    configurable: true,
    enumerable: true
  });
})(globalThis);
