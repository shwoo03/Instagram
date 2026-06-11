# 슈퍼 확장 리서치 노트 — 2026-06-10 (정확도·안정성 심화)

공식 문서와 베스트 프랙티스 조사 결과. 각 항목은 `소스 → 발견 → 제안 → 우선순위` 구조로 기록한다. 2026-06-10 구현 패스에서 R2/R3/R4/R7/R10은 adopted로 전환했고, 2026-06-11 플랫폼 안정성 패스에서 R5/R6/R8도 adopted로 전환했다. 채택 근거는 `docs/REFERENCES.md`와 `docs/BACKLOG.md`에 연결했다.

전제: 2026-06-07 정확도 연구(evidence 게이팅, walker 컨테이너 제한)와 2026-06-10 안정성/성능 계획(`docs/STABILITY_PERF_PLAN_2026-06-10.md`)의 항목 대부분은 이미 작업 트리에 반영됨을 확인했다(`isRunSuperseded`, `isDevtoolsBridgeFresh`, `MAX_COLLECTION_MS`, `sourceCountsCache`, `buildSessionMessagePayload`, walker 센티널+fixture 등). 단 S3(modal_closed 감지)과 P1(scrollBox 캐시/2-pass)은 흔적이 없거나 부분적이므로 구현 여부를 회귀 체크리스트로 재확인할 것.

---

## R1. 공식 데이터 내보내기(Download Your Information) 임포트 — 정확도의 종착점

- 소스: Instagram 데이터 내보내기 구조 문서화 자료
  - https://fans.walter-labs.com/blog/where-are-followers-and-following-in-instagram-data-export/
  - https://safeunfollow.app/docs/instagram-export
  - 커뮤니티 파서 구현례: https://github.com/Rush-Shaw/Instagram-Followers , https://gist.github.com/aaraza/ce3a48300f6f4e6a5d589b81f1821b13
- 발견:
  - 내보내기 ZIP의 `connections/followers_and_following/` 경로에 `followers_1.json`(대형 계정은 `followers_2.json`… 분할), `following.json`이 존재.
  - 구조: followers는 `relationships_followers` 배열(또는 파일 루트가 바로 배열), following은 `relationships_following` 배열. 각 원소는 `string_list_data[0]`에 `value`(username), `href`(프로필 URL), `timestamp` 보유.
  - 요청 방법: "내 정보 다운로드" → 일부 선택 → "팔로워 및 팔로잉" → JSON 형식 → 기간 All time.
- 제안:
  - `main.js`의 `sources.officialExport: { used: false }` placeholder를 실제 기능으로: `window.__igFollowerImportOfficialExport(jsonText, "followers" | "following")` 콘솔 헬퍼 추가. 두 형태(루트 배열 / `relationships_*` 키) 모두 파싱, `string_list_data[].value`만 추출.
  - provenance 소스 `official-export`를 **최상위 신뢰 등급**으로 추가하고 정확도 모드에 `OFFICIAL_EXPORT_VERIFIED`(DevTools 보조보다 위) 신설. 스크래핑 결과와의 diff를 "수집 누락 진단"으로 출력 (예: export에는 있는데 수집에 없음 → 수집 누락; 반대는 export 이후 변동 가능성).
  - 프라이버시: export 원문(JSON 전문, timestamp, href)은 저장하지 않고 username 배열만 파생 (`docs/SECURITY.md` 허용 범위 내). 파일 자체를 storage에 넣지 않는다.
  - 한계 명시: export는 요청 시점 스냅샷이라 실시간과 어긋날 수 있음 → 결과 카드에 export 기준 시각 표기(연도 단위라도) 권고 문구.
- 우선순위: **1** — 스크래핑 고도화보다 확실한 "완전 정확" 경로이며 코드에 자리가 이미 있다.

## R2. 429/레이트리밋 감지 + 적응형 백오프 — 계정 안전과 완전 수집

- 상태: **adopted** (2026-06-10, 구현 R2)

- 소스:
  - https://www.getphyllo.com/post/navigating-instagram-api-rate-limit-errors-a-comprehensive-guide (지수 백오프 권고)
  - https://github.com/instaloader/instaloader/issues/834 (반복 429 사례: 대기 없이는 차단이 길어짐)
  - https://the-erone.com/http-error-429-instagram/
- 발견: Instagram 웹은 과도한 목록 요청에 429("Please wait a few minutes")를 반환하며, 표준 대응은 지수 백오프 + 반복 시 중단. 본 확장의 요청 속도는 스크롤 속도가 결정하므로 스크롤 일시정지가 곧 백오프다.
- 제안:
  - `page-network-bridge.js`: 후킹된 XHR/fetch에서 followers/following/friendships 매칭 URL의 **429 상태 관측 시** `IG_PAGE_NETWORK_RATE_LIMITED` status 메시지 postMessage (본문 접근 불필요, 상태 코드만).
  - `devtools.js`: `request.response.status === 429`도 동일하게 status로 relay.
  - `main.js`: 신호 수신 시 진행 중 스크롤 루프를 60초→120초→240초 지수 일시정지(한국어 안내: "Instagram 요청 제한 감지, N초 대기 후 재개"), `runTimeline`에 기록, 3회 초과 시 `rate_limited` 사유로 partial 종료 + "몇 분 뒤 재실행" 권고. 대기 중에도 superseded/시간 상한 체크 유지.
  - 절대 하지 말 것: 더 빠른 재시도, 요청 재발행(우리는 요청을 만들지 않는다 — 관측만).
- 우선순위: **2** — 대형 계정에서 미수집 원인 1순위이자 계정 보호 장치.

## R3. MutationObserver 행 수집 + IntersectionObserver 종료 센티널 — 가상화 누락 봉합

- 상태: **adopted** (2026-06-10, 구현 R3)

- 소스 (REFERENCES.md에 기채택된 방향의 구현 단계):
  - https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
  - https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
  - 가상화 동작 배경: https://ehosseini.info/articles/list-virtualization/
- 발견: 가상화 목록은 DOM 노드를 재활용하므로 **폴링 tick 사이에 나타났다 사라진 행은 현 방식으로는 영원히 누락**된다. MutationObserver(childList+subtree)는 추가되는 모든 노드를 동기적으로 통지하므로 재활용 속도와 무관하게 포착한다.
- 제안:
  - `scrollUntilEnd` 시작 시 scrollBox에 observer 설치: `addedNodes`에서 `a[href]`만 추출해 기존 `collectFromDOM`과 동일한 정책(네트워크 확정 후에는 dom-candidate)으로 흘려보냄. 소스 라벨 `dom-observer`. 수집 종료/중단/예외 시 반드시 `disconnect()` (S2 finally 경로 포함).
  - 배치 처리: observer 콜백에서 직접 무거운 일을 하지 말고 username만 큐에 적재, 기존 tick에서 일괄 반영 (콜백 폭주 방지).
  - 종료 센티널: 마지막 행 요소에 IntersectionObserver를 걸어 "마지막 행이 뷰포트에 들어왔고 N초간 새 행 없음"을 `observer_end_confirmed` 보조 종료 근거로 기록 — stall 종료의 신뢰도를 한 단계 올림.
  - 가드레일 유지: observer 증거는 DOM 증거다. 확정 네트워크 증거를 절대 덮지 않는다 (AGENTS.md 규칙 그대로).
- 우선순위: **3** — DOM 측 정확도의 마지막 구조적 구멍.

## R4. 실행 중 프로필 변경(SPA soft navigation) 감지

- 상태: **adopted** (2026-06-10, 구현 R4)

- 소스: Instagram은 React SPA — 모달 밖 클릭/뒤로가기로 URL이 바뀌어도 콘텐츠 스크립트는 유지된다. (감지는 신규 API 없이 가능; 참고: https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API )
- 발견: 실행 중 다른 프로필로 이동하면 `getProfileKey()`가 도중에 달라져 잘못된 프로필로 라벨·저장될 수 있다.
- 제안: `main()` 시작 시 `const runProfile = getProfileKey()` 고정 → 스크롤/안정화 루프마다 `getProfileKey() !== runProfile`이면 `profile_changed` 사유로 한국어 안내 + partial persist 후 중단. (Navigation API 의존 불필요 — 기존 루프에서 문자열 비교만.)
- 우선순위: **4** — 구현 몇 줄로 오염 시나리오 하나 제거.

## R5. 서비스 워커 무상태화 — background 상태의 storage.session 영속화

- 상태: **adopted** (2026-06-11, 구현 R5)

- 소스 (공식): https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- 발견 (정확한 규칙):
  - SW는 **유휴 30초** 후 종료. 이벤트 수신/확장 API 호출이 타이머를 리셋(Chrome 110+).
  - **포트는 열려 있는 것만으로는 수명을 연장하지 않는다(Chrome 114+); 포트를 오가는 메시지가 리셋한다.** 즉 DevTools 하트비트가 백오프로 뜸해지면 SW가 자다 깨는 시나리오가 정상 경로다.
  - 단일 이벤트 처리 5분 초과, fetch 응답 30초 초과 시에도 종료.
  - 공식 가이드: "전역 변수는 종료 시 소실되므로 storage에 저장하라" — 이벤트 핸들러를 무상태로 설계.
- 제안:
  - `background.js`의 `devtoolsTabs` Map을 `chrome.storage.session`에 미러: `setDevtoolsTabState`가 메모리 갱신 후 `storage.session.set({ devtoolsTabs: ... })`(디바운스 가능), SW 기동 시(top-level) lazy-load해 메모리 캐시 워밍. 키 정리는 기존 `tabs.onRemoved`/`onUpdated` 경로에서 동일하게.
  - 효과: SW 재시작 직후 `IG_CONTENT_BRIDGE_READY` preflight가 빈 상태 대신 마지막 freshness 타임스탬프로 답해 "DevTools 연결됨" 오판/미판이 줄어든다 (TTL 검사는 기존 그대로 적용되므로 안전).
- 우선순위: **5**

## R6. storage.session quota 가드 + truncated 플래그

- 상태: **adopted** (2026-06-11, 구현 R6)

- 소스 (공식): https://developer.chrome.com/docs/extensions/reference/api/storage — `storage.session` QUOTA_BYTES ≈ **10MB**(메모리 저장), `getBytesInUse()` 지원.
- 발견: 현재 `storeRunSnapshot`은 set() 실패를 에러 문자열로만 보고한다. 수만 팔로워 계정이면 압축 후에도 한도 초과 가능.
- 제안: set() 전 `getBytesInUse()` 또는 `JSON.stringify(snapshot).length` 추정으로 예산 검사 → 초과 시 단계적 드랍(provenance → candidates → diagnostics 순) + 각 섹션에 `truncated: true` 플래그(백로그 2026-06-07 open 항목 충족). 최종 실패 시 usernames/counts만 담은 최소 스냅샷 폴백 저장. 결과 카드에 "스냅샷 일부 절단" 한국어 경고.
- 우선순위: **6**

## R7. DevTools 캡처의 onNavigated 인지

- 상태: **adopted** (2026-06-10, 구현 R7)

- 소스 (공식): https://developer.chrome.com/docs/extensions/reference/api/devtools/network — `onNavigated` 이벤트 제공; DevTools를 늦게 열면 이전 요청 누락(getHAR 주석); 본문은 `getContent()`로만.
- 발견: 페이지가 리로드되면 네트워크 컨텍스트가 바뀌는데 현재 devtools.js는 이를 구분하지 않아, 리로드 전 stats(matched/sent)가 새 페이지 상태처럼 보인다.
- 제안: `chrome.devtools.network.onNavigated` 리스너 추가 → per-page 카운터(matched/sent/ignored) 리셋(누적치는 별도 보존) + `sendStatus("navigated")` 전송 → `main.js`는 navigated status 수신 시 "DevTools 캡처 컨텍스트가 초기화되었습니다. 목록을 다시 여세요" 한국어 안내. `getContent()`는 콜백 즉시 호출 유지(내비게이션 전 본문 확보).
- 우선순위: **7**

## R8. Puppeteer 기반 로컬 e2e 회귀 하네스

- 상태: **adopted** (2026-06-11, 구현 R8; 현재 환경의 `npm run e2e`는 Chrome/Puppeteer extension injection 오류로 미통과)

- 소스 (공식):
  - https://developer.chrome.com/docs/extensions/how-to/test/puppeteer (unpacked 확장 로드, `enableExtensions`/`--load-extension`)
  - https://developer.chrome.com/docs/extensions/how-to/test/test-serviceworker-termination-with-puppeteer (SW 강제 종료 테스트 — R5 검증에 그대로 사용)
  - https://pptr.dev/guides/chrome-extensions , https://playwright.dev/docs/chrome-extensions (Playwright는 `launchPersistentContext` 필요)
- 발견: 확장을 실제 Chrome에 로드해 service worker 타깃까지 잡는 공식 테스트 경로가 있다. Instagram 없이도 모달 구조(role=dialog + 가상 스크롤 + 프로필 링크)를 모사한 로컬 fixture HTML로 전체 파이프라인(주입→수집→비교→저장) 회귀가 가능하다.
- 제안:
  - `tools/e2e/` 신설: fixture HTML(합성 username만, 실데이터 금지) + Puppeteer 스크립트. 시나리오: 표준 수집 완료 / 모달 중도 닫기(modal_closed) / 더블 클릭 재진입 / SW kill 후 상태 복원(R5) / 429 신호 주입(R2).
  - devDependency(puppeteer) 추가는 kit-level 결정이므로 `docs/REFERENCES.md`에 adoption 기록 후 진행. 번들러는 여전히 불필요.
  - `node --check` + walker fixture는 빠른 게이트로 유지, e2e는 수동/선택 게이트로 시작.
- 우선순위: **8** — 인프라 투자이지만 "수동 Chrome 검증" 병목을 처음으로 자동화.

## R9. 하드닝: 주입 nonce + minimum_chrome_version

- 소스: https://developer.chrome.com/docs/extensions/develop/concepts/messaging (외부 입력 검증 권고), MV3 호환성: world:MAIN·storage.session은 Chrome 102+, 포트 메시지 수명 규칙은 114+.
- 발견: MAIN world `postMessage`는 페이지 내 임의 스크립트가 `source: "ig-page-network-bridge"`를 위조해 **가짜 confirmed username을 주입**할 수 있다. 또한 manifest에 `minimum_chrome_version`이 없어 구버전 Chrome에서 미정의 동작 여지가 있다.
- 제안:
  - background가 주입 직전 nonce 생성 → `chrome.scripting.executeScript({world: "MAIN", func: (n) => { window.__igFollowerBridgeNonce = n; }, args: [nonce]})`를 bridge 파일 주입 **앞에** 실행, 같은 nonce를 main.js에도 전달(isolated world 동일 방식) → bridge는 모든 postMessage에 nonce 포함, content listener는 불일치 시 폐기 + 위조 시도 카운터를 debugReport에 기록. `docs/SECURITY.md`에 채택 기록 필수.
  - `manifest.json`에 `"minimum_chrome_version": "114"` 추가 (포트 수명 규칙·world:MAIN·storage.session 모두 충족되는 하한).
  - `externally_connectable` 미설정(기본: 웹페이지에서 메시지 불가) 현 상태를 SECURITY.md에 "의도된 기본값"으로 명문화.
- 우선순위: **9**

## R10. 정확도 정책 마무리: evidence-ranked fallback + 비교 로직 fixture화

- 상태: **adopted** (2026-06-10, 구현 R10)

- 소스: 백로그 open 항목("rank DOM fallback promotions by evidence strength") + 2026-06-07 연구 결론("다음 고가치 작업은 평가 매트릭스와 fixture").
- 제안:
  - `promoteDomCandidatesToConfirmed`/`getOvercountLowConfidenceExclusions`의 알파벳순을 evidence 점수로 교체: `seenCount`(연속 관찰) > `sourceSeenCounts` 다양성 > 최근성(lastSeenAt) > 알파벳(동률 tie-break). 점수 산식을 debugReport에 기록해 설명 가능하게.
  - `compareFollowSets`·`getCompareIntegrity`·`getOvercountLowConfidenceExclusions`를 walker처럼 센티널 블록으로 추출해 `tools/walker-fixtures.mjs`(또는 `tools/compare-fixtures.mjs`)에 순수 fixture 추가: DOM-overcount 제외, 한쪽만 DevTools, bounded fallback, partition 무결성.
- 우선순위: **10** — 정확도 정책의 마지막 open 항목 청산.

---

## 권장 진행 묶음

1. **정확도 패키지**: R1(공식 내보내기) + R3(observer 수집) + R10(랭킹·fixture)
2. **계정·수집 안전 패키지**: R2(429 백오프) + R4(프로필 변경 감지)
3. **플랫폼 안정성 패키지**: R5(SW 무상태화) + R6(quota 가드) + R7(onNavigated)
4. **인프라·하드닝 패키지**: R8(e2e) + R9(nonce·min version)

채택 시 의무: 항목별로 `docs/REFERENCES.md`에 adoption 기록 추가, R9는 `docs/SECURITY.md` 갱신, R8은 CLAUDE.md/AGENTS.md 검증 절차 갱신, 완료 상태는 `docs/BACKLOG.md`에 기록.
