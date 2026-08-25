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
