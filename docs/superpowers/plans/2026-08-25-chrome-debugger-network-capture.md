# Chrome Debugger Network Capture Implementation Plan

## Objective

Implement the approved local-only `chrome.debugger` Network capture path so a popup-started run can obtain strict followers/following evidence without opening DevTools, while preserving the existing DevTools handoff, assisted fallbacks, partial results, and privacy boundary.

## Baseline

- Branch: `main`
- Approved design: `docs/superpowers/specs/2026-08-25-chrome-debugger-network-capture-design.md`
- Current permissions: `activeTab`, `scripting`, `storage`
- Current minimum Chrome: `114`
- Current deterministic gate: `npm test`
- Current browser gate: six synthetic e2e scenarios pass, but Puppeteer CDP may conflict with real `chrome.debugger` attachment

## Work packages

### 1. Common response parser

Files:

- create `network-payload-parser.js`
- create `tools/network-payload-parser-fixtures.mjs`
- update `devtools.html`
- update `devtools.js`
- update `package.json`

Steps:

1. Move extension-context URL classification, body decoding, list-container walking, pagination extraction, and sanitized result construction into a pure frozen global.
2. Keep the MAIN-world page bridge walker separate.
3. Make DevTools use the parser without changing its evidence messages.
4. Cover exact followers/following, broad candidates, nested unrelated usernames, terminal pagination, base64, invalid JSON, MIME/status rejection, and size limits.

Gate:

```bash
node --check network-payload-parser.js
node --check devtools.js
node tools/network-payload-parser-fixtures.mjs
node tools/walker-fixtures.mjs
```

### 2. Debugger session controller

Files:

- create `debugger-capture.js`
- create `tools/debugger-capture-fixtures.mjs`
- update `background.js`
- update `manifest.json`
- update `package.json`

Steps:

1. Add `debugger` permission and raise the minimum Chrome version to 118.
2. Load the accuracy engine, common parser, and debugger controller in the service worker.
3. Implement per-tab attach, Network enable, pending request filtering, body retrieval, sanitized relay, 429 status relay, detach, and cleanup.
4. Attach before collector injection only when the current DevTools bridge is not fresh.
5. Add run/profile/session binding and reject unbound or stale evidence.
6. Never steal an attached target and never reattach after user cancellation.

Gate:

```bash
node --check debugger-capture.js
node --check background.js
node tools/debugger-capture-fixtures.mjs
```

### 3. Runtime evidence and handoff

Files:

- update `accuracy-engine.js`
- update `main.js`
- update `tools/accuracy-engine-fixtures.mjs`
- update `tools/compare-fixtures.mjs` if required

Steps:

1. Add debugger evidence codes and strict eligibility.
2. Add a debugger bridge with sanitized ready/status/usernames/detach messages.
3. Merge exact debugger provenance into strict sets and keep broad payloads candidate-only.
4. Bind after run initialization and detach in every `finally` path.
5. Preserve debugger evidence across DevTools handoff and reject post-run payloads.
6. Update canonical Korean trust and diagnostic output without using expected-state `console.warn`.

### 4. Popup and panel state

Files:

- update `popup.js`
- update `devtools-panel.js`
- update HTML/CSS only if a readable status cannot fit the current layout

Steps:

1. Add debugger readiness to sanitized progress records.
2. Render automatic capture, DevTools capture, stopped, busy, and fallback states.
3. Keep the current responsive layout and candidate/integrity display.
4. Explain the expected Chrome debugger banner without adding a consent gate.

### 5. Integration validation

Run:

```bash
npm test
npm run e2e
git diff --check
```

Add deterministic fixtures for parser privacy, session lifecycle, exact/candidate classification, one-sided evidence, detach, handoff, and late-message rejection. Do not claim a real debugger attach from mocks or Puppeteer alone.

### 6. Documentation

Files:

- update `docs/REFERENCES.md`
- update `docs/SECURITY.md`
- update `docs/BACKLOG.md`
- update `docs/HANDOFF.md`
- update `CHANGELOG.md`

Record the local-only adoption decision, permission warning, Chrome 118 requirement, data boundary, validation receipts, and remaining manual Chrome checks.

### 7. Real Chrome validation

After the user reloads the unpacked extension:

1. DevTools closed automatic exact capture.
2. DevTools already open skip path.
3. DevTools opened mid-run handoff.
4. Banner stop partial preservation.
5. Busy target fallback.
6. Normal completion, navigation, and tab-close detach.
7. Stored data privacy inspection.

## Commit boundaries

1. `docs: plan debugger network capture`
2. `feat: add shared Instagram network parser`
3. `feat: add automatic debugger network capture`
4. `feat: integrate debugger evidence and status UI`
5. `docs: record debugger capture adoption`

## Stop conditions

- Do not lower exact endpoint or list-container requirements to make a fixture pass.
- Do not add permissions beyond `debugger` or issue new Instagram list requests.
- Do not store or relay raw bodies, headers, cookies, tokens, query strings, or DMs.
- Do not steal another debugger's target or create an automatic reattach loop.
- Preserve partial results whenever capture or collection terminates early.
- Report mocked, Puppeteer, and real Chrome validation separately.
