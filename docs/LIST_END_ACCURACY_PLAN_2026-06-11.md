# 목록 끝 확정 정확도 수정 계획서 (2026-06-11)

구현 담당 에이전트(Codex)용. 2026-06-11 실제 실행 로그(profile seunghun0312, 표시 287/287)에서 발견된 허위 diff 문제의 수정 계획.

## 0. 문제 분석 (이 계획의 근거 — 구현 전 반드시 읽을 것)

실측 로그 요약:

- followers: DevTools payload가 12명 단위로 연속 수신되어 **정확히 285명에서 소진**. DOM도 고유 285명에서 정체. 센티널 종료 사유 `stalled_at_list_end`(목록 끝 도달 확인). 재검증 5지점 전부 추가 0.
- following: **동일하게 285명에서 소진**, `stalled_at_list_end`, 재검증 추가 0.
- 그런데 화면 표시 수(헤더)는 양쪽 모두 287. → **양쪽에서 똑같이 2명 차이 = 헤더 카운터에 비활성화/탈퇴 계정이 포함된 것으로 추정** (Instagram의 알려진 동작: 카운터는 비활성 계정을 포함할 수 있고 목록 API에는 나오지 않음).
- followers 흐름은 `promoteDomCandidatesToConfirmed(..., "followers-reverify-shortfall")`로 **DOM 후보 2명(provenance `dom-candidate+dom-fallback`, 네트워크 증거 전무)을 승격**해 287을 채웠다. following은 승격할 DOM 후보가 없어 285 유지.
- 결과: 비대칭 승격으로 final diff에 "나를 팔로우하지만 내가 팔로우하지 않는 계정 2명"이 출력 — **이 2명은 docs/HANDOFF.md 2026-06-06 회귀 교훈에 기록된 바로 그 DOM 과수집 계정**이며, 진짜 결과는 285/285, diff 0/0이다.

핵심 결론: **세 증거(네트워크 페이지 소진, DOM 정체, 끝 센티널)가 모두 "목록은 여기서 끝"이라고 말할 때, 헤더 표시 수와의 작은 차이는 '수집 부족'이 아니라 '표시 수에 비활성 계정 포함'으로 해석해야 하며, 이때 DOM 후보 승격은 허위 diff를 만든다.**

부수 문제 3건:

- 목록 끝이 확정된 뒤에도 재검증(체크포인트 5×스크롤, 목록당 ~30초)과 정체 16틱(~25초)이 그대로 수행되어 실행이 ~4.5분 소요. 재검증 스크롤은 Instagram API 요청을 다시 유발하므로 계정 안전 관점에서도 낭비.
- 세션 저장 로그가 "약 0KB"로 출력 (`approxBytes`가 응답에 누락되었거나 반올림 문제).
- "🔌 background에 기존 DevTools 연결 상태가 있어 브리지 동기화를 요청했습니다." 로그가 2회 출력 — `installExtensionMessageBridge` 말미와 `runAccuracyPreflight`가 각각 `notifyContentBridgeReady()`를 호출하는 중복.

## 1. 불변 조건 (위반 시 롤백)

- **username 하드코딩 절대 금지.** haeunieii/won_donghwi는 분석 근거일 뿐, 코드에 어떤 형태로도 등장하면 안 된다 (AGENTS.md 2026-06-06 가드레일). 수정은 전부 일반 규칙으로.
- **bounded DOM fallback 자체를 제거하지 말 것.** 종료 사유가 불완전 신호(`stalled`, `scroll_box_detached`, `time_cap_reached`, `rate_limited`, `run_superseded` 등)일 때의 기존 승격 동작은 유지한다. 이번 수정은 "목록 끝 확정" 케이스에 대한 **게이트 추가**다.
- 한국어 콘솔 출력, 예상 가능한 degraded 상태에 `console.warn` 금지, partial 결과 항상 출력+저장, `FINAL_DIFF_POLICY`/`FOLLOW_ACTION_ENABLED` 등 안전 상수 불변.
- 라인 번호는 빠르게 변하므로 **함수명으로 위치를 찾을 것** (이 문서는 함수명 기준으로 기술).
- 각 항목 완료 시마다: `node --check main.js && node --check background.js && node --check devtools.js && node tools/walker-fixtures.mjs && node tools/compare-fixtures.mjs`
- 커밋은 항목 ID당 1개 (예: `A1: assess list completion at list end`).

---

## A1. 목록 완결성 판정 헬퍼 (순수 함수)

**구현 (`main.js`):**

1. 상수 추가:
   ```js
   const DISPLAYED_COUNT_GAP_TOLERANCE = 5; // 표시 수와 목록 끝 확정 수집 수의 허용 격차(비활성 계정 추정 범위)
   ```
2. **순수 판정 함수** 추가 — fixture 추출이 가능하도록 state를 읽지 않고 인자만 사용:
   ```js
   // [ig-compare:assess] tools/compare-fixtures.mjs가 이 함수를 추출해 검증한다. state 접근 금지(순수 함수 유지).
   function assessListCompletion({ expectedCount, verifiedCount, endReason, hasNetworkEvidence, nonDomCandidateCount }) {
       const gap = expectedCount > 0 ? expectedCount - verifiedCount : 0;
       const listEndConfirmed = endReason === "stalled_at_list_end" || endReason === "target_reached";
       const completeAtListEnd = Boolean(
           expectedCount > 0 &&
           gap > 0 &&
           gap <= DISPLAYED_COUNT_GAP_TOLERANCE &&
           listEndConfirmed &&
           hasNetworkEvidence &&
           nonDomCandidateCount === 0
       );
       return { gap, listEndConfirmed, completeAtListEnd };
   }
   ```
   조건의 의미: 목록 끝 도달이 센티널로 확인됐고, 확정 네트워크 증거가 그 지점까지 도달했으며, 네트워크 계열 미해결 후보(진짜 미수집 신호)가 없고, 격차가 허용 범위 이내일 때만 "표시 수에 비활성 계정 포함"으로 판정.
3. state 기반 래퍼 추가:
   ```js
   function getListCompletionAssessment(mode, expectedCount) {
       const verifiedCount = mode === "following" ? state.followingUsers.size : state.collectedUsers.size;
       const endReason = mode === "following" ? state.lastFollowingScrollEndReason : state.lastFollowersScrollEndReason;
       const domTierCandidateFilter = (username) => {
           const sources = Array.from(state.userProvenance[mode]?.get(username)?.sources || []);
           return sources.length > 0 && sources.every((source) => DOM_TIER_SOURCES.has(source) || DOM_CANDIDATE_SOURCES.has(source));
       };
       const candidates = getUnconfirmedCandidates(mode);
       const nonDomCandidateCount = candidates.filter((username) => !domTierCandidateFilter(username)).length;
       return assessListCompletion({
           expectedCount: expectedCount || 0,
           verifiedCount,
           endReason,
           hasNetworkEvidence: hasConfirmedNetworkEvidence(mode),
           nonDomCandidateCount
       });
   }
   ```
   (`DOM_TIER_SOURCES`/`DOM_CANDIDATE_SOURCES`는 R3에서 도입된 기존 상수를 사용. 없으면 해당 정의를 먼저 확인할 것.)

**수용 기준:** 순수 함수가 다음을 만족 — `{expected:287, verified:285, endReason:"stalled_at_list_end", hasNetworkEvidence:true, nonDomCandidateCount:0}` → `completeAtListEnd: true` / endReason "stalled" → false / gap 6 → false / hasNetworkEvidence false → false / nonDomCandidateCount 1 → false.

## A2. 재검증·승격 게이트 + main() 흐름 수정 (핵심)

**문제:** `main()`의 followers/following 두 블록이 "수집 수 < 표시 수"만 보고 (a) 재검증을 돌리고 (b) DOM 후보를 승격하며 (c) followers는 `collection_incomplete`로 조기 중단, following은 `completed_with_count_mismatch` partial 경로를 탄다.

**구현 (`main.js`의 `main()` — followers 블록과 following 블록 각각):**

1. followers 블록 (현재 형태: `if (followersTarget > 0 && followers.length < followersTarget) { reverify → promote → followers = ... }`):
   ```js
   let followersCompletion = null;
   if (followersTarget > 0 && followers.length < followersTarget) {
       followersCompletion = getListCompletionAssessment("followers", followersTarget);
       if (followersCompletion.completeAtListEnd) {
           summary.followersCompletion = followersCompletion;
           summary.followersCollectionStatus = "complete_at_list_end";
           recordRunEvent("list_end_confirmed_below_displayed", { mode: "followers", ...followersCompletion });
           console.log(`📋 팔로워 목록 끝 도달 확인: 화면 표시 ${followersTarget}명 중 ${followers.length}명 수집. 차이 ${followersCompletion.gap}명은 표시 수에 비활성화/탈퇴 계정이 포함된 경우일 가능성이 높습니다.`);
           console.log("ℹ️ 목록 끝이 확인되어 재검증과 DOM 후보 승격을 생략합니다. (허위 diff 방지)");
       } else {
           summary.followersReverify = await reverifyCurrentListCollection(followersTarget, state.collectedUsers, "followers");
           promoteDomCandidatesToConfirmed("followers", state.collectedUsers, followersTarget, "followers-reverify-shortfall");
           followers = Array.from(state.collectedUsers);
       }
   }
   ```
2. followers **조기 중단 분기** 조건 수정: `if (followersTarget > 0 && followers.length < followersTarget)` → `&& !followersCompletion?.completeAtListEnd` 추가. complete_at_list_end면 `collection_incomplete`로 멈추지 않고 following 수집으로 진행한다.
3. following 블록도 동일 게이트 적용 (재검증·승격 생략 + 동일 한국어 안내, `summary.followingCompletion` 기록).
4. following의 `count_mismatch` partial 분기 조건 수정: `if (followingTarget > 0 && following.length < followingTarget)` → `&& !followingCompletion?.completeAtListEnd`. complete_at_list_end면 partial 경로 대신 정상 경로로 진행하되:
   - `summary.followingCollectionStatus = "complete_at_list_end"`
   - 최종 status 결정부에서: followers/following 중 하나라도 complete_at_list_end였고 나머지 조건이 정상이면 `summary.status = "completed_at_list_end"` (기존 `completed` 계열과 동일하게 취급되는 신규 값).
   - diffs에는 partial 오탐 경고 대신 정보성 경고 추가:
     ```js
     { code: "displayed_count_includes_inactive", severity: "info", message: "화면 표시 수가 목록 끝 확정 수집 수보다 N명 많습니다. 비활성화/탈퇴 계정이 카운터에 포함된 경우로 추정되며 diff 신뢰도에는 영향이 없습니다." }
     ```
     (N은 실제 gap으로 치환. `printFollowDiffs`의 warnings 출력은 기존 경로 재사용.)

**수용 기준:** 분석 로그와 동일한 상황(양쪽 285 수집, 표시 287, `stalled_at_list_end`)에서 — 재검증 미실행, 승격 미실행, followers/following 모두 285로 비교, diff 0/0, status `completed_at_list_end`. 반대로 endReason이 `stalled`(센티널 미확인)인 경우에는 기존 재검증→승격 동작이 그대로 수행됨.

## A3. dom-fallback 단독 근거의 diff 진입 차단 (안전망)

**문제:** A2 게이트가 막지 못하는 다른 경로(정당한 승격 상황)에서도, **네트워크 증거가 전혀 없는 승격 계정이 한쪽 diff 버킷에 들어가는 것**은 2026-06-06 회귀와 같은 허위 양성 모양이다. 신뢰 정책상 이런 계정은 diff가 아니라 후보/경고로 안내해야 한다.

**구현 (`main.js`의 `compareFollowSets`):**

1. 순수 헬퍼 추가 (fixture 추출 대상):
   ```js
   // [ig-compare:fallback-only] tools/compare-fixtures.mjs가 추출해 검증. bucket은 주입 가능해야 한다.
   function getFallbackOnlyDiffExclusions(sourceSet, oppositeSet, bucket) {
       const excluded = new Set();
       for (const username of sourceSet) {
           if (oppositeSet.has(username)) continue; // diff를 만들지 않으면 대상 아님
           const sources = Array.from(bucket?.get(username)?.sources || []);
           if (sources.length === 0) continue;
           const fallbackOnly = sources.every((source) =>
               DOM_TIER_SOURCES.has(source) || DOM_CANDIDATE_SOURCES.has(source) || source === "dom-fallback"
           );
           if (fallbackOnly && sources.includes("dom-fallback")) excluded.add(username);
       }
       return excluded;
   }
   ```
   의미: **dom-fallback 승격으로만 confirmed가 된(네트워크 출처가 하나도 없는) 계정이 단방향 diff를 만들려 하면 비교 집합에서 제외.** 맞팔(mutual)에 들어가는 경우는 건드리지 않는다.
2. `compareFollowSets`에서 기존 overcount 제외 직후에 적용:
   ```js
   const fallbackOnlyFollowers = getFallbackOnlyDiffExclusions(followers, following, state.userProvenance.followers);
   const fallbackOnlyFollowing = getFallbackOnlyDiffExclusions(following, followers, state.userProvenance.following);
   fallbackOnlyFollowers.forEach((u) => followers.delete(u));
   fallbackOnlyFollowing.forEach((u) => following.delete(u));
   ```
   (`followers`/`following`이 이미 Set이 아닌 경우 현재 구현 형태에 맞춰 적용 — 현재는 exclusion 적용 후 Set이다.) 제외 결과를 `diffs.excludedFromCompare.fallbackOnlyDiffMembers = { followers: [...정렬], following: [...정렬] }`로 기록. **diff 집합에서 제외했으므로 partition 무결성 검사는 자동으로 일관성 유지.**
3. 출력: `printFollowDiffs`에서 해당 배열이 비어있지 않으면:
   ```js
   console.log("⚠️ dom-fallback 승격 단독 근거 계정은 허위 diff 방지를 위해 final diff에서 제외했습니다. 검증하려면 __igFollowerExplainUser(\"username\") 를 사용하세요.");
   ```
   + 기존 `printAccountList`로 목록 출력.
4. `background.js`의 `compactDebugReport`/스냅샷 압축이 새 필드를 누락하지 않는지 확인(diffs는 통째로 통과되므로 보통 수정 불필요 — 확인만).

**수용 기준:** compare fixture에서 — sources `["dom-candidate","dom-fallback"]`인 단방향 계정은 제외되고 `fallbackOnlyDiffMembers`에 기록; sources에 `DevTools`가 하나라도 있으면 제외되지 않음; 맞팔 멤버는 dom-fallback이어도 유지.

## A4. 신뢰도 라벨·판정 반영

**구현 (`main.js`):**

1. `getListReliability(mode, expectedCount)`에 완결성 판정 통합: `PARTIAL_TRUSTED` 분기보다 **앞에**:
   ```js
   const completion = getListCompletionAssessment(mode, expectedCount);
   ...
   } else if (expectedCount > 0 && verifiedCount < expectedCount && completion.completeAtListEnd) {
       status = "COMPLETE_AT_LIST_END";
       warnings.push(`${label}가 화면 표시 수보다 ${completion.gap}명 적지만 목록 끝 도달이 확인되었습니다. 표시 수에 비활성화/탈퇴 계정이 포함됐을 가능성이 높아 diff 신뢰도에는 영향이 없습니다.`);
   }
   ```
   기존 `COMPLETE_BUT_LOW_MARGIN`(|gap|≤2) 분기보다도 앞에 두어 이 케이스를 우선 분류한다(후보 2명이 DOM-tier로 남아 있어도 candidateCount 경고가 아닌 이 라벨이 잡히도록 — 단 candidateCount 중 비DOM 후보가 있으면 `completeAtListEnd`가 false이므로 자연히 기존 분기로 떨어진다).
2. `buildDebugReport`의 `overallReliability` 매핑: `COMPLETE_AT_LIST_END`는 `COMPLETE_BUT_LOW_MARGIN`과 동급으로 취급(=PARTIAL로 강등하지 않음).
3. `printDecisionCard`의 trustGate: 현재 `followersMatch`/`followingMatch`(compareCounts === expected) 조건을 다음으로 완화:
   ```js
   const followersMatch = !expectedFollowers || compareCounts.followers === expectedFollowers || summary.followersCompletion?.completeAtListEnd === true;
   ```
   (following 동일.) → 이번 케이스에서 판정이 "참고용 결과"가 아니라 **"확정 비교 가능"**이 된다 (DevTools 보조 + 목록 끝 확정 + 무결성 통과이므로 타당).
4. `printSummary`의 "수량 차이" 출력 직후, completion이 있으면 한 줄 추가: `🧮 차이 해석: 목록 끝 확정 — 비활성 계정 포함 추정 (${gap}명)`.

**수용 기준:** 분석 로그 상황 재현 시 신뢰도 요약이 `COMPLETE_AT_LIST_END`(또는 followers/following 각각), 전체 신뢰도 비-PARTIAL, 판정 "확정 비교 가능".

## A5. 목록 끝 확정 시 정체 조기 종료 (성능, ~40초 단축)

**문제:** 센티널이 목록 끝을 확인한 뒤에도 `MAX_STABLE_TICKS = 16`까지 빈 틱을 돈다 (로그: stable 4→15, 목록당 ~25초).

**구현 (`main.js`의 `scrollUntilEnd`):**

1. 상수: `const MIN_STABLE_TICKS_AT_LIST_END = 6;`
2. 기존 `stableTicks >= MAX_STABLE_TICKS` 분기 **앞에**:
   ```js
   const endSignalFresh = endSignal.visible && Date.now() - endSignal.atMs < 8000;
   if (
       stableTicks >= MIN_STABLE_TICKS_AT_LIST_END &&
       endSignalFresh &&
       limitLabel > 0 &&
       targetSet.size >= limitLabel - DISPLAYED_COUNT_GAP_TOLERANCE
   ) {
       console.log(`🏁 ${baseLog} 목록 끝이 확인되고 ${stableTicks}틱 연속 신규 없음 → 조기 종료합니다.`);
       state.lastScrollEndReason = "stalled_at_list_end";
       break;
   }
   ```
   안전 조건: 표시 수 기준 허용 격차 이내일 때만 조기 종료(대량 미수집 상태에서의 성급한 종료 방지). `endSignal`은 R3에서 도입된 기존 객체를 사용 — 변수 스코프가 분기에서 접근 가능한지 확인하고 필요하면 끌어올릴 것.
3. recovery 경로(`stalled_after_recovery`)와 expected 없음(limitLabel 0) 케이스는 변경하지 않는다.

**수용 기준:** 표준 실행에서 정체 꼬리가 16틱 → 6~7틱으로 줄고 종료 사유는 여전히 `stalled_at_list_end`. 표시 수 대비 많이 부족한 상태(예: 수집 50%)에서는 조기 종료가 발동하지 않음.

## A6. 소음·표기 버그 정리 (소형 3건)

1. **중복 브리지 동기화 호출 제거:** `installExtensionMessageBridge` 말미의 `notifyContentBridgeReady()` 호출을 제거한다 (`runAccuracyPreflight`가 단일 호출 지점이 되도록; 제거 자리에 주석 "preflight가 동기화 담당"). paste 모드 등 preflight가 없는 경로가 있는지 확인 — `main()`은 항상 preflight를 호출하므로 안전.
2. **"약 0KB" 표기 수정:** `background.js`의 `storeRunSnapshot` 성공 응답에 `approxBytes`가 **모든 경로에서** 포함되는지 확인하고 누락 경로를 수정. `main.js`의 성공 로그는 `approxBytes`가 양수일 때만 `(약 ${Math.max(1, Math.round(approxBytes / 1024))}KB)`를 표기하고, 없으면 크기 표기를 생략.
3. **미해석 행 진단 라벨 명확화:** `getCollectionDiagnostic`의 `unresolvedRows`는 대부분 "팔로잉" 버튼 텍스트만 잡힌 조각 행이다. 출력 문구를 "⚠️ 프로필 링크를 해석하지 못한 행 후보(버튼 조각 행 포함 가능):"로 바꿔 미수집 계정으로 오독되지 않게 한다. (로직 변경 없음, 문구만.)

## A7. fixture·문서 갱신

1. **`tools/compare-fixtures.mjs` 확장** (기존 추출 헬퍼 재사용, 합성 데이터만):
   - `assessListCompletion`: A1 수용 기준의 5개 케이스.
   - `getFallbackOnlyDiffExclusions`: A3 수용 기준의 3개 케이스.
2. **e2e 시나리오 추가(코드만, 실행은 환경 가능 시):** `tools/e2e/` fixture에 "헤더 카운트가 목록보다 2 큰" variant — 표시 38/32, 실제 목록 36/30 → 기대: 재검증·승격 미발동, diff가 ground truth와 일치, status `completed_at_list_end`. 현재 환경에서 `npm run e2e`가 미통과 상태(`docs/RELIABILITY_RESEARCH_2026-06-10.md`의 R8 메모)이므로 실행 불가 시 그 사유를 `docs/HANDOFF.md`에 기록.
3. **문서 갱신:**
   - `AGENTS.md`의 "Regression Guardrails from 2026-06-06" 섹션의 bounded fallback 규칙에 단서 1줄 추가: "If list end is confirmed (network pages exhausted + DOM stalled at the visible end) and the gap to the displayed count is small, do NOT promote DOM candidates — treat the displayed count as including inactive accounts."
   - `docs/BACKLOG.md`: "2026-06-11 List-end Accuracy" 섹션에 A1~A7 상태 기록.
   - `docs/HANDOFF.md`: 이번 실측 로그의 분석 결론(285/285가 진실, 헤더 287은 비활성 포함 추정)과 수정 후 기대 pass shape를 기록: **DevTools 285/285, final diff 0/0, status `completed_at_list_end`, 판정 "확정 비교 가능", 실행 시간 단축(재검증 생략 + 조기 정체 종료)**. 기존 "287/287 pass shape" 기준은 이 계정의 현재 상태에선 285/285로 갱신됨을 명시.

## 2. 회귀 체크리스트 (수동 Chrome)

1. 기준 계정 재실행 → followers/following 모두 285 수집, **diff 0/0**, status `completed_at_list_end`, 판정 "확정 비교 가능", "비활성화/탈퇴 계정 포함 가능성" 안내 출력, haeunieii/won_donghwi는 dom-candidate 진단으로만 존재(diff에 없음).
2. 재검증·승격 로그가 출력되지 않고 총 실행 시간이 눈에 띄게 감소(~4.5분 → ~2.5분대 기대).
3. DevTools를 닫고 실행(DOM_PREVIEW 경로) → 기존 동작 유지(이 경로는 네트워크 증거가 없어 `completeAtListEnd`가 성립하지 않음 — 기존 승격/partial 로직 그대로).
4. fixture 2종 통과 + `chrome://extensions` 에러 패널 무오염.
5. 저장 로그에 실제 KB 수치 표기, 동기화 로그 1회만 출력.

## 3. 명시적 비범위

- 승격 랭킹/비교자(R10) 변경, 429/observer 로직 변경, 헤더 카운트 파싱 방식 변경.
- 비활성 계정의 실제 식별(불가능 — 우리는 추정 안내만 한다).
- `DISPLAYED_COUNT_GAP_TOLERANCE`를 5보다 크게 잡는 것 (큰 격차는 진짜 미수집일 수 있으므로 보수적으로 유지).
