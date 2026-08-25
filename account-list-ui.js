(function installIGAccountListUI(globalObject) {
  "use strict";

  if (globalObject.IGAccountListUI && Object.isFrozen(globalObject.IGAccountListUI)) {
    return;
  }

  const PAGE_SIZE = 20;

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
          truncated: accounts.truncated.iFollowButNotReturned,
          candidate: false
        }),
        Object.freeze({
          key: "followersWithoutMeFollowing",
          labelKo: "나를 팔로우",
          usernames: accounts.followersWithoutMeFollowing,
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
            Object.freeze({ key: "followersCandidates", labelKo: "팔로워 후보", usernames: accounts.followersCandidates, truncated: accounts.truncated.followersCandidates }),
            Object.freeze({ key: "followingCandidates", labelKo: "팔로잉 후보", usernames: accounts.followingCandidates, truncated: accounts.truncated.followingCandidates })
          ])
        })
      ])
    });
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
        const link = documentObject.createElement("a");
        link.href = globalObject.IGAccountListContract.profileUrl(username);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `@${username}`;
        const arrow = documentObject.createElement("span");
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "↗";
        link.append(arrow);
        item.append(link);
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
          renderPagedList(documentObject, groupElement, group.usernames, { candidate: true, truncated: group.truncated });
        } else {
          renderEmpty(documentObject, groupElement);
        }
        body.append(groupElement);
      }
    } else {
      renderPagedList(documentObject, body, section.usernames, { truncated: section.truncated });
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
