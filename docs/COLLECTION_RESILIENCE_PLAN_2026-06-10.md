# 수집 견고화·정확도 마무리 구현 계획서 (2026-06-10)

구현 담당 에이전트(Codex)용 실행 계획서. 이 문서만 읽고 바로 구현 가능하도록 작성됨.
근거 리서치: `docs/RELIABILITY_RESEARCH_2026-06-10.md` (R2, R3, R4, R7, R10 채택분).

## 0. 시작 전 필독

1. `AGENTS.md`(canonical 규칙)와 이 문서의 1장 불변 조건을 먼저 읽을 것.
2. 라인 번호는 **2026-06-10 작업 트리 기준 anchor**다. 반드시 함수명/상수명으로 재확인할 것.
3. 구현 순서는 **R4 → R7 → R2 → R3 → R10** (작고 독립적인 것부터, 위험한 것은 뒤로).
4. 항목 하나 완료할 때마다 실행:
   ```bash
   node --check main.js
   node --check background.js
   node --check devtools.js
   node tools/walker-fixtures.mjs
   ```
   R10 완료 후부터는 `node tools/compare-fixtures.mjs`도 추가.
5. 커밋은 항목 ID당 1개, 메시지에 ID 포함 (예: `R4: abort run on profile change`).

## 1. 불변 조건 (위반 시 해당 변경 롤백)

- `EXECUTION_MODE`/`FOLLOW_ACTION_ENABLED=false`/`FINAL_DIFF_POLICY`/`PAGE_NETWORK_AUTO_ASSIST_ENABLED=false` 불변.
- 사용자 대면 콘솔 출력은 한국어. 예상 가능한 degraded 상태에 `console.warn`/`error` 금지 — `console.log`만.
- partial 결과는 항상 출력+저장. 새 중단 경로는 반드시 (a) 한국어 사유, (b) `state.lastScrollEndReason` 또는 `summary.lastError`, (c) 가능 시 partial persist 포함.
- **429 대응은 관측과 대기만이다. 재시도·재요청·요청 생성 금지.** 에러 응답의 body 내용 검사·저장 금지(상태 코드만 사용).
- **observer 증거는 DOM 등급이다.** 네트워크 확정 증거를 절대 덮지 않으며, 기존 dom-candidate 정책(네트워크 확정 후 DOM 신규는 candidate)을 그대로 따른다.
- username 하드코딩 금지. 원본 payload/쿠키/헤더 저장 금지(`docs/SECURITY.md`).
- fixture에는 합성 데이터(a/b/c 등)만. 실제 계정 데이터 금지.

---

## R4. 실행 중 프로필 변경(SPA soft navigation) 감지 — 가장 작은 항목

**문제:** Instagram은 SPA라서 실행 중 다른 프로필로 이동해도 콘텐츠 스크립트와 수집 루프가 계속 돈다. `getProfileKey()`(main.js:2661)가 호출 시점의 location을 읽으므로, 도중 이동하면 **다른 프로필 이름으로 결과가 라벨링·저장**될 수 있다.

**구현 (`main.js`):**

1. state에 `runProfile: null` 필드 추가. `main()`의 `state.runId` 설정 직후(line 3325 부근)에:
   ```js
   state.runProfile = getProfileKey();
   ```
   리셋 블록에서 별도 초기화 불필요(매 실행 덮어씀).
2. 헬퍼 추가 (`isRunSuperseded` 근처, line 145 부근):
   ```js
   function hasProfileChanged() {
       return Boolean(state.runProfile) &&
           state.runProfile !== "unknown_profile" &&
           getProfileKey() !== state.runProfile;
   }
   ```
3. **루프 체크:** `scrollUntilEnd`의 while 루프 선두 체크 묶음(superseded → time cap → detached 순서, line 2542~2556)에 추가:
   ```js
   if (hasProfileChanged()) {
       console.log(`🛑 ${baseLog} 수집 중 프로필이 변경되어(${state.runProfile} → ${getProfileKey()}) 현재까지의 partial 결과로 종료합니다.`);
       state.lastScrollEndReason = "profile_changed";
       break;
   }
   ```
   `reverifyCurrentListCollection`의 pass 루프 선두에도 동일 취지 체크 추가(반환: `{ ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "profile_changed" }`).
4. **main() 단계 경계 체크:** 기존 `isRunSuperseded()` 단계 경계 체크와 같은 지점들에 추가. superseded와 달리 **persist는 수행한다**:
   ```js
   if (hasProfileChanged()) {
       summary.status = "aborted_profile_changed";
       summary.lastError = `실행 중 프로필이 ${state.runProfile}에서 ${getProfileKey()}(으)로 변경되어 중단했습니다.`;
       persistFollowers(Array.from(state.collectedUsers), summary.diffs);
       printSummary(summary);
       return;
   }
   ```
5. **저장 경로를 시작 프로필로 고정 (중요):** 프로필 변경 후 persist가 새 프로필 키로 저장되는 것을 막는다.
   - `getProfileKey()` 자체는 건드리지 말 것(라이브 비교용). 대신 호출처 3곳을 수정:
     - `getStorageKey()`(line 2666): `${STORAGE_PREFIX}:${state.runProfile || getProfileKey()}`
     - `persistFollowers`의 payload `profile` 및 `source` 필드: `state.runProfile || getProfileKey()` 사용.
     - `buildDebugReport`의 `targetProfile`(line 380대 내부): `state.runProfile || getProfileKey()` 사용.
   - `explainUsername`의 `currentProfile`은 라이브 `getProfileKey()` 유지(저장본과 현재 페이지 비교가 목적이므로).

**수용 기준:** 수집 도중 뒤로가기/다른 프로필 클릭 시 수 초 내 한국어 안내 + `profile_changed`/`aborted_profile_changed` 상태로 partial 저장. 저장 키와 `payload.profile`은 시작 프로필. 프로필 변경이 없으면 기존 동작과 완전 동일.

---

## R7. DevTools 캡처 컨텍스트의 onNavigated 인지

**문제:** 페이지가 리로드/이동되면 DevTools 네트워크 캡처 컨텍스트가 바뀌는데 `devtools.js`는 이를 구분하지 않는다. 리로드 전 누적 `matched`/`sent` 카운터가 새 페이지의 상태처럼 보이고, content 쪽도 컨텍스트 리셋을 모른다. 공식 문서 근거: `chrome.devtools.network.onNavigated` 이벤트, "DevTools를 늦게 열면 이전 요청 누락" 주석 (`docs/REFERENCES.md`의 devtools/network 문서).

**구현 (`devtools.js`):**

1. `stats` 객체(line 9~24)에 필드 추가: `navigations: 0, lastNavigatedAt: ""`.
2. `chrome.devtools.network.onRequestFinished` 리스너(line 280) 아래에 추가:
   ```js
   chrome.devtools.network.onNavigated.addListener((url) => {
     stats.navigations++;
     stats.lastNavigatedAt = new Date().toISOString();
     stats.matched = 0;
     stats.sent = 0;
     stats.ignored = 0;
     stats.failed = 0;
     console.log("[IG DevTools] inspected page navigated:", getSafeUrlLabel(url || ""), getStatsSnapshot());
     sendStatus("navigated");
   });
   ```
   주의: raw URL을 그대로 찍지 말고 기존 `getSafeUrlLabel` 사용(쿼리스트링 제거 — SECURITY.md).
   per-page 카운터(matched/sent/ignored/failed)만 리셋하고 누적 성격 필드(acked, readySent, statusSent, lastSeq, navigations)는 유지한다.

**구현 (`main.js`):**

3. `installExtensionMessageBridge`(line 1056~)의 `IG_DEVTOOLS_STATUS` 분기 안, stats 기록 직후에 추가:
   ```js
   if (message.reason === "navigated") {
       recordRunEvent("devtools_capture_navigated", { at: message.capturedAt || null });
       console.log("🧭 DevTools 캡처 컨텍스트가 페이지 이동으로 초기화되었습니다. 수집 중이었다면 followers/following 목록을 다시 열어 주세요.");
   }
   ```
   (배경: background의 `buildRelayPayload`가 STATUS 메시지의 `reason`을 이미 전달하므로 background.js 수정은 불필요.)

**수용 기준:** DevTools를 연 채 Instagram 탭을 리로드하면 (a) DevTools 콘솔에 navigated 로그 + per-page 카운터 0 리셋, (b) 페이지 콘솔에 한국어 안내 1줄, (c) 수집 실행 중이었다면 runTimeline에 `devtools_capture_navigated` 이벤트. 하트비트/캡처 동작은 기존과 동일하게 지속.

---

## R2. 429(레이트리밋) 감지 + 지수 백오프 일시정지

**문제:** Instagram이 목록 요청에 429를 반환하기 시작하면 이후 페이지네이션이 전부 비고, 현재 런타임은 이를 "정체(stall)"로만 인식해 빈 스크롤을 계속 시도한다. 대형 계정 미수집의 1순위 원인이며 계정 보호 관점에서도 즉시 감속이 표준 대응(지수 백오프).

**신호 관측 경로 (privacy: 상태 코드만, 에러 body는 읽지 않는다):**

1. **`devtools.js` — 주(主) 관측 경로.** `onRequestFinished` 리스너(line 280) 선두, `isCandidateRequest` 호출 **앞**에 추가 (429 응답은 mimeType이 JSON이 아닐 수 있어 `isCandidateRequest`의 mime 필터를 통과하지 못하므로 별도 검사가 필요):
   ```js
   const requestUrl = request?.request?.url || "";
   const responseStatus = request?.response?.status || 0;
   if (responseStatus === 429 && isInstagramUrl(requestUrl) && CANDIDATE_URL_RE.test(requestUrl)) {
     stats.lastError = "rate-limited-429";
     console.log("[IG DevTools] 429 rate limit observed:", getSafeUrlLabel(requestUrl));
     sendStatus("rate-limited");
     stats.ignored++;
     return;
   }
   ```
2. **`page-network-bridge.js` — 보조 경로** (hooks가 enable된 경우에만 동작한다는 한계를 코드 주석으로 명시):
   - XHR `load` 핸들러(line 180~) 선두: url 계산 직후에
     ```js
     if (this.status === 429 && shouldInspectUrl(url)) {
       postStatus("rate-limited", { transport: "page-XHR", httpStatus: 429 });
       return;
     }
     ```
   - fetch 래퍼(line 210)의 `if (response?.ok)` 앞에:
     ```js
     if (response?.status === 429) {
       postStatus("rate-limited", { transport: "page-fetch", httpStatus: 429 });
       return response;
     }
     ```
3. **`main.js` 콘솔 paste 모드 보조:** `hookNetwork`의 XHR load 핸들러(현재 `this.status !== 200 return` 부근)에서 `this.status === 429 && FOLLOWERS_URL_RE.test(url)`이면 `registerRateLimitSignal("page-hook")` 호출 후 return.

**신호 처리 (`main.js`):**

4. 상수 추가:
   ```js
   const RATE_LIMIT_BASE_PAUSE_MS = 60_000;
   const RATE_LIMIT_MAX_PAUSE_MS = 240_000;
   const RATE_LIMIT_MAX_EVENTS = 3;
   const RATE_LIMIT_DEDUP_WINDOW_MS = 10_000;
   ```
5. state에 추가(리셋 블록에서도 초기화):
   ```js
   rateLimit: { count: 0, lastDetectedAtMs: 0, pausedUntilMs: 0, lastOrigin: null }
   ```
6. 헬퍼 추가:
   ```js
   function registerRateLimitSignal(origin) {
       const now = Date.now();
       if (state.rateLimit.lastDetectedAtMs && now - state.rateLimit.lastDetectedAtMs < RATE_LIMIT_DEDUP_WINDOW_MS) {
           return; // 같은 사건의 중복 신호 흡수
       }
       state.rateLimit.count++;
       state.rateLimit.lastDetectedAtMs = now;
       state.rateLimit.lastOrigin = origin;
       const pauseMs = Math.min(RATE_LIMIT_BASE_PAUSE_MS * 2 ** (state.rateLimit.count - 1), RATE_LIMIT_MAX_PAUSE_MS);
       state.rateLimit.pausedUntilMs = Math.max(state.rateLimit.pausedUntilMs, now + pauseMs);
       recordRunEvent("rate_limit_detected", { origin, count: state.rateLimit.count, pauseMs });
       console.log(`🚦 Instagram 요청 제한(429) 신호 감지 (출처: ${origin}, ${state.rateLimit.count}회째). 스크롤을 약 ${Math.round(pauseMs / 1000)}초 일시정지합니다.`);
   }
   ```
   백오프 결과: 1회=60초, 2회=120초, 3회=240초(상한), 4회째 감지=수집 중단.
7. **신호 수신 연결:**
   - `installPageNetworkBridgeListener`의 `IG_PAGE_NETWORK_STATUS` 분기(line 746~759) 안에 추가: `if (message.reason === "rate-limited") registerRateLimitSignal("page-network");` (이 reason이 `lastError` 정규식 `/failed|too-large/`에 안 걸리는 현 상태 유지).
   - `installExtensionMessageBridge`의 `IG_DEVTOOLS_STATUS` 분기 안에 추가: `if (message.reason === "rate-limited") registerRateLimitSignal("devtools");`
8. **스크롤 루프 반영 (`scrollUntilEnd`):**
   - 루프 진입 전 `let pausedTotalMs = 0;` 선언.
   - while 루프 선두 체크 묶음(R4 체크 다음)에 추가:
     ```js
     if (state.rateLimit.count > RATE_LIMIT_MAX_EVENTS) {
         console.log(`🚦 ${baseLog} 요청 제한이 반복 감지되어 partial 종료합니다. 몇 분 뒤(권장 10분 이상) 다시 실행하세요.`);
         state.lastScrollEndReason = "rate_limited";
         break;
     }
     if (Date.now() < state.rateLimit.pausedUntilMs) {
         const remainMs = state.rateLimit.pausedUntilMs - Date.now();
         console.log(`🚦 요청 제한 대기 중: 약 ${Math.ceil(remainMs / 1000)}초 후 재개합니다.`);
         const chunk = Math.min(remainMs, 5000);
         pausedTotalMs += chunk;
         await wait(chunk, 0);
         continue;
     }
     ```
     5초 단위로 쪼개 superseded/profile-changed 체크가 대기 중에도 동작하게 한다.
   - 시간 상한 체크(line 2547)를 대기 시간 제외로 보정: `if (Date.now() - startedAt - pausedTotalMs > MAX_COLLECTION_MS)`.
   - `reverifyCurrentListCollection`에도 동일한 중단 체크(`count > RATE_LIMIT_MAX_EVENTS` → `reason: "rate_limited"` 반환)와 대기 체크를 pass 루프 선두에 추가.
9. **출력/리포트 반영:**
   - `buildDebugReport` 반환 객체에 `rateLimit: { ...state.rateLimit }` 추가 (`background.js`의 `compactDebugReport`에도 같은 필드 통과시키기 — 객체 4필드뿐이라 캡 불필요).
   - `printDecisionCard`와 `printSummary`에서 `state.rateLimit.count > 0`이면: `console.log(\`🚦 요청 제한 감지 ${state.rateLimit.count}회: 일부 수집이 지연되었거나 중단되었습니다. 결과가 부족하면 몇 분 뒤 재실행하세요.\`)`.
   - `getListReliability`는 수정하지 않는다(기존 partial 로직이 부족분을 이미 표현).

**수용 기준:**
- 합성 신호 테스트: 수집 실행 중 페이지 콘솔에서
  ```js
  window.postMessage({ source: "ig-page-network-bridge", schemaVersion: 1, type: "IG_PAGE_NETWORK_STATUS", reason: "rate-limited", capturedAt: new Date().toISOString() }, "*");
  ```
  주입 → 🚦 감지 로그 + 스크롤이 약 60초 일시정지 후 재개. 3회 주입 시 60→120→240초로 증가, 4회째에 `rate_limited` partial 종료 + 디버그 리포트에 `rateLimit.count === 4`.
- 429가 없는 정상 실행에서는 로그·동작 변화 없음.
- 대기 중 다른 프로필로 이동하면 5초 내 `profile_changed`로 전환(체크 인터리빙 확인).

---

## R3. MutationObserver 행 수집 + IntersectionObserver 종료 센티널

**문제:** 가상화 목록은 DOM 노드를 재활용한다. 현재 수집은 스크롤 tick마다 폴링(`collectFromDOM`)이므로 **tick 사이에 렌더됐다 재활용으로 사라진 행은 영원히 누락**된다. MutationObserver는 추가되는 모든 노드를 통지하므로 이 구조적 구멍을 막는다. (REFERENCES.md에 방향 기채택 — 이번이 런타임 구현.)

**구현 (`main.js`):**

1. **DOM 등급 소스 집합 정의 (R3·R10 공용, 가드레일 핵심):** 상수 추가
   ```js
   const DOM_TIER_SOURCES = new Set(["DOM", "dom-observer"]);
   const DOM_CANDIDATE_SOURCES = new Set(["dom-candidate", "dom-observer-candidate"]);
   ```
   그리고 기존 "DOM-only" 판정 3곳을 이 집합 기준으로 교체:
   - `demoteDomOnlyConfirmedUsers`: `sources.some((source) => source !== "DOM")` → `sources.some((source) => !DOM_TIER_SOURCES.has(source))`
   - `getOvercountLowConfidenceExclusions`(line 2720): `sources.every((source) => source === "DOM")` → `sources.every((source) => DOM_TIER_SOURCES.has(source))`
   - `promoteDomCandidatesToConfirmed`(line 320): `sources.includes("dom-candidate")` → `sources.some((source) => DOM_CANDIDATE_SOURCES.has(source))`
   이렇게 해야 observer로만 본 계정이 "DOM-only" 정책(과수집 제외, 네트워크 도착 시 강등, bounded fallback)을 똑같이 적용받는다.
2. **observer 생성/배수 헬퍼:**
   ```js
   function createRowObserver(scrollBox) {
       const queue = new Set();
       const observer = new MutationObserver((mutations) => {
           for (const mutation of mutations) {
               for (const node of mutation.addedNodes) {
                   if (!(node instanceof Element)) continue;
                   const anchors = node.matches?.("a[href]")
                       ? [node]
                       : Array.from(node.querySelectorAll?.("a[href]") || []);
                   for (const anchor of anchors) {
                       const username = extractProfileUsername(anchor.getAttribute("href") || "");
                       if (username && queue.size < 5000) queue.add(username);
                   }
               }
           }
       });
       observer.observe(scrollBox, { childList: true, subtree: true });
       return { observer, queue };
   }

   function drainObserverQueue(queue, targetSet, mode) {
       if (!queue || queue.size === 0) return 0;
       const networkConfirmedForMode = hasConfirmedNetworkEvidence(mode);
       let added = 0;
       for (const username of queue) {
           if (networkConfirmedForMode && !targetSet.has(username)) {
               addCandidateUsername(username, mode, "dom-observer-candidate", "observer-row-after-network-confirmed");
               continue;
           }
           if (addUsername(username, targetSet, "dom-observer", mode, {
               reason: "observer-added-row",
               phase: `${mode}-observer`
           })) {
               added++;
           }
       }
       queue.clear();
       return added;
   }
   ```
   observer 콜백 안에서는 href 추출만 한다(레이아웃 강제 금지, 무거운 작업은 drain 시점에).
   `normalizeSourceLabel`은 미정의 라벨을 원문 그대로 반환하므로 수정 불필요.
3. **`scrollUntilEnd` 통합:**
   - scrollBox 검증 직후 `let rowObserver = createRowObserver(scrollBox);` 생성.
   - while 루프 본문에서 `collectFromDOM` 호출 직후에:
     ```js
     const observerAdded = drainObserverQueue(rowObserver.queue, targetSet, modeLabel);
     ```
   - 안정화 판정(line 2597)에 반영: `if (currentCount === lastCount && beforeDom === 0 && observerAdded === 0)` 로 변경 (observer가 새 계정을 잡으면 정체로 보지 않는다).
   - `recordScrollDiagnostic` options에 `observerAdded` 전달, diagnostic 객체에 `observerAdded` 필드 추가, 상세 로그 문자열에 `observer 추가: ${observerAdded}` 포함.
   - 복구(`attemptScrollRecovery`)가 새 scrollBox를 반환해 교체되는 지점(line 2613)에서: `rowObserver.observer.disconnect(); rowObserver = createRowObserver(scrollBox);`
   - **while 루프 전체를 try/finally로 감싸고 finally에서 `rowObserver.observer.disconnect()`** (모든 break/예외 경로에서 누수 방지). 루프 뒤의 기존 마무리 코드(result 계산~recordRunEvent)는 finally 뒤에 그대로 둔다.
4. **IntersectionObserver 종료 센티널:**
   - `scrollUntilEnd`에서 observer와 함께 생성:
     ```js
     const endSignal = { visible: false, atMs: 0 };
     const endSentinel = new IntersectionObserver((entries) => {
         for (const entry of entries) {
             if (entry.isIntersecting) {
                 endSignal.visible = true;
                 endSignal.atMs = Date.now();
             }
         }
     }, { root: scrollBox, threshold: 0.6 });
     let observedLastAnchor = null;
     ```
   - 매 tick에서 `profileLinks`의 마지막 anchor가 바뀌었으면 `endSentinel.unobserve(observedLastAnchor)`(있을 때) 후 새 anchor `observe`, `observedLastAnchor` 갱신.
   - stall 종료 분기(line 2622~2632)에서 reason 정밀화: 기존 `"stalled"`가 되는 경우에 한해
     ```js
     const endConfirmed = endSignal.visible && Date.now() - endSignal.atMs < 8000;
     state.lastScrollEndReason = recoveryAttempts > 0
         ? "stalled_after_recovery"
         : endConfirmed ? "stalled_at_list_end" : "stalled";
     if (endConfirmed) console.log(`✅ ${baseLog} 마지막 행이 화면에 보이는 상태로 정체 → 목록 끝 도달 가능성이 높습니다.`);
     ```
   - finally에서 `endSentinel.disconnect()`.
   - `"stalled_at_list_end"`는 새 진단 값일 뿐, 어떤 분기 로직에도 사용하지 않는다(다운스트림은 문자열을 표시만 함 — `explainUsername`의 `target_reached` 비교만 존재함을 확인했다).

**수용 기준:**
- 표준 수집에서 진단 로그에 `observerAdded` 필드가 나타나고, 최종 수집 수가 기존 대비 같거나 많다(적어지면 회귀).
- 수집 완료 후 provenance에 `dom-observer` 소스가 보일 수 있고(예: `__igFollowerExplainUser`), DevTools 확정 payload가 도착한 이후 발견된 observer 계정은 `dom-observer-candidate`로만 남는다(확정 세트 미오염 — 가드레일).
- 목록 끝까지 정상 스크롤된 작은 계정에서 종료 사유가 `stalled_at_list_end` 또는 `target_reached`.
- 모든 종료 경로(시간 상한, superseded, profile_changed, rate_limited 포함)에서 observer가 disconnect됨 (try/finally 구조 확인).

---

## R10. 정확도 정책 마무리 — evidence 랭킹 + 비교 로직 fixture

**문제:** `promoteDomCandidatesToConfirmed`(line 322 `.sort()`)와 `getOvercountLowConfidenceExclusions`(line 2722~2727)가 **알파벳순**으로 승격/제외 대상을 고른다. 증거 강도와 무관한 선택이라 백로그 open 항목("rank DOM fallback promotions by evidence strength")으로 추적 중. 비교 로직(`getCompareIntegrity` 등)은 fixture가 없다.

**구현 (`main.js`):**

1. **공용 비교자 추가** (`promoteDomCandidatesToConfirmed` 근처):
   ```js
   function compareCandidateEvidence(aInfo, bInfo) {
       const aSeen = aInfo?.seenCount || 0;
       const bSeen = bInfo?.seenCount || 0;
       if (aSeen !== bSeen) return bSeen - aSeen;
       const aSources = aInfo?.sources?.size ?? (Array.isArray(aInfo?.sources) ? aInfo.sources.length : 0);
       const bSources = bInfo?.sources?.size ?? (Array.isArray(bInfo?.sources) ? bInfo.sources.length : 0);
       if (aSources !== bSources) return bSources - aSources;
       const aLast = aInfo?.lastSeenAt || "";
       const bLast = bInfo?.lastSeenAt || "";
       if (aLast !== bLast) return aLast > bLast ? -1 : 1;
       return 0;
   }
   ```
   의미: 관찰 횟수 많음 > 소스 다양함 > 최근 관찰. 음수면 a가 더 강한 증거. wall-clock을 쓰지 않아 결정적(fixture 가능).
2. **승격 랭킹 교체:** `promoteDomCandidatesToConfirmed`의 `.sort()`(line 322)를
   ```js
   .sort((a, b) => compareCandidateEvidence(bucket?.get(a), bucket?.get(b)) || a.localeCompare(b))
   ```
   로 교체 (강한 증거부터 승격, 동률은 알파벳). 승격 시 `recordRunEvent("dom_candidates_promoted_ranked", { mode, promoted: promoted.slice(0, 20).map((username) => ({ username, seenCount: bucket?.get(username)?.seenCount || 0, sourceCount: bucket?.get(username)?.sources?.size || 0 })) })` 기록.
3. **과수집 제외 랭킹 교체:** `getOvercountLowConfidenceExclusions`의 sort(line 2722~2727)를
   ```js
   .sort((a, b) => {
       const aCreatesDiff = oppositeSet.has(a) ? 1 : 0;
       const bCreatesDiff = oppositeSet.has(b) ? 1 : 0;
       if (aCreatesDiff !== bCreatesDiff) return aCreatesDiff - bCreatesDiff;
       const evidence = compareCandidateEvidence(bucket?.get(b), bucket?.get(a)); // 약한 증거 먼저 제외
       if (evidence !== 0) return evidence;
       return a.localeCompare(b);
   })
   ```
   로 교체. **기존 1순위 기준(diff를 만들지 않는 계정 먼저 제외)은 유지**하고, 2순위만 알파벳→약한 증거 순으로 바꾼다 (2026-06-06 가드레일 보존).
4. **fixture를 위한 주입 가능화:** `getOvercountLowConfidenceExclusions` 시그니처를
   ```js
   function getOvercountLowConfidenceExclusions(mode, sourceSet, oppositeSet, expectedCount, bucket = state.userProvenance[mode]) {
   ```
   로 변경하고 내부의 `state.userProvenance[mode]` 직접 참조를 `bucket` 사용으로 교체. 기존 호출부(2곳, `compareFollowSets` 내부)는 인자 4개 그대로 → 동작 불변.

**구현 (`tools/compare-fixtures.mjs` 신규):**

5. `tools/walker-fixtures.mjs`의 `loadWalkerFrom`(함수명+중괄호 매칭 추출)을 복사해 사용. 다음 3개 함수를 main.js에서 추출·평가해 fixture 검증 (node 내장만, 의존성 금지, 합성 데이터만):
   - **`compareCandidateEvidence`**: `new Function`으로 평가. 검증: seenCount 5 > 3 우선 / seenCount 동률이면 sources 2종 > 1종 / 그것도 동률이면 lastSeenAt 최신 우선 / 완전 동률 0 반환.
   - **`getCompareIntegrity`**: 정상 partition(diffs.followersWithoutMeFollowing 1명 + mutual 2 == followersCount 3) → `ok: true`. mutual을 부풀린 입력 → `ok: false`이고 실패 check의 `code`가 `followers_partition` 포함.
   - **`getOvercountLowConfidenceExclusions`**: `new Function('state', 'compareCandidateEvidence', src)` 형태로 평가(주입한 `compareCandidateEvidence`와 빈 `state` 스텁 전달, bucket은 5번째 인자로 명시 전달). 시나리오:
     - expectedCount 3, sourceSet 5명. 그중 2명은 sources `["DevTools"]`(네트워크) → 절대 제외 안 됨. 3명은 DOM-only(`["DOM"]` 또는 `["dom-observer"]`)이고 seenCount 5/2/1 → 약한 2명(seenCount 1, 2)만 제외되고 seenCount 5는 생존.
     - diff 생성 여부 우선 검증: oppositeSet에 없는 DOM-only(=diff 안 만듦)가 oppositeSet에 있는 DOM-only보다 먼저 제외.
     - `dom-observer` 소스가 DOM-tier로 취급되어 제외 후보에 포함되는지 검증 (R3 연동).
   - 실패 시 비-0 exit, 성공 시 `console.log('compare fixtures passed')`.

**문서 갱신 (R10 완료 시):**

6. `CLAUDE.md`의 Validation 코드블록과 `AGENTS.md`의 Manual Validation 코드블록에 `node tools/compare-fixtures.mjs` 한 줄씩 추가.

**수용 기준:** 두 fixture 명령 모두 통과. 일부러 comparator의 부등호 하나를 바꾸면 `compare-fixtures`가 실패함을 확인 후 원복. 실제 실행에서 과수집 제외 목록이 알파벳 무관하게 증거 약한 순으로 선택됨(디버그 리포트로 확인).

---

## 2. 회귀 체크리스트 (전 항목 완료 후, 수동 Chrome)

전제: 확장 reload → Instagram 탭 reload → DevTools 먼저 열기 → 액션 클릭 (AGENTS.md 절차).

1. **표준 pass shape:** DevTools open 실행 → 기준 계정에서 수집/diff/신뢰도 요약이 기존과 동일 (`docs/HANDOFF.md`의 287/287, diff 0/0 형태). `observerAdded` 진단이 보임.
2. **프로필 변경:** 수집 중 다른 프로필 클릭 → `profile_changed` partial 종료, 저장 키는 시작 프로필.
3. **onNavigated:** DevTools 연 채 탭 리로드 → DevTools 콘솔 navigated 로그 + 페이지 콘솔 한국어 안내.
4. **429 합성 신호:** R2 수용 기준의 postMessage 주입 시나리오(1회 → 60초 대기, 4회 → `rate_limited` 종료).
5. **DevTools-closed 플로우:** `DOM_PREVIEW` 라벨 동작 기존 동일.
6. **에러 패널:** 위 시나리오 후 `chrome://extensions` 에러 패널에 신규 warn/error 없음.
7. **fixture:** `node tools/walker-fixtures.mjs` + `node tools/compare-fixtures.mjs` 통과.

## 3. 문서 갱신 의무 (구현 완료 시)

- `docs/BACKLOG.md`: "2026-06-10 Collection Resilience" 섹션 추가, R2/R3/R4/R7/R10 상태 기록. 기존 open 항목 중 "rank DOM fallback promotions by evidence strength" → done 처리(R10), fixture 관련 open 항목에 compare-fixtures 추가분 주석.
- `docs/REFERENCES.md`: R2(레이트리밋 백오프 관행), R7(devtools.network onNavigated)을 adoption 기록으로 추가하고, 기존 "DOM observation APIs" 항목의 Decision에 "2026-06-10 런타임 채택(R3)" 추기.
- `docs/RELIABILITY_RESEARCH_2026-06-10.md`: R2/R3/R4/R7/R10 상태를 proposed → adopted(구현일 명시)로 갱신.
- `docs/HANDOFF.md`: 세션 상태·다음 액션 갱신. 수동 Chrome 검증 미수행 시 사유 기록.
- `CLAUDE.md`/`AGENTS.md`: R10의 검증 명령 추가 (R10 섹션 6번).

## 4. 명시적 비범위 (이번 작업에서 하지 말 것)

- R1(공식 내보내기 임포트), R5(SW 상태 영속화), R6(quota 가드), R8(Puppeteer e2e), R9(nonce/min version) — 별도 계획.
- 429 외의 상태 코드 처리, 에러 응답 body 파싱, 요청 재시도.
- page-network-bridge의 기본 passive 정책 변경 (429 관측은 hooks enable 시에만 — 한계로 명시).
- 스크롤 대기 시간 단축, diff 정책 변경, 권한 추가, 대규모 리팩터링.
