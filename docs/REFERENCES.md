# References

## Account lookup and result explanations — 2026-09-21

- Owner selection: “ㄱㄱ” after the recommendation to implement next items 1–3 (unified lookup, completion evidence cards, popup diagnostic copy). This is separate from the preceding progress/429 diagnostics bundle.
- Reuse decision: existing `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` and UI-only, run-bound stop-message pattern in `background.js`; no new API, permission, dependency, Instagram endpoint or network request. `main.js` queries its full strict/assisted/candidate collections, never the 1,000-name stored UI subsets. The shared `result-insights.js` contract and `result-insights-ui.js` presenter avoid divergent popup/panel rules.
- Accuracy decision: require the same run/profile, finished collector, non-cancelled state, final `CONFIRMED` verdict and a still-confirmed canonical assessment before relationship classification. Exact membership flags remain visible during partial runs, but absence cannot establish a one-sided relationship. No presence in either strict list means only “not observed”, not an account-existence claim. Reloaded/unavailable memory has no truncated-list fallback.
- Explanation decision: reuse `getListCompletionAssessment` / `accuracy-engine.js`; store only two small sanitized summaries (fixed state/reason codes, exact payload counts, count evidence and pending/failed counts). Existing records missing summaries show an explicit unavailable explanation; no data migration.
- Privacy decision: copy only selected counts, completion summaries, bounded diagnostics and a verdict code. Drop arbitrary warnings, event strings, profile, usernames, run ID and URLs, including older stored values. Explain included fields before copy. Search text and its one-account response remain transient UI/message data.
- Recheck when canonical completion states/reason codes, list storage limits or capture interfaces change. Local fixture evidence is not current Instagram compatibility proof. See `HANDOFF.md` for checks and the cumulative fixed review snapshot. Roll back only the selected hunks/new modules after checking drift; do not revert preceding progress diagnostics or existing kit documentation.

## Progress and failure diagnostics — 2026-09-21

- Owner selection: the owner replied “좋은뎅 ㄱㄱ” to the recommendation to implement research items 1–3. Item 4 (extension-action permission coverage and possible Puppeteer upgrade) remains deferred.
- [W3C ARIA progressbar](https://w3c.github.io/aria/#progressbar) and [aria-valuenow](https://w3c.github.io/aria/#aria-valuenow), read during the 2026-09-21 research (ARIA 1.3 editor draft): adopted indeterminate progress when the total is unknown; omit `aria-valuenow`, retain a Korean textual count, and distinguish `null` from a real zero end to end.
- Existing 60/120/240-second 429 waits remain the runtime policy. The UI uses the existing absolute pause deadline; it does not create requests, extend a pause when reopened, or enable recollection. Late 429 signals cannot replace cancelled/finished progress.
- `run-diagnostics.js` is a small shared sanitizer/presenter using existing JavaScript/Chrome session messaging. It accepts only two list modes, eight fixed failure categories, bounded counts and a numeric deadline; arbitrary keys/text are discarded. No external library or new permission is needed for these finite fields. Existing `schemaVersion: 1` records without diagnostics normalize to empty diagnostics; no migration or retained history is introduced.
- Failure codes and counts are additive to the existing completion guards. Exact/assisted membership and capture failure eligibility remain unchanged. A parse failure is not proof that Instagram changed its format.
- Verification and fixed review scope: latest `docs/HANDOFF.md` entry. Rollback only this task's runtime/test files and newly added documentation sections after checking for drift; preserve all pre-existing uncommitted kit edits. No dependency/manifest changes or commit.


Use this file for official docs, adoption decisions, and source provenance that
affect this Chrome extension.

## Official docs to check first

### Chrome Extensions

- URL: https://developer.chrome.com/docs/extensions/
- Use for: Manifest V3, extension permissions, service workers, messaging, and DevTools pages.
- Adoption mode: official-docs

### Chrome DevTools extension APIs

- URL: https://developer.chrome.com/docs/extensions/reference/api/devtools/network
- Use for: `chrome.devtools.network.onRequestFinished`, `chrome.devtools.network.onNavigated`, and `request.getContent()`.
- Adoption mode: official-docs

### Chrome extension messaging

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- Use for: `chrome.runtime.sendMessage`, `chrome.runtime.connect`, Ports, and tab relays.
- Adoption mode: official-docs

## Decisions

### DevTools Network capture

- Decision: use `chrome.devtools.network` when DevTools is open.
- Why: it can read response bodies through `request.getContent()` and remains the preferred path when DevTools is already open.
- Boundaries: extract usernames, discard raw bodies, relay only sanitized usernames and metadata.
- Status: adopted.

### Debugger permission

- Decision: adopt `debugger` for this local-only build after explicit operator approval.
- Why: it provides exact response-body evidence without requiring the operator to open DevTools. It is limited to a user-started run, skips busy targets, and detaches at every terminal boundary.
- Boundaries: Network domain only; bounded bodies; sanitized derived usernames/pagination only; no raw payload, headers, cookies, tokens, query strings, DMs, request generation, target stealing, or auto-reattach.
- Status: adopted on 2026-08-25; not a recommendation for public-store distribution.

## 2026-06-07 Accuracy Research Addendum

### MV3 service worker lifecycle

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Use for: background worker restart/idle behavior, stale global state risk, and storage guidance.
- Decision: DevTools bridge state must have freshness timestamps and disconnect cleanup; do not trust background globals indefinitely.
- Status: adopted.

### Content script isolated world and MAIN-world execution

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- URL: https://developer.chrome.com/docs/extensions/reference/scripting/
- Use for: deciding whether page request interception belongs in isolated `main.js` or MAIN-world `page-network-bridge.js`.
- Decision: page-network evidence must come from the MAIN-world bridge; isolated-world XHR/fetch hooks are not equivalent page traffic evidence.
- Status: adopted.

### chrome.storage.session

- URL: https://developer.chrome.com/docs/extensions/reference/api/storage
- Use for: sanitized run snapshots and bounded debug state.
- Decision: store only derived usernames, counts, timestamps, source labels, and diagnostics; keep raw response bodies and secrets out.
- Status: adopted.

### declarativeNetRequest

- URL: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- Use for: request blocking/modification capability review.
- Decision: do not adopt for username extraction because it is not a response-body extraction API.
- Status: rejected for this use case.

### chrome.debugger

- URL: https://developer.chrome.com/docs/extensions/reference/api/debugger
- Use for: run-scoped CDP Network response capture when the existing DevTools bridge is not fresh.
- Decision: adopt for the explicitly local-only workflow. Use protocol version 1.3, Chrome 118+, bounded Network buffers, exact endpoint/list-container trust gates, and explicit detach cleanup.
- Status: adopted on 2026-08-25 with deterministic fixtures; real Instagram Chrome validation remains pending.

### Web UI flakiness research

- URL: https://arxiv.org/abs/2402.09745
- URL: https://arxiv.org/abs/2103.02669
- Use for: repeated-regression thinking around async waits, dynamic DOM, and UI execution-order uncertainty.
- Decision: prefer explicit evidence contracts and fixtures over more blind retries or selector tweaks.
- Status: adopted as harness guidance.

### DOM observation APIs

- URL: https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
- URL: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
- Use for: virtualized-list diagnostics and scroll-completion signals.
- Decision: use DOM observation as diagnostic/fallback evidence; never let it override confirmed network evidence without bounded fallback rules. Runtime adopted on 2026-06-10 in R3 with `dom-observer` and `dom-observer-candidate` sources.
- Status: adopted.

## 2026-06-10 Collection Resilience Addendum

### 429 rate-limit backoff

- URL: https://www.getphyllo.com/post/navigating-instagram-api-rate-limit-errors-a-comprehensive-guide
- URL: https://github.com/instaloader/instaloader/issues/834
- URL: https://the-erone.com/http-error-429-instagram/
- Use for: deciding how the collector should react when Instagram returns HTTP 429 during list pagination.
- Decision: observe status code only, pause scrolling with 60s -> 120s -> 240s backoff, then partial-exit after repeated signals. Do not inspect error bodies, create retry requests, or add new permissions.
- Status: adopted.

### DevTools navigation reset

- URL: https://developer.chrome.com/docs/extensions/reference/api/devtools/network
- Use for: `chrome.devtools.network.onNavigated` and the limitation that DevTools misses requests made before DevTools was opened.
- Decision: reset per-page DevTools capture counters on navigation and relay `reason: "navigated"` so the page console can tell the operator to reopen followers/following lists.
- Status: adopted.

## 2026-06-11 Platform Stability Addendum

### Service worker state mirroring

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Use for: MV3 service worker shutdown/restart behavior and avoiding reliance on globals.
- Decision: mirror DevTools bridge tab state from the in-memory Map into `chrome.storage.session` and hydrate before content preflight reads. Existing freshness TTL still decides whether hydrated state is usable.
- Status: adopted.

### storage.session quota guard

- URL: https://developer.chrome.com/docs/extensions/reference/api/storage
- Use for: `chrome.storage.session` capacity limits and safe snapshot persistence.
- Decision: keep profile snapshots under a conservative per-snapshot budget, expose `storage.truncatedSections`, store lastRun as a `{ ref }` record, and retry once with a minimal derived snapshot on quota errors. Do not add `unlimitedStorage`.
- Status: adopted.

### Minimum Chrome version

- URL: https://developer.chrome.com/docs/extensions/reference/manifest
- Use for: declaring the minimum Chrome version needed by the extension runtime.
- Decision: set `minimum_chrome_version` to `114` because the extension depends on MV3 scripting/storage.session-era APIs and service-worker Port lifetime behavior documented for modern Chrome. This is not a permission change.
- Status: adopted.

### Puppeteer extension e2e harness

- URL: https://developer.chrome.com/docs/extensions/how-to/test/puppeteer
- Use for: loading an unpacked extension in Chrome during local development tests.
- Decision: adopt `puppeteer` as a devDependency only. The e2e test build copies runtime files into `tools/e2e/.build/` and adds localhost `host_permissions` only to that copied manifest; deployment manifest permissions remain unchanged.
- Status: adopted as local harness; current environment still needs a successful `npm run e2e` run.

## 2026-09-05 Capture completion and live result context

- [Chrome network events](https://chromedevtools.github.io/devtools-protocol/tot/Network/): adopted separate pending response, body-read and delivery acknowledgement tracking in `debugger-capture.js`; request timing accompanies derived evidence so delayed earlier responses cannot replace later pagination state. Covered by `tools/debugger-capture-fixtures.mjs` and `tools/accuracy-engine-fixtures.mjs`.
- [Puppeteer extension testing](https://pptr.dev/guides/chrome-extensions): adopted a separate `npm run e2e:capture` gate using the actual popup button handler, debugger controller, parser and relay. Only test-copy origin gates accept the loopback fixture. Puppeteer does not attach to the fixture tab, since that correctly triggers the production busy-target guard. This tests neither a real Instagram response shape nor the browser's physical-click permission grant.
- [Chrome service-worker termination testing](https://developer.chrome.com/docs/extensions/how-to/test/test-serviceworker-termination-with-puppeteer): adopted `WebWorker.close()` in the local capture gate, followed by a popup start that wakes the worker and explicit debugger detachment.
- [Chrome navigation events](https://developer.chrome.com/docs/extensions/reference/api/webNavigation): same-document history changes require distinct handling. Chosen implementation uses existing tab events plus a collector context reply; it adds no `webNavigation` permission. The real loopback capture gate exposed `loading` notifications during modal history changes. Regression: `tools/navigation-fixtures.mjs`.
- [Structured clone messaging, April 22, 2026](https://developer.chrome.com/blog/structured-clone-messaging): deferred. Current bounded username/count/reason-code messages do not require new serialization types or a higher Chrome minimum.
