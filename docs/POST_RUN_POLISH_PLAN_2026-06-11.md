# 실행 종료 후 보호·진단 폴리시 계획서 (2026-06-11)

구현 담당 에이전트(Codex)용. 2026-06-11 두 번째 실측 런(285/285, diff 0/0, `completed_at_list_end` — A 패스 검증 성공) 로그에서 발견된 잔여 개선 3건.

## 0. 근거 (실측 로그)

- 로그 맨 끝, "8) 전체 저장 완료" **이후에** `📡 [DevTools] Followers +0 / 총 285` payload가 도착했다. 코드 확인 결과 DevTools/page-network의 USERNAMES payload 핸들러는 `window.__igFollowerRunInProgress` 체크 없이 무조건 `state` 세트를 변경한다. 이번엔 +0(전부 중복)이라 무해했지만, 실행 종료 후 사용자가 목록을 수동 스크롤하면 저장된 스냅샷(`window.__igFollowerResult`)과 라이브 `state`가 어긋난다.
- 이번 런에서 표시 수 격차 2명 = DOM 후보 2명(haeunieii, won_donghwi)이 **정확히 일치**했지만, 출력은 이 둘을 연결해 주지 않아 사용자가 직접 추론해야 했다. 또 이 후보들은 DOM에 프로필 링크로 정상 렌더되므로 "비활성화/탈퇴 추정" 단정은 부정확할 수 있다(최근 언팔 캐시/제한 계정 등 "API 미반환 계정"이 더 정확한 표현).
- 신뢰도 경고에 "**팔로잉가** 화면 표시 수보다..." — 받침 뒤 주격 조사 오류("팔로잉이"가 맞음).

## 1. 불변 조건

- 한국어 콘솔 출력 유지, 예상 가능한 degraded 상태에 `console.warn` 금지.
- username 하드코딩 금지 (haeunieii 등은 분석 근거일 뿐).
- READY/STATUS 메시지 처리(신선도 추적)는 **변경하지 않는다** — B1은 USERNAMES payload의 세트 변경만 게이트한다.
- `assessListCompletion` 순수 함수의 시그니처/동작은 변경하지 않는다 (compare-fixtures 보호). 확장은 래퍼(`getListCompletionAssessment`)에서만.
- 라인 번호 대신 함수명으로 위치를 찾을 것. 항목 완료 시마다:
  `node --check main.js && node --check background.js && node --check devtools.js && node tools/walker-fixtures.mjs && node tools/compare-fixtures.mjs`
- 커밋은 항목 ID당 1개 (예: `B1: ignore payloads after run completion`).

---

## B1. 실행 종료 후 payload 게이트 (스냅샷 보호)

**구현 (`main.js`):**

1. 두 bridge state 객체(`state.devtoolsBridge`, `state.pageNetworkBridge`)에 필드 추가: `postRunIgnoredPayloadCount: 0`, `postRunNoticeShown: false`. `main()`의 state 리셋 블록에서 둘 다 0/false로 리셋.
2. `installExtensionMessageBridge`의 `IG_DEVTOOLS_USERNAMES` 분기에서, mode/usernames 검증 직후 **세트 변경 전에**:
   ```js
   if (window.__igFollowerRunInProgress !== true) {
       state.devtoolsBridge.postRunIgnoredPayloadCount++;
       state.devtoolsBridge.lastPayloadAt = message.capturedAt || new Date().toISOString();
       if (!state.devtoolsBridge.postRunNoticeShown) {
           state.devtoolsBridge.postRunNoticeShown = true;
           console.log("ℹ️ 실행 종료 후 도착한 DevTools payload는 저장된 결과 보호를 위해 반영하지 않습니다. 새 수집이 필요하면 확장 아이콘을 다시 클릭하세요.");
       }
       sendResponse?.({ ok: true, ignored: "run-not-active" });
       return false;
   }
   ```
   `addUsername`/`addCandidateUsername` 호출과 payloadCount/addedCount 증가는 게이트 뒤에 둔다(즉 실행 중일 때만 기존대로).
3. `installPageNetworkBridgeListener`의 `IG_PAGE_NETWORK_USERNAMES` 분기에도 동일 게이트 적용 (`state.pageNetworkBridge.*`, 안내 문구는 "page network payload"로).
4. READY/STATUS/DISCONNECTED/rate-limited 분기는 수정하지 않는다 (신선도·429 신호는 실행 외 시간에도 추적 가치가 있음).
5. `getDevtoolsBridgeSnapshot`/`getPageNetworkBridgeSnapshot`은 state spread라 새 카운터가 자동 노출됨 — 별도 수정 불필요함을 확인만.

**수용 기준:** 수집 완료 후 followers 모달을 수동으로 열고 스크롤 → 콘솔에 안내 1회 + `📡 [DevTools] ... +N` 로그가 더 이상 출력되지 않음 + `window.__igFollowerResult.followers.length` 불변 + `window.__igFollowerPrintDevToolsStatus()`에서 `postRunIgnoredPayloadCount > 0` 확인. 실행 중 payload 처리(스크롤 수집)는 기존과 동일.

## B2. 격차↔DOM 후보 상관 진단 + 추정 문구 정밀화

**구현 (`main.js`):**

1. `getListCompletionAssessment` 래퍼의 반환 객체에 `domTierCandidates` 배열 추가(이미 내부에서 후보를 필터링하고 있음 — DOM-tier 후보 username 목록을 정렬해 포함). 순수 함수 `assessListCompletion`은 건드리지 않는다.
2. `main()`의 followers/following `complete_at_list_end` 블록(기존 📋 로그 직후)에 상관 진단 추가:
   ```js
   if (completion.gap > 0 && completion.domTierCandidates.length === completion.gap) {
       console.log(`🔎 격차 ${completion.gap}명과 DOM 후보 ${completion.domTierCandidates.length}명이 일치합니다: ${completion.domTierCandidates.slice(0, 10).join(", ")}`);
       console.log("ℹ️ 이 후보들은 화면 카운터에는 포함되지만 목록 API가 반환하지 않는 계정(최근 언팔 캐시/제한/비활성 등)일 가능성이 높습니다. __igFollowerExplainUser(\"username\") 으로 개별 확인할 수 있습니다.");
       recordRunEvent("gap_matches_dom_candidates", { mode, gap: completion.gap, candidates: completion.domTierCandidates.slice(0, 20) });
   }
   ```
   (일치하지 않으면 출력 없음 — 기존 메시지 유지.)
3. **추정 문구 정밀화:** `grep -n "비활성화/탈퇴" main.js`로 나오는 모든 출력 지점(main()의 📋 로그, `getListReliability`의 COMPLETE_AT_LIST_END 경고, diffs의 `displayed_count_includes_inactive` 경고 메시지, `printSummary`의 차이 해석 줄)의 표현을 통일해 교체:
   - 변경 전: "비활성화/탈퇴 계정이 카운터에 포함된 경우일 가능성이 높습니다" (및 변형)
   - 변경 후: "카운터에는 포함되지만 목록 API가 반환하지 않는 계정(최근 언팔 캐시/제한/비활성 등)이 있는 경우로 추정됩니다"
   경고 `code`(`displayed_count_includes_inactive`)는 그대로 유지(다운스트림 호환), message 텍스트만 교체.
4. `summary.followersCompletion`/`followingCompletion`에 `domTierCandidates`가 포함되므로 debugReport/스냅샷에 자동 전파됨 — `background.js` 압축 경로가 completion 객체를 자르지 않는지 확인만 (배열 20개 cap이면 충분, 필요시 slice).

**수용 기준:** 기준 계정 재실행 시 기존 결과(285/285, diff 0/0) 불변 + "🔎 격차 2명과 DOM 후보 2명이 일치합니다: haeunieii, won_donghwi" 류의 상관 메시지 출력 + 모든 추정 문구가 새 표현으로 통일. 격차와 후보 수가 다른 상황(후보 0명 등)에서는 상관 메시지 미출력.

## B3. 한국어 주격 조사 수정

**구현 (`main.js`):**

1. 헬퍼 추가:
   ```js
   function withSubjectParticle(word) {
       const text = String(word || "");
       const lastChar = text.charCodeAt(text.length - 1);
       if (Number.isNaN(lastChar) || lastChar < 0xac00 || lastChar > 0xd7a3) return `${text}가`;
       return (lastChar - 0xac00) % 28 === 0 ? `${text}가` : `${text}이`;
   }
   ```
2. `grep -n '}가 ' main.js`로 동적 라벨(팔로워/팔로잉) 뒤에 `가`를 붙이는 템플릿을 모두 찾아 적용. 최소 두 곳이 알려져 있다:
   - `getListReliability`의 `COMPLETE_AT_LIST_END` 경고: "`${label}가` 화면 표시 수보다 ..." → `${withSubjectParticle(label)} 화면 표시 수보다 ...`
   - `getListReliability`의 `PARTIAL_TRUSTED` 경고: "...가 화면 표시 수보다 N명 적게 검증되었습니다" (같은 패턴)
   고정 문자열(항상 "팔로워"인 곳 등)은 굳이 바꾸지 않아도 되지만, 동적 `${label}`/`${baseLog}` 뒤의 주격 조사는 전부 헬퍼로 교체.
3. 다른 조사(을/를, 은/는)는 이번 범위가 아니다 — 주격(이/가)만.

**수용 기준:** 재실행 시 "팔로잉이 화면 표시 수보다..."로 출력. "팔로워가"는 그대로(올바름). fixture 2종 + node --check 통과.

---

## 2. 회귀 체크리스트

1. 기준 계정 재실행: 285/285, diff 0/0, `completed_at_list_end`, "확정 비교 가능" 동일 + B2 상관 메시지 + B3 조사 교정 확인.
2. 수집 완료 후 모달 수동 스크롤: B1 안내 1회, 결과 불변 (수용 기준 절차 그대로).
3. DevTools-closed 플로우(DOM_PREVIEW): 기존 동작 불변.
4. `chrome://extensions` 에러 패널 신규 warn/error 없음.

## 3. 문서 갱신 의무

- `docs/BACKLOG.md`: "2026-06-11 Post-run Polish" 섹션에 B1~B3 상태 기록.
- `docs/HANDOFF.md`: 두 번째 실측 런 검증 결과(A 패스 성공)와 B 패스 변경 요약, 수동 검증 미수행 항목 기록.

## 4. 명시적 비범위

- R1(공식 내보내기 임포트), R9(nonce), e2e 미통과 수정 — 별도 계획.
- READY/STATUS 처리, 429/observer/완결성 판정 로직 변경.
- 이/가 외의 조사 처리, 메시지 전반 리라이트.
