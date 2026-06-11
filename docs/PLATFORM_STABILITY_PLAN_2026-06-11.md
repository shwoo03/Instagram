# 플랫폼 안정성·e2e 하네스 구현 계획서 (2026-06-11)

구현 담당 에이전트(Codex)용 실행 계획서. 이 문서만 읽고 바로 구현 가능하도록 작성됨.
근거 리서치: `docs/RELIABILITY_RESEARCH_2026-06-10.md`의 R5(SW 무상태화), R6(quota 가드), R8(Puppeteer e2e). 부록으로 M1(minimum_chrome_version).

## 0. 시작 전 필독

1. `AGENTS.md`(canonical 규칙)와 이 문서 1장 불변 조건을 먼저 읽을 것.
2. 라인 번호는 **2026-06-11 작업 트리(커밋 d807f78 이후) 기준 anchor**다. 함수명으로 재확인할 것.
3. 구현 순서: **R6 → R5 → M1 → R8** (자기완결적이고 작은 것부터, 인프라 투자는 마지막).
4. 항목 하나 완료할 때마다:
   ```bash
   node --check main.js
   node --check background.js
   node --check devtools.js
   node tools/walker-fixtures.mjs
   node tools/compare-fixtures.mjs
   ```
5. 커밋은 항목 ID당 1개, 메시지에 ID 포함 (예: `R6: guard session snapshot quota`).
6. R8은 `npm install`(puppeteer 다운로드, 네트워크 필요)을 수반한다. 실행 환경에서 불가하면 코드·문서까지 작성하고 설치/실행 못 한 사유를 `docs/HANDOFF.md`에 기록할 것.

## 1. 불변 조건 (위반 시 해당 변경 롤백)

- `EXECUTION_MODE`/`FOLLOW_ACTION_ENABLED=false`/`FINAL_DIFF_POLICY`/`PAGE_NETWORK_AUTO_ASSIST_ENABLED=false` 불변.
- 사용자 대면 콘솔 출력 한국어 유지. 예상 가능한 degraded 상태에 `console.warn`/`error` 금지.
- **배포 manifest의 권한 불변.** R8의 `host_permissions`는 e2e 전용 **테스트 빌드 사본**에만 추가한다 (`docs/SECURITY.md` 최소 권한 정책).
- storage에는 파생 데이터만 (username/카운트/타임스탬프/진단). 원본 payload·쿠키·헤더 금지.
- partial/절단이 발생하면 숨기지 말고 한국어 경고 + 플래그로 노출.
- e2e fixture에는 합성 데이터만 (`e2e_user_###`). 실제 계정 데이터·Instagram 마크업 복사 금지(의미론만 모사).
- 런타임 4종 스크립트에 e2e 전용 테스트 훅을 추가하지 않는다 (fixture 쪽에서 해결).

---

## R6. storage.session quota 가드 + lastRun 참조화

**문제 1:** `storeRunSnapshot`(background.js:223~244)은 한도 검사 없이 `set()`하고 실패를 에러 문자열로만 보고한다. `storage.session`의 QUOTA_BYTES는 약 10MB(공식 문서)인데, 수만 팔로워 계정은 압축 후에도 초과할 수 있다.
**문제 2:** background.js:236~238이 같은 스냅샷을 프로필 키와 `"ig_follower_snapshot:lastRun"` 키로 **두 벌 통째로** 저장한다. lastRun을 읽는 소비자는 리포에 없음을 확인했다(main.js:3425의 `store.lastRun`은 별개인 페이지 메모리 객체). 구현 전 `grep -rn "lastRun"` 으로 재확인할 것.

**구현 (`background.js`):**

1. 상수 추가 (파일 상단):
   ```js
   const SNAPSHOT_BUDGET_BYTES = 4 * 1024 * 1024; // 프로필당 예산. session 전체 한도(~10MB)의 절반 미만으로 유지
   ```
2. 크기 측정 헬퍼:
   ```js
   function measureApproxBytes(value) {
     try {
       return new TextEncoder().encode(JSON.stringify(value)).length;
     } catch {
       return Number.MAX_SAFE_INTEGER;
     }
   }
   ```
3. 단계적 절단 헬퍼 — 각 단계 적용 후 재측정, 예산 이하가 되면 중단. **절단 순서는 진단→재현 우선순위의 역순** (가장 덜 중요한 것부터 버림):
   ```js
   function applySnapshotBudget(snapshot, budgetBytes = SNAPSHOT_BUDGET_BYTES) {
     const truncatedSections = [];
     let approxBytes = measureApproxBytes(snapshot);

     const stages = [
       ["provenance", (s) => { s.provenance = { followers: null, following: null }; }],
       ["candidates", (s) => {
         if (s.snapshots?.followers) s.snapshots.followers.candidates = (s.snapshots.followers.candidates || []).slice(0, 200);
         if (s.snapshots?.following) s.snapshots.following.candidates = (s.snapshots.following.candidates || []).slice(0, 200);
         if (s.candidates?.followers) s.candidates.followers = s.candidates.followers.slice(0, 200);
         if (s.candidates?.following) s.candidates.following = s.candidates.following.slice(0, 200);
         if (s.debugReport?.excludedFromDiff) {
           s.debugReport.excludedFromDiff.followersCandidates = (s.debugReport.excludedFromDiff.followersCandidates || []).slice(0, 200);
           s.debugReport.excludedFromDiff.followingCandidates = (s.debugReport.excludedFromDiff.followingCandidates || []).slice(0, 200);
         }
       }],
       ["diagnostics", (s) => {
         s.collectionDiagnostics = null;
         if (s.scroll) {
           s.scroll.followersDiagnostics = (s.scroll.followersDiagnostics || []).slice(-5);
           s.scroll.followingDiagnostics = (s.scroll.followingDiagnostics || []).slice(-5);
         }
         if (s.debugReport?.sources?.dom) s.debugReport.sources.dom.collectionDiagnostics = null;
       }]
     ];

     for (const [name, apply] of stages) {
       if (approxBytes <= budgetBytes) break;
       apply(snapshot);
       truncatedSections.push(name);
       approxBytes = measureApproxBytes(snapshot);
     }

     if (approxBytes > budgetBytes) {
       truncatedSections.push("minimal");
       const minimal = {
         profile: snapshot.profile,
         runId: snapshot.runId,
         collectedAt: snapshot.collectedAt,
         source: snapshot.source,
         followers: (snapshot.followers || []).slice(0, 5000),
         following: (snapshot.following || []).slice(0, 5000),
         expectedCounts: snapshot.expectedCounts || null,
         summaryStatus: snapshot.debugReport?.summaryStatus || null
       };
       return { snapshot: minimal, truncatedSections, approxBytes: measureApproxBytes(minimal) };
     }

     return { snapshot, truncatedSections, approxBytes };
   }
   ```
4. `storeRunSnapshot` 수정:
   - `getSafeRunSnapshot` 결과에 `applySnapshotBudget` 적용 후, 스냅샷에 `storage: { approxBytes, truncatedSections, budgetBytes: SNAPSHOT_BUDGET_BYTES }` 필드를 붙여 저장.
   - **lastRun 참조화:** `set()` 객체를 다음으로 교체 —
     ```js
     {
       [key]: snapshot,
       "ig_follower_snapshot:lastRun": {
         ref: key,
         profile: snapshot.profile,
         runId: snapshot.runId,
         collectedAt: snapshot.collectedAt,
         approxBytes
       }
     }
     ```
   - 성공 응답을 `sendResponse({ ok: true, key, approxBytes, truncatedSections })`로 확장.
   - `.catch()`에서 quota 계열 오류(`/quota/i.test(error?.message || "")`)이고 아직 minimal이 아니면 **minimal 스냅샷으로 1회 재시도**, 그래도 실패하면 기존처럼 에러 응답. 재시도 성공 시 `truncatedSections`에 `"minimal-after-quota-error"` 추가.

**구현 (`main.js`):**

5. `persistRunSnapshotToExtensionSession`의 성공 콜백에서:
   ```js
   if (Array.isArray(response.truncatedSections) && response.truncatedSections.length > 0) {
       console.log(`⚠️ 세션 스냅샷이 저장 한도 때문에 일부 절단되었습니다: ${response.truncatedSections.join(", ")}`);
       console.log("ℹ️ 페이지 메모리(window.__igFollowerResult)에는 전체 데이터가 보존되어 있습니다.");
   }
   ```
   기존 성공 로그에 `(약 ${Math.round((response.approxBytes || 0) / 1024)}KB)` 표기 추가.

**수용 기준:**
- 일반 계정 실행: `truncatedSections`가 빈 배열이고 동작 변화 없음. 저장 키 확인 시 lastRun이 `{ref: ...}` 형태.
- 합성 검증: SW 콘솔(chrome://extensions → 서비스 워커 inspect)에서 `applySnapshotBudget`에 일부러 `budgetBytes: 1000`을 줘 호출하면 단계 순서대로 `truncatedSections`가 쌓이고 최종 minimal로 수렴.
- 절단 발생 시 페이지 콘솔에 한국어 경고 출력.

---

## R5. 서비스 워커 무상태화 — devtoolsTabs의 storage.session 미러

**문제:** `devtoolsTabs` Map(background.js:128)은 메모리 전용이다. SW는 유휴 30초면 종료되고(공식 lifecycle 문서), **포트는 열려 있는 것만으로는 수명을 연장하지 않으며 메시지만 타이머를 리셋**한다(Chrome 114+). 하트비트 백오프(최대 30초)가 들어간 지금 SW가 자다 깨는 게 정상 경로가 됐고, 재기동 직후 도착하는 `IG_CONTENT_BRIDGE_READY` preflight는 빈 Map을 보고 "DevTools 미연결"로 오판할 수 있다. 공식 권장: 전역 변수 대신 storage, 이벤트 핸들러는 무상태로.

**구현 (`background.js`):**

1. 상수: `const DEVTOOLS_TABS_STORAGE_KEY = "ig_devtools_tabs_state:v1";`
2. **하이드레이션** — `devtoolsTabs` 선언(line 128) 직후, top-level에서 promise를 만들어 둔다 (리스너 등록은 그대로 동기 top-level 유지 — MV3 규칙):
   ```js
   const devtoolsTabsHydration = (async () => {
     try {
       if (!chrome.storage?.session) return;
       const stored = await chrome.storage.session.get(DEVTOOLS_TABS_STORAGE_KEY);
       const entries = stored?.[DEVTOOLS_TABS_STORAGE_KEY] || {};
       for (const [key, value] of Object.entries(entries)) {
         const tabId = getValidTabId(key);
         if (tabId === null || devtoolsTabs.has(tabId)) continue; // 메모리에 이미 있으면 그쪽이 더 최신
         devtoolsTabs.set(tabId, value);
       }
     } catch (error) {
       console.log("[IG Comparator] devtools state hydration failed:", error?.message || error);
     }
   })();
   ```
3. **미러 저장(디바운스)**:
   ```js
   let devtoolsTabsPersistTimer = null;
   function schedulePersistDevtoolsTabs() {
     if (!chrome.storage?.session || devtoolsTabsPersistTimer) return;
     devtoolsTabsPersistTimer = setTimeout(() => {
       devtoolsTabsPersistTimer = null;
       const entries = Object.fromEntries(
         Array.from(devtoolsTabs.entries()).slice(0, 20).map(([key, value]) => [String(key), value])
       );
       chrome.storage.session.set({ [DEVTOOLS_TABS_STORAGE_KEY]: entries }).catch(() => {});
     }, 250);
   }
   ```
   (디바운스 250ms는 안전하다: 미러를 갱신시키는 메시지 자체가 SW 유휴 타이머를 30초로 리셋하므로 타이머는 반드시 발화한다.)
4. **호출 연결:** `setDevtoolsTabState`의 `devtoolsTabs.set(key, next)` 직후, `chrome.tabs.onRemoved`/`chrome.tabs.onUpdated`의 `devtoolsTabs.delete(tabId)` 직후에 각각 `schedulePersistDevtoolsTabs();` 추가.
5. **읽기 경로 하이드레이션 대기:** `IG_CONTENT_BRIDGE_READY` 핸들러(line 419~445)를 재구성 — tabId 검증까지는 동기로 두고, 상태 읽기부터 promise 뒤로 옮긴다:
   ```js
   if (message.type === "IG_CONTENT_BRIDGE_READY") {
     const tabId = getValidTabId(sender?.tab?.id);
     if (tabId === null) {
       sendResponse({ ok: false, error: "sender-tab-unavailable" });
       return false;
     }

     devtoolsTabsHydration.then(() => {
       const payload = buildDevtoolsStatePayload(tabId, "content-bridge-ready");
       if (!payload) {
         sendResponse({ ok: true, devtoolsConnected: false });
         return;
       }
       chrome.tabs.sendMessage(tabId, payload, (response) => {
         if (chrome.runtime.lastError) {
           sendResponse({ ok: false, devtoolsConnected: true, error: chrome.runtime.lastError.message || "tabs-send-message-failed" });
           return;
         }
         sendResponse({ ok: true, devtoolsConnected: true, response });
       });
     });
     return true; // 이제 이 분기는 항상 비동기 응답
   }
   ```
6. 쓰기 경로(`markDevtoolsMessageState`, `relayDevtoolsMessageToTab`, port `onDisconnect`)는 하이드레이션을 기다리지 **않는다** — 2번의 merge가 "메모리 우선"이므로 경합해도 최신 상태가 이긴다. 이 근거를 코드 주석 한 줄로 남길 것.
7. 기존 15초 TTL(`isFreshTimestamp`)은 그대로 둔다 — 하이드레이션된 오래된 항목은 자연히 not-fresh로 걸러지므로 안전장치가 이중이 된다.

**수용 기준:**
- DevTools를 연 상태에서 SW inspector 콘솔로 `chrome.storage.session.get("ig_devtools_tabs_state:v1")` 조회 시 현재 탭 상태가 미러되어 있음.
- SW inspector를 닫고 30초+ 방치(SW 비활성 전환 확인) 후 Instagram 탭에서 액션 클릭 → preflight가 hydration을 거쳐 응답하고 기능 회귀 없음 (DevTools가 살아 있으면 직후 하트비트로 fresh 상태 복원).
- `node --check background.js` 통과, DevTools-closed 플로우의 `devtoolsConnected: false` 응답 동작 불변.

---

## M1. manifest `minimum_chrome_version` (1줄 보강)

**근거:** 의존하는 동작들의 하한 — `chrome.scripting` world:MAIN과 `storage.session`은 Chrome 102+, 포트 메시지의 SW 수명 규칙은 114+. 구버전 Chrome에서의 미정의 동작을 차단한다.

**구현:** `manifest.json`에 `"minimum_chrome_version": "114"` 추가 (권한 변경 아님). `docs/REFERENCES.md`에 한 줄 adoption 기록.

**수용 기준:** 확장 reload 정상, 기능 변화 없음.

---

## R8. Puppeteer 로컬 e2e 회귀 하네스

**배경:** 유일하게 남은 검증 병목은 수동 Chrome 플로우다. 공식 경로(Chrome for Developers의 Puppeteer 확장 테스트 가이드)대로 unpacked 확장을 로드하고, Instagram 없이 합성 fixture 페이지로 전체 파이프라인(주입→수집→비교→저장)을 자동 회귀한다.

**선행 결정 기록 (구현 전 수행):** `docs/REFERENCES.md`에 adoption 기록 추가 — "puppeteer를 devDependency로 채택. 근거: developer.chrome.com의 공식 확장 테스트 가이드(how-to/test/puppeteer). 범위: 개발 전용, 런타임 4종 스크립트와 배포 manifest에 영향 없음."

### R8-1. 프로젝트 파일

1. `package.json` 신규 (리포 루트):
   ```json
   {
     "name": "ig-follower-comparator-dev",
     "private": true,
     "type": "module",
     "scripts": {
       "e2e": "node tools/e2e/run.mjs"
     },
     "devDependencies": {
       "puppeteer": "^24.0.0"
     }
   }
   ```
2. `.gitignore` 신규: `node_modules/`, `package-lock.json은 커밋한다`(주석 아님 — lock 파일은 커밋 대상), `tools/e2e/.build/`.

### R8-2. 테스트 전용 확장 빌드 — `tools/e2e/build-test-extension.mjs`

- `manifest.json`, `background.js`, `main.js`, `devtools.js`, `devtools.html`, `page-network-bridge.js`를 `tools/e2e/.build/`로 복사.
- 복사본 manifest에만 `"host_permissions": ["http://127.0.0.1/*"]` 추가 + `description` 앞에 `[E2E TEST BUILD] ` 접두 (실수로 배포본과 혼동 방지).
- 파일 상단 주석: "배포 manifest는 불변. host_permissions는 액션 클릭 제스처 없이 chrome.scripting.executeScript를 fixture 페이지에 쓰기 위한 테스트 빌드 전용 권한."
- node 내장(fs)만 사용.

### R8-3. fixture 서버 — `tools/e2e/fixture-server.mjs`

`node:http`로 127.0.0.1 임의 포트에 정적 HTML 서빙. **Instagram 마크업을 복사하지 말고 의미론만 모사** (role/href 패턴 — AGENTS.md의 semantic selector 원칙과 대칭):

- 합성 데이터: `followers = e2e_user_001..036`(36명), `following = e2e_user_013..042`(30명) → ground truth: 맞팔 24, followers-only 12, following-only 6. 이 기대값을 모듈 상수로 export.
- `/fixtureprofile/` 페이지:
  - 헤더에 `<a href="/fixtureprofile/followers/">팔로워 36</a>`, `<a href="/fixtureprofile/following/">팔로잉 30</a>`.
  - **앵커 클릭은 반드시 `preventDefault()`** 후 `history.pushState` + `role="dialog"` 모달 생성 (실네비게이션이 일어나면 콘텐츠 스크립트 컨텍스트가 죽는다 — 이 fixture의 최대 함정).
  - 모달: 고정 높이(예: 400px) `overflow:auto` 스크롤 박스 + 행은 `<a href="/e2e_user_001/">e2e_user_001</a>` 형태, 초기 12행 렌더 후 **스크롤이 바닥 근처에 오면 다음 12행 append** (페이지네이션 모사). `aria-label="닫기"` 버튼이 모달 제거 + `history.pushState`로 복귀.
  - (선택) `?recycle=1` 쿼리로 "위쪽 행 제거" 가상화 모드 — R3 observer가 폴링 누락분을 채우는지 검증용. 기본 시나리오에는 미사용.
- 외부 리소스 로드 0건.

### R8-4. 러너 — `tools/e2e/run.mjs`

공통 절차:
1. build-test-extension 실행 → fixture 서버 기동(포트 동적).
2. `puppeteer.launch({ headless: false, args: ["--disable-extensions-except=<.build 절대경로>", "--load-extension=<.build 절대경로>"] })`. (신형 headless가 확장을 지원하면 `headless: "new"` 시도 가능 — 실패 시 headful 유지. CI 아님, 로컬 게이트.)
3. SW 핸들: `const swTarget = await browser.waitForTarget((t) => t.type() === "service_worker"); const worker = await swTarget.worker();`
4. fixture 페이지 열기 → tabId 획득: `worker.evaluate(() => chrome.tabs.query({ url: "http://127.0.0.1/*" }).then(tabs => tabs[0]?.id))`.
5. **주입은 background 전역 함수를 직접 호출**: `worker.evaluate((tabId) => injectInstagramCollector(tabId), tabId)` — 액션 클릭과 동일 경로(단, isInstagramTabUrl 게이트는 우회됨을 주석으로 명시).
6. 페이지 콘솔 로그를 배열로 수집(`page.on("console", ...)`) — 한국어 요약/경고 어서션에 사용.

시나리오 (각각 독립 페이지에서, 실패 시에도 나머지 진행 후 종합 보고):
- **A. 표준 수집:** 주입 → `page.waitForFunction(() => window.__igFollowerResult, { timeout: 120000 })` → 어서션: `followers.length === 36`, `following.length === 30`, `diffs.mutualCount === 24`, `diffs.followersWithoutMeFollowing.length === 12`, `diffs.iFollowButNotReturned.length === 6`, `diffs.integrity.ok === true`, 콘솔에 "비교 결과" 카드 존재.
- **B. 더블 주입(재진입):** 주입 직후 2초 뒤 한 번 더 주입 → 결과 대기 → 콘솔에 "이전 수집 실행이 아직 진행 중" 로그 존재 + 최종 `__igFollowerResult.runId`가 두 번째 실행의 것 하나뿐.
- **C. 모달 강제 닫기:** 주입 → followers 모달이 열린 것 확인 후 `page.evaluate`로 dialog 요소 제거 → 결과 대기 → `scroll.followersEndReason`이 `scroll_box_detached`(또는 동급 partial 사유)이고 partial 한국어 경고가 콘솔에 존재.
- **D. 429 합성 신호:** 주입 → 수집 중 `page.evaluate(() => window.postMessage({ source: "ig-page-network-bridge", schemaVersion: 1, type: "IG_PAGE_NETWORK_STATUS", reason: "rate-limited", capturedAt: new Date().toISOString() }, "*"))` → 콘솔에 "요청 제한(429) 신호 감지" + "일시정지" 로그 존재 확인. (백오프 60초를 기다리지 않는다 — 로그 어서션 후 페이지를 닫아 시나리오 종료. 결과 객체 대기 금지.)
- **E. (선택) SW 상태 미러:** A 수행 후 `worker.evaluate(() => chrome.storage.session.get("ig_devtools_tabs_state:v1"))`... DevTools 페이지가 없는 e2e에선 devtoolsTabs가 비어 있을 수 있으므로, 대신 **R6 검증**으로 대체: `chrome.storage.session.get`으로 프로필 스냅샷 키와 lastRun `{ref}` 형태를 어서션. CDP `ServiceWorker.stopAllWorkers` 기반 SW 재기동 테스트는 시도하되 실패 시 `skipped`로 보고(공식 termination 가이드 패턴이 환경에 따라 flaky할 수 있음).
- 종료: 시나리오별 pass/fail/skipped 표를 stdout에 출력, 하나라도 fail이면 exit 1.

### R8-5. 문서 연결

- `CLAUDE.md` Validation 섹션과 `AGENTS.md` Manual Validation에 선택 게이트로 추가: `npm run e2e` (최초 1회 `npm install` 필요, 런타임 변경 시 권장).
- `docs/HANDOFF.md`에 e2e 실행 방법/제약(헤드풀 창이 뜸, 네트워크 필요) 기록.

**수용 기준:** `npm install && npm run e2e`가 시나리오 A~D pass (E는 pass 또는 skipped). 런타임 스크립트 4종과 배포 `manifest.json`의 diff가 없음(`git diff`로 확인 — e2e는 tools/와 문서만 추가).

---

## 2. 회귀 체크리스트 (전 항목 완료 후)

1. `node --check` 3종 + fixture 2종 통과.
2. 수동 Chrome 표준 플로우(확장 reload → 탭 reload → DevTools 먼저 → 액션 클릭): 기준 계정 pass shape 기존과 동일, 저장 로그에 KB 표기.
3. SW inspector에서 `ig_devtools_tabs_state:v1` 미러 확인 (R5).
4. lastRun 키가 `{ref}` 형태 (R6).
5. `npm run e2e` 시나리오 A~D pass (R8).
6. `chrome://extensions` 에러 패널 신규 warn/error 없음.
7. `git diff manifest.json` — `minimum_chrome_version` 한 줄만 (M1).

## 3. 문서 갱신 의무 (구현 완료 시)

- `docs/BACKLOG.md`: "2026-06-11 Platform Stability" 섹션에 R5/R6/M1/R8 상태 기록. 2026-06-07 open 항목 "compact every large stored snapshot section with explicit limits and truncated flags" → done(R6).
- `docs/REFERENCES.md`: R5(SW lifecycle 공식 규칙 채택), R6(storage quota 가드), R8(puppeteer devDependency), M1(minimum_chrome_version) adoption 기록.
- `docs/RELIABILITY_RESEARCH_2026-06-10.md`: R5/R6/R8 상태를 adopted로 갱신.
- `docs/SECURITY.md`: "e2e 테스트 빌드만 localhost host_permissions를 가지며 배포 manifest는 불변" 1단락 추가.
- `docs/HANDOFF.md`: 세션 상태·e2e 사용법·미수행 검증 사유 기록.
- `CLAUDE.md`/`AGENTS.md`: 검증 절차에 e2e 선택 게이트 추가 (R8-5).

## 4. 명시적 비범위

- R1(공식 내보내기 임포트), R9의 nonce 하드닝 — 별도 계획.
- e2e의 CI 연동, headless 강제, Playwright 병행 지원.
- `devtoolsTabs` 외 다른 background 상태의 영속화(현재 다른 전역 상태 없음 — 새로 만들지도 말 것).
- 스냅샷 예산 초과를 이유로 한 `storage.local`/`unlimitedStorage` 도입 (권한 확대 금지).
- 런타임 스크립트에 테스트 전용 분기/훅 추가.
