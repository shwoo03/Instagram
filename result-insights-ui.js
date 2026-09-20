(() => {
  "use strict";
  function mount(host, { copyButton } = {}) {
    const contract = globalThis.IGResultInsights;
    host.innerHTML = `<section class="insight-card" aria-labelledby="lookupTitle">
      <h2 id="lookupTitle">통합 계정 조회</h2>
      <p>현재 탭의 전체 수집 자료에서 조회합니다. 저장 목록의 1,000명 제한을 받지 않습니다.</p>
      <form id="lookupForm"><label for="lookupUsername">조회할 사용자 이름</label>
        <div class="insight-input-row"><input id="lookupUsername" maxlength="31" placeholder="@username" autocomplete="off" spellcheck="false" autocapitalize="none"><button type="submit">조회</button></div></form>
      <p id="lookupResult" role="status" aria-live="polite"></p>
    </section><details class="insight-card" id="completionCard"><summary>판정 근거</summary>
      <p>각 목록의 수집 상태입니다. 관계 확정에는 두 목록 완료와 비교 계산 검증이 모두 필요합니다.</p>
      <p id="followersCompletion"></p><p id="followingCompletion"></p>
    </details><section class="insight-card insight-copy">
      <p id="copyScope">복사 항목: 수량, 목록 완료 상태·근거, 응답 처리 오류, 요청 제한 시간. 계정명·프로필·주소·원본 응답은 제외합니다.</p>
      ${copyButton ? "" : '<button id="copyButton" type="button">진단 복사</button>'}
      <p id="copyResult" role="status" aria-live="polite"></p>
    </section>`;
    const input = host.querySelector("#lookupUsername");
    const form = host.querySelector("#lookupForm");
    const result = host.querySelector("#lookupResult");
    const copy = copyButton || host.querySelector("#copyButton");
    copy.setAttribute("aria-describedby", "copyScope");
    let current = null;
    let context = null;
    let revision = "";
    let sequence = 0;
    function invalidate() { sequence++; result.textContent = ""; }
    input.addEventListener("input", invalidate);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = contract.username(input.value);
      const ticket = ++sequence;
      if (!name) { result.textContent = "영문·숫자·점·밑줄로 된 사용자 이름을 입력하세요(최대 30자)."; return; }
      if (!current?.runId || !context?.profile) return;
      const request = { type: "IG_LOOKUP_ACCOUNT", tabId: context.tabId, runId: current.runId, profile: context.profile, username: name };
      result.textContent = "전체 수집 자료를 확인하고 있습니다…";
      try {
        const response = await chrome.runtime.sendMessage(request);
        if (ticket !== sequence) return;
        if (!response?.ok || response.runId !== request.runId || response.profile !== request.profile || response.username !== name) {
          result.textContent = "이 실행의 전체 수집 자료를 사용할 수 없습니다. 현재 프로필에서 다시 비교해 주세요.";
          return;
        }
        const answer = contract.lookupResult(response);
        const labels = { mutual: "맞팔", following_only: "나만 팔로우", followers_only: "상대만 팔로우", insufficient: "확인 부족 · 관계를 단정할 수 없음", not_observed: "확정 목록에서 발견되지 않음 · 계정의 존재 여부는 알 수 없음" };
        const evidence = ["followers", "following"].map((mode) => `${mode === "followers" ? "팔로워" : "팔로잉"}: ${answer.evidence[mode].exact ? "정확한 네트워크 목록에서 확인" : answer.evidence[mode].observed ? "보조·후보 자료에서만 관찰" : "수집 자료에서 미발견"}`).join(" / ");
        result.textContent = `@${name}: ${labels[answer.category]}. ${evidence}. 조회 범위: @${request.profile}의 이 실행 전체 수집 자료(저장 목록 아님). 현재 Instagram 상태를 새로 조회한 결과는 아닙니다.`;
      } catch {
        if (ticket === sequence) result.textContent = "조회 요청을 전달하지 못했습니다. 탭을 새로고침했다면 다시 비교해 주세요.";
      }
    });
    copy.addEventListener("click", async () => {
      if (!current) return;
      try {
        await navigator.clipboard.writeText(JSON.stringify(contract.diagnostic(current), null, 2));
        host.querySelector("#copyResult").textContent = "개인정보를 제외한 진단을 복사했습니다.";
      } catch {
        host.querySelector("#copyResult").textContent = "진단을 복사하지 못했습니다. 다시 시도해 주세요.";
      }
    });
    return {
      render(record, nextContext) {
        const nextRevision = record ? JSON.stringify([record.runId, record.updatedAt, record.status, record.verdict?.code, nextContext]) : "";
        if (revision !== nextRevision) { invalidate(); host.querySelector("#copyResult").textContent = ""; }
        revision = nextRevision;
        current = record;
        context = nextContext;
        host.hidden = !record;
        copy.disabled = !record;
        const available = Boolean(record?.runId && record?.profile && record.profile === nextContext?.profile);
        input.disabled = !available;
        form.querySelector("button").disabled = !available;
        if (record && !available) result.textContent = "프로필과 실행을 확인할 수 없습니다. 현재 프로필에서 다시 비교해 주세요.";
        const completion = contract.sanitizeCompletion(record?.completion);
        for (const mode of ["followers", "following"]) host.querySelector(`#${mode}Completion`).textContent = `${mode === "followers" ? "팔로워" : "팔로잉"}: ${contract.completionText(completion[mode])}`;
      }
    };
  }
  globalThis.IGResultInsightsUI = Object.freeze({ mount });
})();
