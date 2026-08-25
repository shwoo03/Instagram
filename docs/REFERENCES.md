# References

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
