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
- Why: it can read response bodies through `request.getContent()` without adding the high-risk `debugger` permission.
- Boundaries: extract usernames, discard raw bodies, relay only sanitized usernames and metadata.
- Status: adopted.

### Debugger permission

- Decision: do not add `debugger` permission by default.
- Why: it is powerful, user-visible, and unnecessary while the current workflow already asks the operator to keep DevTools open.
- Status: rejected by default; reconsider only with a specific adoption record.

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
- Use for: evaluating CDP-based capture as a possible future fallback.
- Decision: do not add by default because the permission is powerful and unnecessary while DevTools capture is operator-approved.
- Status: rejected by default.

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

### Minimum Chrome version

- URL: https://developer.chrome.com/docs/extensions/reference/manifest
- Use for: declaring the minimum Chrome version needed by the extension runtime.
- Decision: set `minimum_chrome_version` to `114` because the extension depends on MV3 scripting/storage.session-era APIs and service-worker Port lifetime behavior documented for modern Chrome. This is not a permission change.
- Status: adopted.
