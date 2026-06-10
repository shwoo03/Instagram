# 안정성·성능 개선 구현 계획서 (2026-06-10)

구현 담당 에이전트(Codex)를 위한 실행 계획서. 이 문서만 읽고 바로 구현할 수 있도록 작성됨.

## 0. 시작 전 필독

1. `AGENTS.md`를 먼저 읽을 것 (canonical 규칙 소스). 특히 "Regression Guardrails from 2026-06-06"과 "Research-backed Guardrails from 2026-06-07" 섹션.
2. 아래 라인 번호는 **2026-06-10 기준 anchor**다. 편집이 진행되면 밀리므로 반드시 함수명/상수명으로 위치를 재확인할 것.
3. 작업 단위는 항목 ID(S1, S2, …) 단위로 진행하고, 각 항목 완료 직후 매번 실행:
   ```bash
   node --check main.js
   node --check background.js
   node --check devtools.js
   ```
4. 커밋을 만든다면 항목 ID당 1커밋. 커밋 메시지에 항목 ID 포함 (예: `S1: prevent concurrent collection runs`).

## 1. 절대 불변 조건 (위반 시 해당 변경 전체 롤백)

- `EXECUTION_MODE = "collect-and-compare"`, `FOLLOW_ACTION_ENABLED = false`, `FINAL_DIFF_POLICY = "verified_members_only"`, `PAGE_NETWORK_AUTO_ASSIST_ENABLED = false` 값을 바꾸지 않는다.
- 사용자 대면 콘솔 출력은 전부 한국어 유지. 새 진단 메시지도 한국어로 추가한다.
- 예상 가능한 degraded 상태(DevTools 미연결 등)에 `console.warn`/`console.error`를 쓰지 않는다. `console.log`만 사용 (확장 에러 패널 노이즈 방지 — AGENTS.md 규칙).
- partial 결과는 절대 숨기지 않는다. 새 종료 경로를 추가하면 반드시 (a) 한국어 사유 출력, (b) `state.lastScrollEndReason` 또는 `summary.lastError` 기록, (c) 가능한 경우 partial persist를 포함한다.
- `manifest.json` 권한 추가 금지. 원본 응답 body, 쿠키, 헤더를 저장·전송하지 않는다 (`docs/SECURITY.md`).
- username 하드코딩 금지. 계정별 분기 금지.
- `main.js`는 콘솔에 직접 붙여넣어도(=chrome.* API가 없어도) 동작해야 한다. `chrome.*` 접근은 전부 가드 뒤에서만.
- `background.js`의 스토리지 압축 캡(`compactProvenance` 5000, `compactSnapshot` 5000/1000 등)은 유지하거나 더 줄이는 방향만 허용.
- DOM-only 계정의 confirmed 승격 규칙(네트워크 확정 후에는 dom-candidate, 부족분 한정 bounded fallback)을 변경하지 않는다.

---

## 2. Phase 1 — 안전망 (최우선)

### S1. 동시 실행(재진입) 가드 + 이전 실행 중단

**문제:** `background.js`의 `chrome.action.onClicked`(line 346)는 클릭마다 `main.js`를 재주입하고, `main.js` 말미(line 3463)는 즉시 `main()`을 호출한다. 실행 중 가드가 없어 아이콘을 두 번 클릭하면 두 수집 루프가 같은 모달을 동시에 스크롤한다. 각 주입은 새 블록 스코프이므로 이전 실행은 자기만의 `state`를 들고 좀비로 계속 돈다.

**구현 (`main.js`):**

1. 상수 근처에 헬퍼 추가:
   ```js
   function isRunSuperseded() {
       return window.__igFollowerActiveRunId !== state.runId;
   }
   ```
2. `main()` 안에서 `state.runId` 생성 직후(현재 line 3254 부근):
   ```js
   window.__igFollowerActiveRunId = state.runId;
   ```
3. 파일 말미 `main();` 호출부를 다음으로 교체:
   ```js
   if (window.__igFollowerRunInProgress === true) {
       console.log("⚠️ 이전 수집 실행이 아직 진행 중입니다. 이전 실행을 중단하고 새 실행을 시작합니다.");
   }
   window.__igFollowerRunInProgress = true;
   main();
   ```
   (`window.__igFollowerRunInProgress` 해제는 S2의 finally에서 수행.)
4. 장기 루프마다 superseded 체크 추가. 체크 지점과 행동:
   - `scrollUntilEnd` while 루프 선두: `state.lastScrollEndReason = "superseded_by_new_run"` 기록 후 `break`. 한국어 로그 1줄.
   - `waitForListSettled` for 루프 선두: `return { ok: false, ticks: tick, snapshot: lastSnapshot, reason: "superseded" }`.
   - `waitForDialogReady` / `waitForDialogClosed` while 루프 선두: `return false`.
   - `reverifyCurrentListCollection` 바깥 pass 루프 선두: `return { ok: false, passes: pass - 1, finalCount: targetSet.size, reason: "superseded" }`.
   - `followVisibleButtons` while 루프 선두: `break` (기본 비활성이지만 안전망으로 포함).
   - `main()`의 주요 단계 경계(아래 지점들)마다:
     ```js
     if (isRunSuperseded()) {
         summary.status = "superseded";
         console.log("🛑 새 실행이 시작되어 이전 실행을 종료합니다. (runId:", state.runId, ")");
         return;
     }
     ```
     지점: `runAccuracyPreflight` 후 / followers `openPopupByType` 후 / followers 수집·reverify 블록 후 / `closeActiveDialog` 후 / following `openPopupByType` 후 / following 수집 블록 후.
5. **중요:** superseded 경로에서는 `persistFollowers`·`printSummary`를 호출하지 않는다 (새 실행의 저장 결과·콘솔 출력을 덮어쓰지 않기 위해). 한국어 로그 1줄 + return만.

**수용 기준:**
- 액션 아이콘을 2초 간격으로 두 번 클릭 → 콘솔에 "이전 실행을 중단" 로그가 찍히고, 최종 결과(`window.__igFollowerResult.runId`)는 두 번째 runId 하나만 존재.
- 단일 클릭의 기존 동작은 변화 없음.

### S2. `main()` 전체 try/catch/finally — 예외 시에도 한국어 요약과 partial 저장

**문제:** `main()`(line 3216) 본문에 전역 예외 처리가 없다. Instagram DOM 변경으로 어디서든 throw가 나면 unhandled rejection으로 끝나고, "partial 결과를 항상 출력한다"는 프로젝트 핵심 규칙이 예외 경로에서 깨진다.

**구현 (`main.js`):** `main()` 안에서 `summary` 초기화와 state 리셋 블록 이후의 본문 전체를 try로 감싼다 (본문을 별도 함수로 추출해도 되고 in-place로 감싸도 됨 — 기존 early `return`은 그대로 동작):

```js
try {
    // ... 기존 본문 전체 (hookNetwork ~ "8) 전체 저장 완료") ...
} catch (e) {
    if (isRunSuperseded()) {
        console.log("🛑 새 실행이 시작되어 이전 실행을 종료합니다.");
        return;
    }
    summary.status = "crashed";
    summary.lastError = `unhandled-exception: ${e?.message || e}`;
    summary.followersCount = state.collectedUsers.size;
    summary.followingCount = state.followingUsers.size;
    console.log("❌ 실행 중 처리되지 않은 예외로 중단되었습니다:", e);
    console.log("ℹ️ 지금까지 수집된 partial 결과를 저장하고 요약을 출력합니다.");
    try {
        persistFollowers(Array.from(state.collectedUsers), summary.diffs);
        printSummary(summary);
    } catch (persistError) {
        console.log("⚠️ partial 결과 저장/출력도 실패했습니다:", persistError?.message || persistError);
    }
} finally {
    if (window.__igFollowerActiveRunId === state.runId) {
        window.__igFollowerRunInProgress = false;
    }
}
```

참고: 정상 경로에서 `persistFollowers`가 이미 호출된 뒤 그 이후 코드에서 throw가 나면 catch에서 한 번 더 저장된다. 같은 키를 덮어쓰는 멱등 동작이므로 허용.

**수용 기준:**
- 검증용으로 본문 중간에 임시 `throw new Error("test")`를 넣고 실행하면: 한국어 예외 안내 + `summary.status === "crashed"` + `window.__igFollowerResult`에 partial 스냅샷 존재 + `__igFollowerRunInProgress === false`. 확인 후 임시 throw 제거.

### S3. 스크롤 박스 분리(detached) 즉시 감지

**문제:** `scrollUntilEnd`(line 2496~)는 사용자가 실행 중 모달을 닫아 scrollBox가 DOM에서 분리돼도 모른 채 `MAX_STABLE_TICKS = 16`회(16~20초)를 헛돈 뒤에야 "정체"로 종료한다.

**구현 (`main.js`):** `scrollUntilEnd` while 루프 선두(S1의 superseded 체크 바로 다음)에 추가:

```js
if (!scrollBox.isConnected) {
    const replacement = findFollowerListBox();
    if (!replacement) {
        console.log(`⚠️ ${baseLog} 목록이 닫혀 스크롤 박스가 사라졌습니다. 지금까지의 partial 결과로 종료합니다.`);
        state.lastScrollEndReason = "modal_closed";
        break;
    }
    console.log(`🧭 ${baseLog} 스크롤 박스가 교체되어 새 박스로 계속 수집합니다.`);
    scrollBox = replacement;
}
```

같은 패턴을 `followVisibleButtons`의 while 루프 선두(저장해 둔 `state.followersScrollBox` 사용처)와 `reverifyCurrentListCollection`의 checkpoint 내부 루프(checkpoint마다 `scrollBox.isConnected` 확인, 분리 시 해당 pass 중단)에도 적용.

**수용 기준:** 수집 중 모달을 수동으로 닫으면 수 초 내에 `modal_closed` 사유의 한국어 로그와 함께 partial 종료. 16틱 대기가 사라짐. `state.lastScrollEndReason === "modal_closed"`가 디버그 리포트에 반영.

### S4. followers 목표 폴백 288 제거 (`|| TARGET_COUNT` → `|| 0`)

**문제:** line 3315 `const followersTarget = state.expectedCounts.followers || TARGET_COUNT;` — 라벨 파싱 실패 시 288로 고정되어, 팔로워가 288명 초과인 계정에서 288명에서 "목표 달성"으로 조기 종료한다. following은 `|| 0`(line 3399)이라 비대칭.

**구현 (`main.js`):**
1. line 3315를 `const followersTarget = state.expectedCounts.followers || 0;`로 변경.
2. line 3316의 로그를 target 0일 때 자연스럽게: `실제 목표 ${followersTarget > 0 ? `${followersTarget}명` : "전체(정체 시 종료)"}`.
3. `TARGET_COUNT` 상수(line 12)를 삭제하고, `scrollUntilEnd`(line 2496)와 `followVisibleButtons`(line 3140)의 기본 파라미터 `targetCount = TARGET_COUNT`를 `targetCount = 0`으로 변경.
4. 알려진 트레이드오프(변경하지 말 것): target이 0이면 `shouldAttemptScrollRecovery`는 동작하지 않고(기존 following과 동일), 정체(stall) 기반으로만 종료한다. 이는 의도된 동작.

**수용 기준:** `node --check` 통과 + `TARGET_COUNT` 참조가 0건. 라벨 파싱 성공 시 동작 변화 없음.

---

## 3. Phase 2 — 신뢰성 정리

### S5. DevTools 연결 신선도(content 측 TTL) + 끊김 알림 relay

**문제:** background는 15초 TTL(`DEVTOOLS_STATE_TTL_MS`, background.js:142)과 포트 끊김 처리(background.js:362~371)가 있지만, content 쪽 `state.devtoolsBridge.ready`(main.js:1084~)는 한 번 true면 영원히 유지된다. 실행 중 DevTools를 닫아도 정확도 모드가 "DevTools 연결됨" 기준으로 잘못 판정될 수 있다.

**구현:**

`background.js` — `chrome.runtime.onConnect`의 `port.onDisconnect`(line 362) 안, `setDevtoolsTabState(...)` 호출 뒤에 추가:
```js
if (connectedTabId !== null) {
    chrome.tabs.sendMessage(connectedTabId, {
        type: "IG_DEVTOOLS_DISCONNECTED",
        source: "devtools-network",
        schemaVersion: 1,
        reason: "devtools-port-disconnected",
        capturedAt: new Date().toISOString()
    }, () => {
        // 콘텐츠 스크립트가 없을 수 있으므로 lastError는 소비만 한다.
        void chrome.runtime.lastError;
    });
}
```

`main.js`:
1. 상수 추가: `const DEVTOOLS_READY_STALE_MS = 12000;` (하트비트 2초 주기 기준 6회 누락 = 끊김으로 간주).
2. 헬퍼 추가:
   ```js
   function isDevtoolsBridgeFresh() {
       if (!state.devtoolsBridge.ready) return false;
       const latest = [
           state.devtoolsBridge.lastReadyAt,
           state.devtoolsBridge.lastStatusAt,
           state.devtoolsBridge.lastPayloadAt
       ].map((value) => Date.parse(value || "")).filter(Number.isFinite);
       if (latest.length === 0) return false;
       return Date.now() - Math.max(...latest) <= DEVTOOLS_READY_STALE_MS;
   }
   ```
3. `installExtensionMessageBridge`의 handler에 분기 추가 (`IG_DEVTOOLS_READY` 분기 앞):
   ```js
   if (message.type === "IG_DEVTOOLS_DISCONNECTED") {
       state.devtoolsBridge.ready = false;
       state.devtoolsBridge.lastError = "devtools-port-disconnected";
       console.log("🔌 DevTools 브리지 연결이 해제되었습니다. 이후 결과는 DevTools 보조 없이 판정됩니다.");
       sendResponse?.({ ok: true });
       return false;
   }
   ```
4. **ready 소비처를 신선도 기준으로 교체** (raw `ready`는 진단용으로 유지):
   - `getAccuracyMode`: `else if (bridge.ready)` 분기(`DEVTOOLS_CONNECTED_NO_PAYLOAD`) → `else if (isDevtoolsBridgeFresh())`. 반환 객체의 `devtoolsConnected: Boolean(bridge.ready)` → `isDevtoolsBridgeFresh()`.
   - `getDevtoolsListStatus`: `else if (bridge.ready)` 분기 → `isDevtoolsBridgeFresh()`.
   - `runAccuracyPreflight`: `devtoolsReady: Boolean(state.devtoolsBridge.ready)` 및 auto-assist 판단의 `!state.devtoolsBridge.ready` → 신선도 헬퍼 사용.
   - `getDevtoolsBridgeSnapshot` 반환 객체에 `fresh: isDevtoolsBridgeFresh()` 필드 추가 (스냅샷/디버그 리포트에서 구분 가능하게).

**수용 기준:** 수집 실행 중 DevTools 창을 닫으면 (a) 즉시 끊김 한국어 로그, (b) 12초 이후의 정확도 판정(`getAccuracyMode`)이 DevTools 연결 분기를 타지 않음. DevTools를 다시 열면 하트비트로 자동 복귀.

### S6. `hookNetwork` 정비 — paste 모드 전용화 + 추출 정책 정렬

**배경(중요):** main.js의 XHR/fetch 래핑(line 983~1032)은 확장으로 주입되면 **isolated world에서 실행되므로 페이지의 네트워크 요청을 볼 수 없다** (그래서 MAIN world용 `page-network-bridge.js`가 별도로 존재). 그러나 AGENTS.md 규칙상 main.js는 콘솔에 직접 붙여넣는 paste 모드도 지원해야 하고, paste 모드에서는 이 후크가 MAIN world에서 실제로 동작한다. 따라서 **삭제하지 말고** 다음 3가지를 고친다.

**문제 3가지:**
1. `window.__igFollowerHooksInstalled` 가드 때문에 재실행 시 후크 클로저가 **첫 실행의 죽은 `state`를 영원히 참조**한다 (stale closure).
2. `collectFromPayload`(line 897~946)는 임의 깊이의 `username` 필드를 confirmed로 수집한다. 이는 AGENTS.md 2026-06-07 가드레일("Do not recursively trust every `username` in a JSON payload") **위반**이며, devtools.js(line 97~127)·page-network-bridge.js(line 87~113)의 `insideListContainer` 게이팅과 불일치.
3. 프리필터가 없어 paste 모드에서 모든 graphql 응답을 무조건 `JSON.parse`한다 (page bridge에는 있는 `IGNORED_URL_RE`, body 크기 캡, 빠른 substring 검사가 없음).

**구현 (`main.js`):**

1. **stale closure 해소 (스왑 패턴):** 후크 내부에서 `ingestApiResponse(...)`를 직접 호출하는 대신 `window.__igFollowerIngestApiResponse?.(...)`를 호출하도록 바꾸고, 실행부(`hookNetwork()` 호출 지점)에서 매 실행마다 `window.__igFollowerIngestApiResponse = ingestApiResponse;`로 갱신한다. 다른 리스너들(`installPageNetworkBridgeListener` 등)이 이미 쓰는 패턴과 동일.
2. **확장 주입 모드에서는 설치 생략:** `main()` 내 `hookNetwork();` 호출(line 3290)을 다음으로 교체:
   ```js
   const isExtensionContentScript = typeof chrome !== "undefined" && Boolean(chrome.runtime?.onMessage);
   window.__igFollowerIngestApiResponse = ingestApiResponse;
   if (!isExtensionContentScript) {
       hookNetwork(); // 콘솔 paste 모드 전용: isolated world에서는 페이지 트래픽이 보이지 않아 무의미
   } else {
       console.log("ℹ️ 확장 주입 모드: in-page XHR/fetch 후크는 건너뜁니다. (page-network-bridge가 해당 역할 수행)");
   }
   ```
3. **프리필터:** `page-network-bridge.js:4`의 `IGNORED_URL_RE`와 `devtools.js:81~86`의 `looksLikeJsonUserPayload`, `MAX_BODY_CHARS = 512_000`을 main.js에도 추가하고, XHR `load` 핸들러와 fetch 핸들러에서 `JSON.parse` 전에 적용: URL이 `IGNORED_URL_RE`에 걸리면 skip, body가 `MAX_BODY_CHARS` 초과면 skip, `looksLikeJsonUserPayload(text)` 불통과면 skip.
4. **컨테이너 게이팅:** `collectFromPayload`에 `insideListContainer = false` 파라미터를 추가하고 page-network-bridge.js의 walker와 **동일한 의미론**으로 수정:
   - `username` 필드는 `insideListContainer === true`일 때만 add.
   - `edges` 배열의 `edge.node`로 내려갈 때 container 열림(true).
   - `users`/`items`/`nodes` 필드로 내려갈 때 container 열림, 단 `data` 필드는 container를 열지 않음 (`insideListContainer || field !== "data"`).
   - 배열 원소로 내려갈 때는 현재 플래그 유지.
   - candidate/confirmed `confidence` 파라미터 처리는 기존 유지.

**수용 기준:**
- 확장 주입 모드: 콘솔에 "후크 건너뜀" 안내, `sourceCounts`에 bare `XHR`/`fetch`가 새로 등장하지 않음, 기존 플로우 동작 동일.
- paste 모드(콘솔에 main.js 전체 붙여넣기): followers 모달 스크롤 시 `📡 [XHR] Followers +N` 로그가 여전히 동작. root-level `{"username": "x"}` 형태(컨테이너 밖)는 confirmed로 추가되지 않음.
- 두 번 연속 paste 실행 시 두 번째 실행의 카운트에 네트워크 수집이 반영됨 (stale closure 해소 확인).

### S7. 수집 루프 절대 시간 상한

**문제:** `scrollUntilEnd`는 stableTicks로만 종료된다. 스토리 아바타 재렌더 등으로 anchor가 계속 미세 변동하면 stableTicks가 리셋되어 이론상 무한 루프.

**구현 (`main.js`):**
1. 상수 추가: `const MAX_COLLECTION_MS = 10 * 60 * 1000;` (모드당 10분).
2. `scrollUntilEnd` 진입 시 `const startedAtMs = Date.now();` 기록, while 루프 선두에서:
   ```js
   if (Date.now() - startedAtMs > MAX_COLLECTION_MS) {
       console.log(`⏰ ${baseLog} 수집이 ${Math.round(MAX_COLLECTION_MS / 60000)}분 시간 상한에 도달해 partial 종료합니다. (${targetSet.size}명 수집)`);
       state.lastScrollEndReason = "time_budget_exceeded";
       recordRunEvent("scroll_time_budget_exceeded", { mode: modeLabel, collected: targetSet.size });
       break;
   }
   ```
3. `reverifyCurrentListCollection`과 `followVisibleButtons`에도 함수 진입 시각 기준 동일 패턴 적용 (사유 문자열: `"time_budget_exceeded"`).

**수용 기준:** 정상 실행 시간(수 분)에는 발동하지 않음. `lastScrollEndReason` 신규 값이 디버그 리포트에 그대로 노출됨.

### S8. background.js 데드 코드 제거

**문제:** `sendToInstagramTab`(background.js:1~13)은 어디서도 호출되지 않는다.

**구현:** 함수 삭제. 삭제 전 `grep -n "sendToInstagramTab" background.js`로 참조 0건 확인.

**수용 기준:** `node --check background.js` 통과, 참조 0건.

---

## 4. Phase 3 — 성능

### P1. `findFollowerListBox` 2-pass 스코어링 + scrollBox 캐시 (최대 CPU 절감)

**문제:** `findFollowerListBox`(main.js:1338~1366)는 다이얼로그 안 **모든 div**에 `scoreScrollBoxCandidate`(line 1299~1336)를 실행한다. div 하나당 `getComputedStyle` + `getBoundingClientRect` + 서브트리 `querySelectorAll` 2회(중첩 div라 사실상 O(n²)) + `probeScrollMovement`(line 1279~1297)의 scrollTop 쓰기→읽기→복원(**강제 동기 레이아웃**)이 발생한다. 이 함수는 `waitForDialogReady`에서 150ms마다, `waitForListSettled`(line 1575)에서 매 tick, 복구·재검증·진단마다 호출된다.

**구현 (`main.js`):**

1. **캐시:** `state.cachedScrollBox = null;` 필드 추가. `findFollowerListBox(options = {})` 시그니처로 변경하고 함수 선두에:
   ```js
   if (!options.forceRescan && state.cachedScrollBox?.isConnected &&
       isElementVisible(state.cachedScrollBox) &&
       state.cachedScrollBox.scrollHeight > state.cachedScrollBox.clientHeight) {
       return state.cachedScrollBox;
   }
   ```
   전체 스캔으로 박스를 선택하면 `state.cachedScrollBox = selected;` 저장.
2. **캐시 무효화:** `openPopupByType`에서 후보 클릭 직전 `state.cachedScrollBox = null;` / `closeActiveDialog`가 닫기에 성공한 모든 return 경로에서 `state.cachedScrollBox = null;` / `attemptScrollRecovery`의 재탐색 호출은 `findFollowerListBox({ forceRescan: true })`로 변경.
3. **2-pass 스코어링** (전체 스캔 경로):
   - Pass 1 (저비용): 다이얼로그 내 div들에 대해 `getComputedStyle` overflow 검사 + `scrollHeight > clientHeight + 24` + `isElementVisible`만 평가. 통과 후보를 `(scrollHeight - clientHeight)` 내림차순 정렬 후 **상위 12개**만 남김.
   - Pass 2 (고비용): 남은 후보에만 `getProfileLinksIn`/`getFollowButtonsIn` 카운트와 rect 기반 점수 계산. `probeScrollMovement`는 **중간 점수 상위 3개에만** 실행.
   - 점수 가중치(40/80/70/8/12 등 기존 수치)는 그대로 유지해 선택 결과가 바뀌지 않게 한다.
4. `state.lastScrollBoxCandidates`에 상위 5개 진단을 저장하는 기존 동작(필드 구조 포함)을 유지한다 — 디버그 리포트 호환성.
5. fallback selector 경로(line 1356~1365)는 변경하지 않는다.

**수용 기준:** 표준 followers 모달에서 선택되는 scrollBox가 변경 전과 동일(수동 검증). `waitForListSettled` tick마다 전체 스캔이 발생하지 않음(캐시 hit). `probeScrollMovement` 실행 횟수가 스캔당 최대 3회.

### P2. 소스 카운터 증분 유지 — `getSourceCounts` O(1)화

**문제:** `getSourceCounts`(main.js:269~277)는 호출마다 provenance Map 전체를 순회한다. `hasConfirmedNetworkEvidence`(line 279~288)가 매 스크롤 tick의 `collectFromDOM`(line 1611)에서 이를 호출하고, `getAccuracyMode`도 출력 경로 곳곳에서 양쪽 모드를 반복 순회한다.

**구현 (`main.js`):**
1. `state.sourceCountsCache = { followers: Object.create(null), following: Object.create(null) };` 추가.
2. `recordUsernameProvenance`에서 `isNewSource || isNewUsername`로 새 소스 라벨이 그 username에 처음 붙는 시점에 `state.sourceCountsCache[mode][label] = (state.sourceCountsCache[mode][label] || 0) + 1;` 증분. (소스는 Set이라 사용자별로 한 번만 추가되므로 기존 `getSourceCounts` 의미와 동일. 소스는 제거되는 일이 없으므로 — `demoteDomOnlyConfirmedUsers`도 소스를 추가만 함 — 감소 처리 불필요.)
3. `getSourceCounts(mode)`는 `{ ...state.sourceCountsCache[mode] }` 반환으로 교체.
4. `main()`의 state 리셋 블록에서 두 모드 캐시를 빈 객체로 리셋.
5. 검증용 임시 코드로 기존 순회 방식과 캐시 방식을 1회 비교 출력해 일치 확인 후 제거해도 됨.

**수용 기준:** 수집 완료 후 `getSourceCounts("followers")` 결과가 변경 전 구현과 동일(소스 라벨별 카운트 일치). 디버그 리포트의 `sourceCounts` 구조 불변.

### P3. page-network-bridge 본문 파싱 프리필터

**문제:** `postResponse`(page-network-bridge.js:115~131)는 매칭 URL 본문을 무조건 `JSON.parse`한다. graphql은 상시 다발 트래픽이라 MAIN world 메인 스레드 잭을 만든다.

**구현 (`page-network-bridge.js`):** devtools.js:81~86과 동일한 검사 추가:
```js
function looksLikeJsonUserPayload(text) {
    if (!text || typeof text !== "string") return false;
    const trimmed = text.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return false;
    return /"username"|"users"|"items"|"edges"|"nodes"|"data"/.test(trimmed);
}
```
`postResponse`에서 크기 캡 검사 다음, `JSON.parse` 전에 `if (!looksLikeJsonUserPayload(bodyText)) return;` 추가.

**수용 기준:** DevTools-closed + 수동 enable 플로우에서 followers/following 수집이 기존과 동일하게 동작. username이 없는 graphql 응답은 parse 없이 skip.

### P4. devtools.js 하트비트 백오프

**문제:** `setInterval` 2초/5초(devtools.js:297~298)가 영구 고정이다. 포트가 끊겨도 2초마다 재연결을 시도하고(확장 reload 후엔 실패 로그 무한 누적), 연결 중에는 포트 왕복으로 서비스 워커를 계속 깨워 둔다.

**구현 (`devtools.js`):**
1. `stats`에 `consecutiveFailures: 0` 필드 추가.
2. `connectPort`의 catch와 `port.onDisconnect`에서 `stats.consecutiveFailures++`. 연결 성공(connect 직후)과 ACK 수신 시 `stats.consecutiveFailures = 0`.
3. 두 `setInterval`을 자기 재예약 `setTimeout` 루프로 교체:
   ```js
   const MAX_HEARTBEAT_BACKOFF_MS = 30000;
   function heartbeatDelay(baseMs) {
       if (stats.consecutiveFailures === 0) return baseMs;
       return Math.min(baseMs * 2 ** stats.consecutiveFailures, MAX_HEARTBEAT_BACKOFF_MS);
   }
   function scheduleReadyHeartbeat() {
       setTimeout(() => { sendReady("heartbeat"); scheduleReadyHeartbeat(); }, heartbeatDelay(READY_RETRY_MS));
   }
   function scheduleStatusHeartbeat() {
       setTimeout(() => { sendStatus("heartbeat"); scheduleStatusHeartbeat(); }, heartbeatDelay(STATUS_RETRY_MS));
   }
   scheduleReadyHeartbeat();
   scheduleStatusHeartbeat();
   ```
4. 주의: S5의 content 측 stale TTL(12초)은 정상 하트비트 2초 기준이다. 백오프는 **실패 시에만** 발동하므로 충돌 없음 — 정상 연결 상태의 주기는 2초/5초 그대로 유지할 것.

**수용 기준:** 확장을 reload해 DevTools 포트가 무효화된 뒤, DevTools 콘솔의 실패 로그 간격이 2s→4s→8s→…→30s로 벌어짐. Instagram 탭에서 재연결되면 2초 주기로 복귀하고 content 콘솔에 브리지 연결 로그가 다시 찍힘.

### P5. 세션 스냅샷 전송 전 압축

**문제:** `persistFollowers`(main.js:3051~3119)는 사용자당 `recentEvidence`(각 8건 × 10필드)가 포함된 full provenance를 `chrome.runtime.sendMessage`로 보낸다. 압축은 background에서야 일어나므로(background.js:51~64) 대형 계정에서 메시지 직렬화가 메인 스레드를 막는다. (백로그 2026-06-07 open 항목 "persist compact lastEvidence / compact every large stored snapshot section"과 같은 방향.)

**구현 (`main.js`):**
1. 헬퍼 추가 — background의 캡 수치와 동일하게 맞출 것 (5000/1000/2000은 background.js의 `compactProvenance`/`compactSnapshot` 기준):
   ```js
   function buildSessionMessagePayload(payload) {
       const compactProvenanceEntries = (bucket) => Object.fromEntries(
           Object.entries(bucket || {}).slice(0, 5000).map(([username, info]) => [username, {
               sources: info.sources,
               confidence: info.confidence,
               confidences: info.confidences,
               reasons: info.reasons,
               seenCount: info.seenCount,
               firstSeenAt: info.firstSeenAt,
               lastSeenAt: info.lastSeenAt
               // recentEvidence, sourceSeenCounts 제외: 세션 저장에 불필요한 최대 용량 필드
           }])
       );
       return {
           ...payload,
           provenance: {
               followers: compactProvenanceEntries(payload.provenance?.followers),
               following: compactProvenanceEntries(payload.provenance?.following)
           }
       };
   }
   ```
2. `persistRunSnapshotToExtensionSession(payload)` 호출(line 3119)을 `persistRunSnapshotToExtensionSession(buildSessionMessagePayload(payload))`로 변경.
3. `window.__igFollowerResult` / `window.__igFollowerMemory`에는 **기존대로 full payload**를 유지한다 (페이지 내 진단용 — `__igFollowerExplainUser`의 recentEvidence 출력이 여기서 나옴).

**수용 기준:** 실행 후 `chrome.storage.session` 스냅샷(background 경유)이 정상 저장되고, `window.__igFollowerExplainUser("...")`의 `recentEvidence` 출력은 계속 동작. 저장 스냅샷의 provenance 항목에 recentEvidence가 없음.

### P6. `getClickableTabCandidates` 필터 순서 변경

**문제:** main.js:1455~1485가 문서 전체 `a,button,[role],span,div` 수천 노드에 대해 **비싼 `isCandidateVisible`(getComputedStyle + rect)을 먼저** 수행하고 그다음에 텍스트 점수를 계산한다.

**구현 (`main.js`):** 루프 내부 순서를 재배열: disabled 체크 → `clickable` resolve → `seen` 체크 → href/label 추출 + `scorePopupCandidate` 계산 → **`score > 0`인 노드에만** `isCandidateVisible(clickable)` 실행 → 통과 시 push. (`getDirectFollowersButtons`는 anchor만 다루므로 변경하지 않는다.)

**수용 기준:** 본인 프로필 페이지에서 followers/following 버튼 선택 결과가 변경 전과 동일. `logPopupDiagnostics` 출력 형식 불변.

### P7 (권장 옵션). walker drift 테스트 + 로컬 fixture

**배경:** username walker가 3곳에 중복 구현되어 있고(main.js `collectFromPayload`, devtools.js·page-network-bridge.js `collectUsernamesFromPayload`) 이미 한 차례 정책 드리프트가 발생했다(S6에서 해소). 백로그 2026-06-07 open 항목 "add local regression fixtures..."의 일부를 충족한다.

**구현:**
1. devtools.js와 page-network-bridge.js의 walker 함수를 sentinel 주석으로 감싼다:
   ```js
   // [ig-walker:start] 이 블록은 devtools.js / page-network-bridge.js 간 byte-identical 해야 함 (tools/walker-fixtures.mjs가 검증)
   function collectUsernamesFromPayload(...) { ... }
   // [ig-walker:end]
   ```
2. `tools/walker-fixtures.mjs` (node 내장만 사용, 의존성 금지) 작성:
   - 두 파일에서 sentinel 사이 텍스트를 추출해 공백 정규화 후 **동일성 assert**.
   - 추출한 walker 소스를 `new Function`으로 평가(스텁 `addUsername`은 Set add)해 fixture 검증:
     - exact list payload `{"users":[{"username":"a"},{"username":"b"}]}` → 2명.
     - graphql edges `{"data":{"user":{"edge_followed_by":{"edges":[{"node":{"username":"c"}}]}}}}` → ⚠️ 주의: walker는 `users|items|edges|nodes|data` 필드만 내려가므로 `user`/`edge_followed_by` 같은 임의 키는 통과하지 못함. fixture는 실제 통과 가능한 형태(`{"data":{"edges":[{"node":{"username":"c"}}]}}` → 1명)로 작성.
     - root-level `{"username":"x"}` (컨테이너 밖) → 0명.
     - `data`는 컨테이너를 열지 않음: `{"data":{"username":"y"}}` → 0명.
     - depth 13 초과 중첩 → 0명.
     - 빈/비JSON 입력 → 0명, throw 없음.
   - main.js의 `collectFromPayload`는 sentinel로 감싸되 동일성 비교 대상에서 제외하고, 스텁(`addUsername`/`addCandidateUsername`/`getCollectionModeForSet`/`state`) 주입 평가로 **동일 fixture의 행동 검증만** 수행.
   - 실패 시 비-0 exit code.
3. 검증 명령을 문서에 추가: `CLAUDE.md`의 Validation 섹션과 `AGENTS.md`의 Manual Validation 섹션에 `node tools/walker-fixtures.mjs` 한 줄 추가.
4. fixture에 실제 계정 데이터·원본 payload를 넣지 않는다 (a/b/c 같은 합성 데이터만 — SECURITY.md).

**수용 기준:** `node tools/walker-fixtures.mjs` 통과. 한쪽 walker만 수정하면 테스트가 실패함을 일부러 한 글자 바꿔 확인 후 원복.

---

## 5. 구현 순서

1. **Phase 1** (S1 → S2 → S3 → S4): 상호 독립이지만 S1의 `isRunSuperseded`를 S2가 사용하므로 이 순서 권장. 완료 후 회귀 체크리스트 1~3번 수행.
2. **Phase 2** (S5 → S6 → S7 → S8): 완료 후 회귀 체크리스트 전체 수행.
3. **Phase 3** (P2 → P3 → P6 → P5 → P4 → P1 → P7): 위험도 낮은 것부터. **P1은 가장 마지막에** (행동 변화 위험이 가장 큼 — 선택 박스 동일성 수동 확인 필수).

## 6. 회귀 체크리스트 (수동 Chrome 검증)

전제: `chrome://extensions`에서 확장 reload → Instagram 프로필 탭 reload → DevTools를 먼저 열기 → 액션 클릭. (AGENTS.md Manual Validation 절차)

1. **표준 pass shape:** DevTools open 상태에서 실행 → DevTools payload 수집, final diff 산출, status `completed`, 신뢰도 요약 한국어 출력. (기존 기준 계정에서 287/287, diff 0/0 형태 — `docs/HANDOFF.md` 2026-06-06 참고.)
2. **더블 클릭:** 액션을 2초 간격 두 번 클릭 → "이전 실행을 중단" 로그, 최종 결과 runId 1개.
3. **실행 중 모달 닫기:** 수집 도중 모달 X 클릭 → 수 초 내 `modal_closed` partial 종료 + 한국어 경고.
4. **실행 중 DevTools 닫기:** 끊김 로그 + 12초 후 정확도 판정에서 DevTools 연결 분기 제외.
5. **DevTools 없이 실행:** `DOM_PREVIEW` 라벨과 경고 출력 (기존 동일).
6. **에러 패널:** 위 시나리오 후 `chrome://extensions` 에러 패널에 신규 warn/error 누적 없음.
7. **paste 모드(개발용):** main.js 전문을 페이지 콘솔에 붙여넣고 실행 → XHR/fetch 소스 수집 동작 + root-level username 미확정(S6).

## 7. 문서 갱신 의무 (구현 완료 시)

- `docs/BACKLOG.md`: "2026-06-10 Stability/Performance Plan" 섹션을 추가하고 S1~S8, P1~P7 각 항목의 done/open 상태 기록. 기존 2026-06-07 open 항목 중 "persist compact lastEvidence..."(P5 관련), "compact every large stored snapshot section"(P5), "add local regression fixtures..."(P7 부분 충족)에 진행 상태 주석.
- `docs/HANDOFF.md`: 세션 메타·현재 상태·다음 액션 갱신. 수동 검증을 못 돌렸다면 그 사유 기록 (CLAUDE.md 규칙).
- P7 수행 시: `CLAUDE.md` Validation 섹션과 `AGENTS.md` Manual Validation에 fixture 명령 추가.

## 8. 명시적 비범위 (이번 작업에서 하지 말 것)

- 팔로우 액션 재활성화, diff 정책 변경, 새 권한, 원본 payload 저장.
- `getOvercountLowConfidenceExclusions`/`promoteDomCandidatesToConfirmed`의 알파벳순 선택을 evidence 강도 랭킹으로 바꾸는 작업 (백로그 별도 open 항목 — 정확도 정책 변경이라 이번 범위가 아님).
- MAIN world postMessage 토큰 검증 하드닝 (docs/SECURITY.md 채택 기록이 선행되어야 함 — 별도 결정 필요).
- 스크롤 대기 시간(650~1400ms)·인간형 클릭 지연 단축 (rate-limit/탐지 안전 마진이므로 유지).
- 대규모 리팩터링, 파일 분할, 번들러 도입.
