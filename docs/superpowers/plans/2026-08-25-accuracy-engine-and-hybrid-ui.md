# Accuracy Engine and Hybrid UI Implementation Plan

## Objective

Implement the approved accuracy-first engine and then add a responsive popup plus DevTools diagnostics panel without weakening the current evidence ordering, partial-result preservation, privacy boundary, or follow-disabled default.

## Baseline

- Deployment branch: `main`
- Approved design: `docs/superpowers/specs/2026-08-25-accuracy-engine-and-hybrid-ui-design.md`
- Real Chrome baseline: DevTools 283/283, strict diff 0/0, integrity passed, two DOM-only follower candidates excluded
- Required static baseline: four runtime syntax checks, walker fixtures, compare fixtures
- Optional browser baseline: `npm run e2e` after dependencies are installed

## Work packages

### 1. Pure accuracy engine

Files:

- create `accuracy-engine.js`
- create `tools/accuracy-engine-fixtures.mjs`
- update `tools/compare-fixtures.mjs`

Steps:

1. Implement exact and abbreviated displayed-count parsing.
2. Implement conservative pagination-evidence extraction.
3. Implement canonical list completion and trust verdict functions.
4. Implement strict versus assisted set comparison and integrity checks.
5. Load the production engine through Node `vm` in fixtures.
6. Cover exact count, approximate count, pagination terminal/nonterminal, DOM-only, unsafe end reasons, and assisted mutual exclusion.

Gate:

```bash
node --check accuracy-engine.js
node tools/accuracy-engine-fixtures.mjs
node tools/compare-fixtures.mjs
```

### 2. Runtime evidence integration

Files:

- update `background.js`
- update `devtools.js`
- update `page-network-bridge.js`
- update `main.js`

Steps:

1. Inject `accuracy-engine.js` before `main.js`.
2. Extract sanitized pagination metadata in DevTools and remove raw URL relay.
3. Track pagination state per list and invalidate it on navigation/disconnect.
4. Replace displayed-count parsing with the pure engine result.
5. Replace small-gap completion and reliability calculation with the canonical engine.
6. Keep DOM fallback in assisted state and outside strict comparison/mutual counts.
7. Bind page-network messages to active run/profile/capability and keep page-network-only verdicts provisional.
8. Preserve post-run payload freeze and existing profile-change/exception persistence.

Gate:

```bash
node --check main.js
node --check background.js
node --check devtools.js
node --check page-network-bridge.js
node tools/walker-fixtures.mjs
node tools/accuracy-engine-fixtures.mjs
node tools/compare-fixtures.mjs
```

### 3. Sanitized progress protocol

Files:

- update `main.js`
- update `background.js`
- extend accuracy fixtures or add `tools/progress-fixtures.mjs`

Steps:

1. Define a compact `IG_RUN_PROGRESS` schema.
2. Emit immediate stage transitions and throttle scroll progress to at most one write per 750 ms.
3. Validate and store progress in `chrome.storage.session` by active tab/profile.
4. Clear or terminalize progress on success, partial completion, exception, supersede, and profile change.
5. Verify no username lists, raw URLs, row text, headers, or payload bodies enter progress storage.

### 4. Popup

Files:

- create `popup.html`
- create `popup.css`
- create `popup.js`
- update `manifest.json`
- update `background.js`

Steps:

1. Add `action.default_popup` and replace action-click execution with `IG_START_COLLECTION`.
2. Validate the active tab before injection.
3. Render idle, ready, running, confirmed, reference, partial, retry, and error states.
4. Show the always-visible local data notice without a consent gate.
5. Subscribe to session progress/result changes and recover state when reopened.
6. Explain that detailed diagnostics are available by opening DevTools and selecting `IG Comparator`.

### 5. DevTools diagnostics panel

Files:

- update `devtools.html`
- split or update `devtools.js` bootstrap as needed
- create `devtools-panel.html`
- create `devtools-panel.css`
- create `devtools-panel.js`

Steps:

1. Keep network capture active from the DevTools bootstrap.
2. Create the `IG Comparator` panel once.
3. Read session progress and final snapshots for the inspected tab.
4. Render canonical verdict, counts, pagination, sources, end reasons, warnings, and bounded timeline.
5. Add privacy-safe diagnostic copy with profile identifiers and usernames excluded.
6. Keep explicit username diagnosis behind a deliberate input/action.

### 6. Validation harness and UI QA

Files:

- update `package.json`
- update `tools/e2e/run.mjs`
- update `tools/e2e/fixture-server.mjs` if required
- add focused UI fixture files under `tools/ui-fixtures/` if required

Steps:

1. Add `npm test` for runtime syntax checks plus deterministic fixtures.
2. Remove the unconditional 429 pass and test the state machine with fake time.
3. Add `try/finally` cleanup and explicit fixture-tab identity in e2e.
4. Activate the virtual-recycle scenario.
5. Add navigation/disconnect, profile-change, post-run freeze, and passive-noise scenarios.
6. Assert no horizontal overflow or element overlap at popup widths 320/360/420 and panel widths 320/736/1024.
7. Exercise long Korean warnings, large counts, light appearance, and dark appearance.

Gate:

```bash
npm test
npm run e2e
git diff --check
```

`npm run e2e` may be reported as environment-blocked only when the exact dependency/browser failure is recorded; deterministic tests must still pass.

### 7. Real Chrome validation

1. Reload the unpacked extension.
2. Reload the Instagram profile tab.
3. Open DevTools and select `IG Comparator`.
4. Run from the popup and compare against the 283/283 baseline or the current displayed counts if account state changed.
5. Confirm canonical verdict equality across popup, panel, console, and stored snapshot.
6. Repeat with DevTools closed and confirm collection continues as `참고용 결과`.
7. Confirm post-run payloads do not mutate the saved result.
8. Confirm the extension-generated warn/error console count remains zero for expected degraded states.

### 8. Documentation and handoff

Files:

- update `README.md`
- update `START_HERE.md`
- update `docs/BACKLOG.md`
- update `docs/HANDOFF.md`
- update `docs/PROJECT_PROFILE.md`
- update `docs/PROFILE_CHECKLIST.md`
- update `docs/REFERENCES.md` only for adopted official-source decisions

Steps:

1. Replace stale non-git and auto-assist claims.
2. Remove duplicate backlog identifiers and close only verified items.
3. Document popup start flow, panel diagnostics, trust codes, and DOM-reference behavior.
4. Record exact static, fixture, e2e, and live-Chrome validation outcomes separately.

## Commit boundaries

Use small commits in this order:

1. `test: add deterministic accuracy engine fixtures`
2. `feat: harden Instagram evidence classification`
3. `feat: add sanitized collection progress`
4. `feat: add comparator popup`
5. `feat: add DevTools diagnostics panel`
6. `test: strengthen extension integration coverage`
7. `docs: align comparator workflow and validation`

Do not stage unrelated user changes. Recheck `git status --short` before every commit.

## Stop conditions

- Stop rather than lower trust when a payload shape cannot prove pagination semantics.
- Stop rather than add broader permissions to make capture easier.
- Stop and preserve partial state if Instagram profile or modal identity changes.
- Do not claim e2e or live validation from source/configuration evidence alone.
- Do not expose real usernames, profile identifiers, raw payloads, cookies, headers, or request queries in fixtures or reports.
