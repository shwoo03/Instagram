# Account Name Lists UI Implementation Plan

## Objective

Implement the approved `계정 상세` disclosures in the popup and DevTools panel while keeping strict, assisted, partial, and candidate evidence visibly separated.

## Baseline

- Approved design: `docs/superpowers/specs/2026-08-25-account-name-lists-ui-design.md`
- Current extension version: 1.3.0
- Current deterministic gate: `npm test`
- Current browser gate: six `npm run e2e` scenarios
- Worktree is clean after design commit `19d79d4`

## Work Packages

### 1. Bounded account-list contract

Files:

- create `account-list-contract.js`
- create `tools/account-list-contract-fixtures.mjs`
- update `background.js`
- update `main.js`
- update `package.json`

Steps:

1. Add a frozen pure helper for username validation, normalization, sorting, deduplication, 1,000-item caps, truncation flags, relationship-set validation, and fixed Instagram profile URLs.
2. Emit an `accounts` object only when a comparison result exists.
3. Select strict diffs for confirmed results, assisted preview diffs for reference-only results, and preserved strict/partial diffs otherwise.
4. Keep follower and following candidates separate.
5. Sanitize the entire accounts object again in the background before session storage.

Gate:

```bash
node --check account-list-contract.js
node --check main.js
node --check background.js
node tools/account-list-contract-fixtures.mjs
```

### 2. Shared disclosure renderer

Files:

- create `account-list-ui.js`
- create `tools/account-list-ui-fixtures.mjs`
- update `popup.html`
- update `devtools-panel.html`
- update `package.json`

Steps:

1. Build a frozen view-model helper and DOM renderer shared by the popup and panel.
2. Render three native collapsed disclosures with candidate subgroups.
3. Reveal 20 usernames initially and 20 more per button activation.
4. Construct safe fixed-origin links using DOM properties and `textContent` only.
5. Render empty, reference, partial, and truncated states explicitly.

Gate:

```bash
node --check account-list-ui.js
node tools/account-list-ui-fixtures.mjs
```

### 3. Popup integration

Files:

- update `popup.html`
- update `popup.js`
- update `popup.css`

Steps:

1. Add the `계정 상세` section below the numeric result cards.
2. Normalize the sanitized account contract with backward-compatible missing-data behavior.
3. Render only after a result record contains an accounts object.
4. Keep one-column disclosures at all popup widths.

### 4. DevTools panel integration

Files:

- update `devtools-panel.html`
- update `devtools-panel.js`
- update `devtools-panel.css`

Steps:

1. Add the same account-detail section below strict comparison.
2. Reuse the same renderer and labels.
3. Allow opened relationship lists to use two columns at wide panel widths.

### 5. Test build and validation

Files:

- update `tools/e2e/build-test-extension.mjs`

Run:

```bash
npm test
npm run e2e
git diff --check
```

Then render synthetic confirmed, reference, partial, empty, candidate, and truncated records at popup 320/360/420 and panel 320/736/1024. Assert no horizontal overflow and visually inspect narrow screenshots.

### 6. Documentation and commits

Files:

- update `README.md`
- update `CHANGELOG.md`
- update `docs/HANDOFF.md`
- update `docs/BACKLOG.md`

Commit boundaries:

1. `docs: plan account name lists UI`
2. `feat: add bounded account list contract`
3. `feat: show account names in popup and panel`
4. `docs: record account list UI validation`

## Stop Conditions

- Do not expose full follower/following lists in per-tab progress state.
- Do not merge candidates into relationship mismatch lists.
- Do not construct links from unvalidated values or inject usernames through HTML strings.
- Do not add permissions, remote profile requests, bulk actions, or follow/unfollow controls.
- Do not claim live Instagram correctness from synthetic fixtures.
