# Instagram Follower Compare Extension

This repository is a local Chrome extension for comparing Instagram followers
and following. It is not an AI project starter kit and it is not a cloud
automation service.

## Purpose

The extension helps the local operator answer:

- Who follows me but I do not follow?
- Who do I follow but does not follow me?
- Were either follower/following lists incomplete?
- Which results are reliable enough to trust?

The collector should always prefer useful partial output over silence. When a
list is incomplete, the console summary must say which side is incomplete and
which diff fields may contain false positives.

## Core Files

- `manifest.json`: Manifest V3 extension definition.
- `background.js`: action click handler and DevTools-to-page message relay.
- `debugger-capture.js`: run-scoped automatic CDP Network capture controller.
- `network-payload-parser.js`: shared privacy-preserving Instagram response parser.
- `account-list-contract.js`: bounded username-list validation and session data contract.
- `account-list-ui.js`: shared popup/panel account disclosure renderer.
- `session-retention.js`: shared save queue and oldest-result cleanup under the session storage budget.
- `accuracy-engine.js`: canonical count, completion, trust, and strict/assisted comparison rules.
- `main.js`: injected page collector, modal scroller, result comparer, and Korean console reporter.
- `popup.html`: local start/progress/result popup shown from the extension icon.
- `devtools.html`: Chrome DevTools extension entrypoint.
- `devtools.js`: optional DevTools Network response username extractor.
- `devtools-panel.html`: detailed `IG Comparator` diagnostics panel.
- `docs/PROJECT_PROFILE.md`: stable project purpose, architecture, and non-goals.
- `docs/HANDOFF.md`: current session state and next action.
- `docs/SECURITY.md`: privacy, permission, and data-handling boundaries.
- `docs/BACKLOG.md`: project-specific extension backlog.

## Collection Strategy

Use layered collection because Instagram DOM and network behavior are unstable:

1. Existing DevTools Network capture when DevTools is already open.
2. Otherwise, run-scoped automatic `chrome.debugger` Network capture.
3. Optional page-network bridge evidence.
4. DOM modal scrolling and profile-link extraction.
5. Expected count parsing and diagnostics.

## Local Validation

Run syntax checks after script changes:

```bash
node --check main.js
node --check background.js
node --check devtools.js
```

Or run the full local fixture suite:

```bash
npm test
npm run e2e
npm run e2e:capture
npm run ui:e2e
```

Install locally by opening `chrome://extensions`, enabling Developer mode,
choosing **Load unpacked**, and selecting this repository folder (the folder
that directly contains `manifest.json`; do not select an individual file).

Manual Chrome check:

1. Reload the unpacked extension from `chrome://extensions`.
2. Reload the Instagram profile tab.
3. Click the extension icon and press **비교 시작**. DevTools는 선택 사항입니다.
4. Chrome의 디버깅 알림 표시줄이 보일 수 있으며, 실행이 끝나면 자동 캡처가 분리됩니다.
5. Confirm the popup shows live collection status.
6. In DevTools, open the **IG Comparator** panel for detailed evidence status.
7. Review the Korean verdict: `확정 비교 가능`, `참고용 결과`, `부분 결과`, or `네트워크 수집 재실행 필요`.
8. Open `계정 상세` to see `나만 팔로우`, `나를 팔로우`, and separately grouped candidate usernames. Lists start collapsed and reveal 20 names at a time; clicking a username opens its Instagram profile in a new tab.

### 수집 중단과 계정 검색

- 수집 중 팝업의 **중단하고 현재까지 결과 보기** 또는 DevTools 패널의 **수집 중단**을 누르면 대기를 종료하고 현재까지의 부분 결과를 보존합니다. 요청 제한으로 대기 중인 경우도 중단할 수 있습니다. 중단된 비교는 누락 때문에 관계 분류가 부정확할 수 있어 확정 결과로 표시하지 않습니다.
- 계정 목록을 펼치면 사용자명을 검색할 수 있습니다. 대소문자를 구분하지 않으며 앞의 `@`는 생략할 수 있습니다. 검색은 브라우저에 저장된 목록만 대상으로 하며 Instagram에 추가 요청을 보내지 않습니다.
- 목록별 최대 1,000명을 저장합니다. 예를 들어 `전체 1,005명 · 저장된 1,000명`으로 표시되면 나머지 5명은 검색 대상에 포함되지 않습니다. 이전 버전에서 전체 수량을 저장하지 않은 결과는 `전체 수량 미상`으로 표시합니다.
- 프로필별 저장 결과는 최근 10개, 전체 세션 사용량은 약 8MB를 목표로 관리합니다. 오래된 결과부터 정리하되 실행 중인 프로필과 새로 저장하는 결과를 보호합니다. 진행 상황은 탭을 닫을 때 별도로 정리하며, 실행 중인 결과 보호 때문에 목표 용량을 맞출 수 없으면 기존의 축약 저장·저장 실패 안내를 사용합니다.

## Operating Rules

- Keep DevTools Network capture optional.
- The local-only build intentionally uses the powerful `debugger` permission only during an active run.
- Do not store secrets, cookies, auth headers, private messages, or raw API payload archives.
- Relay only derived usernames, source/provenance, counts, timestamps, and diagnostics.
- Keep project-specific bugs in `docs/BACKLOG.md`.
- Use `dogfood/` only for AI Project Kit feedback, not extension runtime bugs.

## Optional Starter-Kit Reference Material

This directory still contains some copied starter-kit recipes, examples, and
dogfood templates. Treat them as reference material only. They are not part of
the extension runtime and should not override the project-specific docs above.
