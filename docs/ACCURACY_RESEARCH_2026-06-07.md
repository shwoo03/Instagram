# Accuracy Research Notes - 2026-06-07

This note records the research and subagent synthesis used to improve the Instagram follower/following comparator.

## Operator problem

A run can look noisy even when final comparison is correct because raw DOM observations, candidates, network evidence, and final compare sets are different layers. The durable fix is not account-specific filtering. The durable fix is stricter evidence classification, clearer trust labels, and repeatable regression scenarios.

## Source findings

### Chrome DevTools Network API

- Official doc: https://developer.chrome.com/docs/extensions/reference/api/devtools/network
- `chrome.devtools.network.onRequestFinished` exposes requests shown in DevTools Network.
- Response body content is not included in HAR by default; `request.getContent()` must be called.
- If DevTools opens after page load, some earlier requests may be missing. The operator may need to reload Instagram after opening DevTools.
- Project decision: DevTools capture remains the preferred high-confidence browser-local evidence path.

### MV3 service worker lifecycle

- Official doc: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Extension service workers can be terminated after idle time and revived later.
- Global variables can be lost when the worker shuts down.
- Project decision: background DevTools state must be treated as restartable/stale-prone. Use freshness timestamps, disconnect cleanup, and sanitized session snapshots instead of trusting globals indefinitely.

### Content script worlds and page-network bridge

- Official content scripts doc: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Official scripting API doc: https://developer.chrome.com/docs/extensions/reference/scripting/
- Content scripts run in an isolated world by default and do not share JavaScript globals with the host page.
- `chrome.scripting` supports `ExecutionWorld` values including `MAIN`.
- Project decision: page request interception belongs in the MAIN-world `page-network-bridge.js`; isolated-world hooks should not be treated as equivalent page traffic evidence.

### Storage/session snapshots

- Official storage API doc: https://developer.chrome.com/docs/extensions/reference/api/storage
- `chrome.storage.session` stores extension-session memory while the extension is loaded and supports quota inspection.
- Project decision: store derived usernames/counts/timestamps/diagnostics only. Keep raw payloads, cookies, auth headers, request headers, and private content out of storage.

### DeclarativeNetRequest and debugger alternatives

- DNR official doc: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- Debugger official doc: https://developer.chrome.com/docs/extensions/reference/api/debugger
- `declarativeNetRequest` is for rule-based request blocking/modification, not response-body username extraction.
- `chrome.debugger` can access CDP and instrument network/DOM/JS, but requires the powerful `debugger` permission.
- Project decision: do not add `debugger` by default. Reconsider only with a separate adoption record and explicit privacy/security tradeoff.

### Dynamic DOM and flaky web behavior

- WEFix paper: https://arxiv.org/abs/2402.09745
- UI flaky tests paper: https://arxiv.org/abs/2103.02669
- MutationObserver: https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
- IntersectionObserver: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
- Research direction: modern web UI flakiness often comes from asynchronous waits, dynamic DOM changes, and nondeterministic client-side execution order.
- Project decision: DOM observations should be treated as diagnostic/fallback evidence, not as final truth when confirmed network evidence exists.

## Subagent synthesis

### Accuracy architect

- Confirmed network extraction was still too broad because recursive username extraction could promote usernames from unrelated response sections.
- DOM fallback should be bounded and evidence-ranked, not account-specific.
- Existing DOM-confirmed users must be reconciled when confirmed network evidence arrives later.
- Accuracy labels should be count-aware, not just source-aware.

### Runtime reviewer

- Background DevTools bridge state can go stale if DevTools closes, the tab reloads, or the content listener is absent.
- DevTools detection should be conservative: exact followers/following endpoint path is confirmed; broad GraphQL/friendships is candidate unless shape is recognized.
- Page-network bridge should filter early and stay quiet/passive unless explicitly enabled.
- Stored snapshots need bounded fields and truncation diagnostics for larger accounts.

### Debug UX designer

- Add a top-level trust gate before diff buckets: `확정 비교 가능`, `참고용 결과`, or `DevTools 재실행 필요`.
- Account-level helpers should show run freshness, saved profile, current profile, run id, and collection time.
- Candidate/excluded rows should point operators to `__igFollowerExplainUser("username")` instead of inviting manual interpretation.

### Research synthesizer

- The project direction is correct: DevTools first, page-network assist second, DOM preview/fallback last.
- The next high-value work is an evaluation matrix and fixtures, not more selector tweaks.
- Dogfood lessons should be kit-level: research-to-decision capture, evidence contracts, and repeated-regression eval loops.

## Implemented in this pass

- DevTools mode detection now treats only exact `/followers/` and `/following/` paths as confirmed list mode; broad `graphql`, `friendships`, `followers`, or `following` matches become active/candidate unless later explicitly recognized.
- DevTools and page-network username extraction now only accepts usernames discovered inside list-like containers such as `users`, `items`, `edges`, or `nodes`; arbitrary `username` fields outside list containers are ignored.
- When confirmed network evidence adds users, existing DOM-only confirmed users are demoted to candidates so stale DOM observations do not remain final compare truth.
- Background DevTools state now records port/content delivery separately, applies freshness checks, cleans up on disconnect/tab removal/navigation, and uses a hostname-based Instagram tab gate.
- The console decision card now starts with a trust gate and exposes `__igFollowerHelp()`.
- `__igFollowerExplainUser("username")` now reports saved/current profile, collection time, and run id to reduce stale-run debugging mistakes.

## Still recommended

- Add a pure local fixture for exact-network pass, DOM-overcount exclusion, one-sided DevTools, DevTools-connected-no-payload, recursive-payload false positive, and bounded fallback.
- Add evidence-ranked fallback promotion instead of alphabetical ordering.
- Persist compact `lastEvidence` or bounded recent evidence into session snapshots.
- Add truncation flags for large snapshot sections.
