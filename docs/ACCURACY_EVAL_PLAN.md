# Accuracy Eval Plan

## Goal

Catch the failure classes already seen in this project without storing private Instagram payloads.

## Fixture requirements

Use sanitized synthetic usernames such as `user001`, `user002`, and `candidate001`. Do not store cookies, auth headers, raw Instagram response bodies, or real account dumps.

## Required scenarios

| ID | Scenario | Expected result |
| --- | --- | --- |
| AE-001 | DevTools or Debugger exact lists match counts, with no unsafe exit or unresolved capture | trust gate `확정 비교 가능`; strict diff uses exact capture sets |
| AE-002 | DOM observes two extra accounts after network confirmed count is complete | extras stay `dom-candidate`; final diff excludes them |
| AE-003 | DevTools or Debugger connected but no matching payload | rerun-needed, never confirmed by readiness alone |
| AE-004 | One-sided DevTools payload only | status shows partial side; final output warns which side is weaker |
| AE-005 | Recursive payload includes owner/viewer/suggestion username outside list containers | outside username is ignored or candidate-only, never final confirmed |
| AE-006 | Strict network is short by N and DOM has extra candidates | engine-bounded fallback is assisted only; strict counts never increase from DOM |
| AE-007 | DevTools closes or tab reloads mid-run | background state becomes stale/disconnected rather than permanently connected |
| AE-008 | Page-network bridge remains passive | no unrelated `edge-chat`, `mqtt`, `direct`, upload, or logging payload becomes evidence |
| AE-009 | Terminal pagination plus DOM end explains a small displayed-count gap | confirm only under engine guards; do not fill strict sets with DOM |
| AE-010 | Responses finish out of request order or capture is pending/failed | stale pagination cannot overwrite newer proof; unresolved capture blocks confirmation |
| AE-011 | Operator stops during collection/backoff; late response arrives | preserve partial result, detach, ignore late usernames and stale stop requests |
| AE-012 | Saved result belongs to another profile | hide old counts/lists; retain explicit previous-result context |
| AE-013 | More than 1,000 accounts, quota pressure, or repeated sanitization | preserve totals/truncation, bounded lists and newest/active results; disclose failures |

## Existing check mapping

`npm test` is the primary non-browser check. This map names relevant coverage,
not proof that every combined scenario has been run against Instagram.

| Cases | Existing checks |
| --- | --- |
| AE-001 through AE-006, AE-009 | `tools/accuracy-engine-fixtures.mjs`, `tools/compare-fixtures.mjs`, `tools/network-payload-parser-fixtures.mjs` |
| AE-005, AE-008 | `tools/walker-fixtures.mjs`, `tools/network-payload-parser-fixtures.mjs`; passive browser behavior also needs manual observation |
| AE-007, AE-010 | `tools/debugger-capture-fixtures.mjs`, `tools/devtools-capture-fixtures.mjs`, `tools/accuracy-engine-fixtures.mjs` |
| AE-011 | `tools/e2e/run.mjs`, `tools/e2e/real-capture.mjs`; pure capture/engine fixtures cover related late-response and partial-state rules |
| AE-012 | `tools/run-context-fixtures.mjs`, optional `tools/account-list-render-fixtures.mjs` |
| AE-013 | `tools/account-list-contract-fixtures.mjs`, `tools/session-retention-fixtures.mjs`, optional UI render checks |

## Manual checklist

1. Reload unpacked extension.
2. Reload Instagram profile tab.
3. Open DevTools before opening lists, then start from the popup and check exact payloads, not just bridge readiness.
4. Repeat with DevTools opened late; expect `connected/no payload` or reload guidance.
5. With DevTools closed, expect run-scoped automatic Debugger capture when available; if unavailable, expect explicit preview/partial/rerun guidance. Do not enable page-network auto-assist to make the check pass.
6. Inspect one suspicious account with `__igFollowerExplainUser("username")` before changing code.
7. Check final compare counts before raw/provenance/candidate diagnostics.
8. Check one manual stop; confirm partial preservation, detach, and unchanged results after late responses. Use generated fixtures for rate-limit cases, not private payload replay.

## Optional browser checks

Owner: local project operator. Run only within an authorized browser-validation
task and with existing dependencies; missing dependencies are `blocked`, not a
reason to install during a documentation refresh. These are whole-command
limits for the operator/session, not a new timer installed in the runners.

| Command | Total limit | Expected evidence |
| --- | --- | --- |
| `npm run e2e` | 15 minutes | npm script startup, then `E2E results` and all six scenario outcomes; any skip remains disclosed |
| `npm run e2e:capture` | 10 minutes | `capture progress`, then PASS lines for capture, cancellation, worker restart/detach, navigation/tab close |
| `npm run ui:e2e` | 5 minutes | `account list render fixtures passed` and viewport results; inspect relevant synthetic screenshots separately |

Preserve sanitized stdout, scenario names, duration, exit status, and any blocker.
An assertion failure is `fail`; timeout/missing browser/environment is `blocked`;
an intentionally unrun command is `skipped`. Stop only the test's own process
and browser on timeout; do not close unrelated user browsers. Rerun after the
specific environment issue is resolved or relevant code changes, within scope.
Record what local fixtures prove separately from live Instagram or the installed
extension. Screenshots must not contain private account or session information.

## Regression trigger

Add or update fixtures when any of these happen:

- A candidate, DOM fallback, or page-network-only account appears in strict final diff without exact DevTools/Debugger evidence.
- A username-specific exception is proposed.
- DevTools state says connected after close/reload without fresh status.
- DOM count equals expected but evidence composition changed.
- A broad network response adds unrelated usernames.

## 비교 평가 고정 조건 — 2026-09-20

실제 비교 평가가 승인된 경우에만 기준 버전과 후보 버전, 실행환경·명령·입력·
판정 기준·초기 상태를 먼저 기록한다. 후보와 AE-001~AE-013 전체 목록을 고정하고
결과를 보고 사례를 빼지 않는다. 일부 확인이 막혔다면 전체 통과 대신 해당
사례와 이유를 미확인으로 남긴다. 기존 선택적 브라우저 검사와 시간 한도는 유지한다.

개발에 사용한 합성 사례와 최종 확인용으로 별도 남긴 합성 사례를 구분한다.
개발 중 이미 본 사례를 미노출 사례라고 부르지 않는다. 별도 사례가 없다면
그 한계를 기록하고 개인정보나 실제 계정 자료로 채우지 않는다.

기존 동작 유지와 새 동작 결과는 따로 보고한다. 새 동작 성공이 기존 실패를
상쇄하지 않는다. 도구·설정 변경 효과와 이전 실행 경험을 섞어 주장하지 않으며,
경험을 누적하는 기능이 없는 비교에는 경험 항목을 해당 없음으로 둔다.
이 프로젝트에 없는 AI 모델 비교 조건을 의무로 추가하지 않는다.

이번에는 평가 문서만 보완했다. 테스트·브라우저·계정 작업을 실행하거나
수집 동작·권한·기존 테스트를 바꾸지 않는다.

이 절은 2026-09-20 문서 부분 반영(MD-07)이다. 앞의 과거 기록과
당시 검증 결과는 그대로 보존한다. 출처는
[키트의 연구 반영 기록](../../AI_architecture/examples/research-materials/2026-09-20-harness-loop-adoption.md)이며,
비교본은 `main/e25d4a0`에 미커밋 문서 변경이 더해진 임시 상태다.
키트 전체의 확정 버전을 적용했다는 뜻이 아니다. 되돌릴 때는 이번에 추가한
문단·필드만 제거하고 기존 파일 전체를 삭제하거나 복원하지 않는다.
