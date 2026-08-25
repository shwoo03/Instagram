# Chrome Debugger Network Capture Design

## Status

- Date: 2026-08-25
- Decision: approved direction; pending written-spec review
- Distribution: local unpacked extension only
- Primary goal: collect exact Instagram followers/following responses without requiring the user to open DevTools

## Problem

The extension can currently produce confirmed comparisons when Chrome DevTools is open and exact followers/following responses are captured. Without DevTools, it falls back to the MAIN-world page-network bridge and DOM collection, which remain assisted or preview evidence.

The local-only workflow should remove the manual DevTools requirement without weakening the existing evidence contract, persisting raw private data, issuing duplicate Instagram requests, or hiding partial results.

## Goals

1. Capture exact followers/following response bodies after the user presses `비교 시작`, even when DevTools is closed.
2. Treat validated debugger payloads as strict CDP evidence equivalent to validated DevTools payloads.
3. Preserve the existing DevTools path and hand off to it when the user opens DevTools.
4. Keep page-network and DOM collection as lower-confidence fallbacks.
5. Attach only to the active Instagram tab for the duration of one user-started run.
6. Parse and discard response bodies without storing cookies, headers, query strings, tokens, or raw payloads.
7. Preserve partial results and print a Korean reason whenever debugger capture is unavailable or interrupted.

## Non-goals

- Hiding Chrome's debugger warning bar.
- Attaching persistently or in the background outside a user-started comparison.
- Opening Chrome DevTools automatically.
- Calling Instagram private endpoints directly or replaying captured requests.
- Enabling the CDP `Fetch` interception domain.
- Adding `webRequest`, `declarativeNetRequest`, broad host, native-messaging, or unlimited-storage permissions.
- Replacing the current candidate isolation, bounded fallback, or compare-integrity rules.
- Importing Instagram information-download files.

## Chosen approach

Use `chrome.debugger` as an automatic exact-response transport when the current DevTools bridge is not already active. Enable only the CDP `Network` domain, observe requests that Instagram itself makes, extract derived list evidence, and detach at the end of the run.

The fallback order is:

1. Existing DevTools Network capture when its bridge is already fresh.
2. `chrome.debugger` Network capture when DevTools is closed.
3. Existing bound MAIN-world page-network bridge.
4. DOM preview and diagnostics.

`chrome.webRequest` and `declarativeNetRequest` are excluded because they do not provide response bodies. A static `document_start` page hook is deferred because it would add persistent Instagram host access while remaining less reliable than CDP capture.

## Architecture

### `network-payload-parser.js`

Add one browser-safe classic script with no Chrome API, DOM, storage, or timer dependencies. It owns:

- Instagram hostname and endpoint classification;
- fixed safe endpoint labels without query strings;
- response status, MIME, and body-size gates;
- base64 decoding;
- JSON parsing;
- the list-container username walker;
- pagination extraction through `IGAccuracyEngine`;
- exact-versus-candidate classification.

The parser returns only a sanitized result containing mode, endpoint label, status, MIME, usernames, pagination facts, confidence, and a bounded failure reason. It never returns raw headers, cookies, query strings, request bodies, or response bodies.

`devtools.js` and the new debugger capture path use this parser. The MAIN-world bridge keeps its separately scoped walker because loading the extension parser into the page world would let page code modify the extension's strict parser. Existing byte-equivalence fixtures continue protecting the page bridge walker where applicable.

### `debugger-capture.js`

Add a service-worker helper responsible only for:

- `chrome.debugger.attach` and `detach`;
- `Network.enable` and `Network.disable`;
- top-level `onEvent` and `onDetach` listeners;
- a bounded per-tab pending-request map;
- `responseReceived`, `loadingFinished`, `loadingFailed`, and 429 handling;
- `Network.getResponseBody` after a matching request finishes;
- session cleanup and sanitized status callbacks.

It does not own comparison policy, UI rendering, storage snapshots, or DOM behavior.

### `background.js`

Extend the current relay with one debugger session per tab. Each session contains only:

- `tabId`;
- random `captureSessionId`;
- bound `runId` and profile;
- attach and activity timestamps;
- connection state and bounded counters;
- sanitized last error/reason.

Before injecting the collector, the background verifies the current HTTPS Instagram tab. If a fresh DevTools bridge exists, it skips debugger attachment. Otherwise it attaches with CDP `1.3`, enables Network with a 2,097,152-byte total buffer and 524,288-byte per-resource buffer, and then injects the existing collector so the first list request can be observed.

### `main.js`

Add a debugger bridge alongside the existing DevTools bridge. It:

- binds the active `runId`, profile, and `captureSessionId`;
- accepts only schema-valid messages matching all three values;
- records `Debugger` or `Debugger-candidate` provenance;
- merges exact debugger and DevTools evidence without duplicating usernames;
- rejects late payloads after run completion;
- requests detach from `finally`, including partial and error exits;
- reports connection, handoff, detach, and fallback states in Korean.

### `accuracy-engine.js`

Extend evidence classification with:

- `DEBUGGER_EXACT`;
- `DEBUGGER_CANDIDATES_ONLY`;
- `DEBUGGER_CONNECTED_NO_PAYLOAD`;
- `DEBUGGER_DETACHED`.

`DEBUGGER_EXACT` and `DEVTOOLS_EXACT` are strict CDP evidence. Page-network remains assisted and DOM remains preview evidence. Both followers and following still require safe completion and passed compare integrity before the canonical verdict becomes `CONFIRMED`.

## Runtime data flow

1. The popup sends `IG_START_COLLECTION` with the active tab ID.
2. The background re-reads the tab and rejects non-Instagram or non-HTTPS targets.
3. If DevTools is already fresh, collection starts with the current DevTools path.
4. Otherwise the background creates a capture session, attaches with the stable CDP protocol, and enables Network with bounded buffers.
5. After Network is ready, the background injects the page bridge, accuracy engine, and collector.
6. `main.js` creates its run ID/profile and sends `IG_DEBUGGER_BIND`. The background returns the current `captureSessionId` only when the sender tab and active session match, then stores the run/profile binding. No debugger evidence is relayed before this handshake succeeds.
7. The collector opens and scrolls the two lists as it does today.
8. `responseReceived` keeps only matching Instagram XHR/Fetch metadata in memory. Unknown hosts, media, scripts, non-JSON MIME types, and unrelated endpoints are discarded before body access.
9. A 429 response is relayed to the existing rate-limit flow without reading its body.
10. `loadingFinished` triggers `Network.getResponseBody` for a retained request ID.
11. The parser extracts usernames and pagination, then the raw body becomes unreachable immediately.
12. The background relays a sanitized, session-bound evidence message to `main.js`.
13. `main.js` updates confirmed/candidate sets and the canonical verdict.
14. Every terminal path sends a stop request; the background disables Network, detaches, clears pending metadata, and records only sanitized completion state.

## Evidence contract

Debugger evidence is strict only when all of the following are true:

- the response came from an HTTPS Instagram hostname;
- the status is successful;
- the endpoint is exactly classified as followers or following;
- the body is valid JSON within the size limit;
- usernames occur in recognized list-member containers such as `users`, `items`, `edges`, or `nodes`;
- the message matches the active capture session, run, and profile.

Broad GraphQL/friendships matches, unrecognized shapes, and active-mode responses remain candidates. Candidate evidence never enters the strict final difference solely to make counts match.

The strict source order is expressed as two equivalent CDP transports followed by lower tiers:

```text
DEVTOOLS_EXACT | DEBUGGER_EXACT
PAGE_NETWORK_ASSISTED
DOM_PREVIEW
```

## DevTools coexistence and handoff

- If the current DevTools bridge is fresh at start, debugger attachment is skipped.
- If `chrome.debugger.getTargets()` shows an attached target without the extension's own session, the extension does not detach or steal it. It reports `DEBUGGER_BUSY` and continues with available fallbacks.
- Opening DevTools on an attached tab causes debugger detachment. The extension waits up to three seconds for the existing DevTools bridge and then uses it for later pages.
- Evidence captured before handoff remains valid and is deduplicated with later DevTools evidence.
- `canceled_by_user` cannot reliably distinguish the user stopping the warning bar from DevTools opening. The runtime therefore reports a neutral detach reason first and determines handoff from subsequent DevTools bridge readiness.
- No automatic reattach loop runs after a user cancellation.

## Failure handling

Expected degraded states use `console.log` and UI status, not extension-error warnings.

- Attach rejected or target busy: continue with DevTools/page-network/DOM evidence.
- `Network.enable` failure: detach immediately and continue with fallbacks.
- Body missing, evicted, oversized, invalid base64, or invalid JSON: record a bounded failure counter; do not create evidence.
- `loadingFailed`: remove pending metadata and record the sanitized network reason.
- 429: use the existing 60/120/240-second pause and partial-exit policy.
- DevTools opened or warning bar stopped: preserve collected evidence, attempt passive DevTools handoff, otherwise continue as partial/assisted.
- Tab close, navigation away from Instagram, profile change, superseded run, extension reload, or normal completion: detach and clear the session.
- One-sided exact evidence: do not report a confirmed comparison.
- Late or mismatched evidence: reject and count it without changing sets.

## Permission and version changes

Update deployment `manifest.json` to:

- add required permission `debugger`;
- raise `minimum_chrome_version` from `114` to `118`.

The debugger permission cannot be optional and Chrome displays its debugger/backend and all-sites warning. Runtime code narrows actual use to the active Instagram tab, but it does not claim that this changes the manifest-level capability.

Chrome 118 is required because active `chrome.debugger` sessions keep the Manifest V3 service worker alive from that version onward.

## UI changes

The popup and DevTools panel reuse their current responsive layouts. Add source states without adding a new screen:

- `자동 네트워크 수집 연결됨`;
- `DevTools 네트워크 수집 사용 중`;
- `자동 네트워크 수집 중단됨`;
- `다른 디버거가 탭을 사용 중`;
- `참고용 수집으로 계속 진행`.

The popup explains that Chrome's debugger notice is expected during automatic exact capture and that collection stops if the user ends that session. It does not imply that the warning can be hidden or that DevTools will open automatically.

## Privacy and resource limits

- Enable only the CDP Network domain.
- Inspect only Instagram HTTPS XHR/Fetch responses matching narrow candidate paths.
- Do not request cookies, headers, post data, runtime evaluation, DOM snapshots, or storage through CDP.
- Keep at most 128 pending request records per tab and discard any record older than 30 seconds.
- Keep decoded body limits at the current 512,000-character policy and configure the CDP buffers to 2,097,152 bytes total and 524,288 bytes per resource.
- Do not persist raw bodies, query strings, headers, cookies, tokens, private messages, or unrelated profile data.
- Store only derived usernames, counts, timestamps, fixed source labels, pagination facts, and sanitized diagnostics.

## Validation

### Static and fixture validation

- `node --check main.js`
- `node --check background.js`
- `node --check devtools.js`
- `node --check debugger-capture.js`
- `node --check network-payload-parser.js`
- `node tools/walker-fixtures.mjs`
- `node tools/compare-fixtures.mjs`
- `node tools/accuracy-engine-fixtures.mjs`
- new parser fixtures for exact endpoints, broad candidates, unrelated recursive usernames, pagination, base64, oversized bodies, and invalid JSON;
- new session fixtures for attach, enable failure, busy targets, stale bindings, duplicate events, `loadingFailed`, detach, and cleanup;
- new accuracy fixtures for debugger exact, one-sided exact, candidate-only, connected-no-payload, debugger-to-DevTools handoff, and partial detach.

### Browser validation

After reloading the unpacked extension:

1. DevTools closed: automatic debugger capture reaches exact followers and following evidence.
2. DevTools already open: debugger is skipped and existing capture remains exact.
3. DevTools opened mid-run: debugger detaches and evidence continues through DevTools.
4. Debugger warning stopped mid-run: partial evidence is preserved and no reattach loop appears.
5. Target busy with another debugger: no target is stolen and fallbacks remain usable.
6. Tab navigation, tab close, profile change, superseded run, and normal completion all detach.
7. A run longer than 30 seconds remains connected on Chrome 118 or later.
8. 429, body failure, and late payload paths preserve existing safety behavior.
9. Stored session data contains no raw body, header, cookie, query string, or token.
10. Popup and panel remain readable at their existing narrow-width gates.

The Puppeteer harness also uses CDP and may conflict with `chrome.debugger`. Unit and synthetic tests validate logic, but at least the attach, warning-bar, busy-target, and DevTools-handoff cases require a normal Chrome manual run before claiming end-to-end success.

## Documentation updates during implementation

- `docs/REFERENCES.md`: replace the prior debugger rejection with this local-only adoption record and official Chrome/CDP sources.
- `docs/SECURITY.md`: document the required permission, warning bar, narrow runtime scope, and raw-data prohibition.
- `docs/HANDOFF.md`: record implemented files, test receipts, manual validation status, and remaining blockers.
- `docs/BACKLOG.md`: add or close debugger capture, handoff, and manual Chrome validation items.
- `CHANGELOG.md`: record the new automatic exact-capture mode and Chrome 118 minimum.

## Rollback

Rollback is a single feature removal:

1. remove the debugger permission and restore the previous minimum Chrome version if no other feature needs 118;
2. remove debugger session/parser modules and message handling;
3. restore DevTools exact > page-network assisted > DOM preview as the only evidence chain;
4. keep existing stored snapshots readable by treating unknown debugger source labels as diagnostics only.

The rollback does not require deleting user result data or changing the strict set format.

## Acceptance criteria

- A DevTools-closed, user-started run can capture exact followers and following responses through `chrome.debugger` and produce the same strict result as the existing DevTools path.
- The extension never attaches outside the selected Instagram tab or outside an active user-started run.
- DevTools coexistence, user cancellation, and all terminal paths detach safely without losing already-derived evidence.
- Debugger candidate evidence remains outside strict differences.
- No raw response, headers, cookies, query parameters, tokens, or DMs appear in messages, logs, storage, or diagnostic copy output.
- Existing DevTools, page-network, DOM, partial-result, compare-integrity, and responsive UI behavior continue to pass their regression checks.
