# AGENTS.md

This repository is a Chrome extension for comparing Instagram followers and following.
It is not an AI project starter kit.

## Project Goal

- Collect Instagram `followers` and `following` lists as reliably as possible.
- Compare the two sets and print Korean, readable results.
- Preserve partial results when collection is incomplete.
- Make collection reliability visible through diagnostics, counts, and warnings.

## Current Architecture

- `manifest.json` defines the Manifest V3 extension.
- `background.js` injects `main.js` into Instagram tabs and relays DevTools messages.
- `main.js` runs as an isolated content script (or in console paste mode), opens lists, scrolls modals, collects usernames, and prints/stores results. Follow actions remain disabled.
- `debugger-capture.js` provides run-scoped automatic capture when DevTools is not fresh; `network-payload-parser.js` and `accuracy-engine.js` define extraction and final evidence rules.
- `popup.html` and the DevTools panel expose progress, stop, search, and bounded account lists; `session-retention.js` manages session writes.
- `devtools.html` and `devtools.js` provide DevTools Network response capture when Chrome DevTools is open.
- `docs/PROJECT_PROFILE.md`, `docs/HANDOFF.md`, `docs/SECURITY.md`, and `docs/BACKLOG.md` hold project context and ongoing work.
- `docs/REFERENCES.md` records official docs and adoption decisions.
- `docs/LINKS.md` is the project-specific link index.
- `docs/PROFILE_CHECKLIST.md` records which starter-kit surfaces are applied or intentionally absent.

## Working Rules

- Keep this repo focused on the Instagram comparison extension.
- Do not reintroduce AI starter-kit scaffold assumptions unless the user explicitly asks.
- Prefer small, direct changes over broad rewrites.
- Preserve user-facing console output in Korean.
- Treat Instagram DOM and network behavior as unstable.
- Prefer fresh DevTools capture, otherwise run-scoped Debugger capture. Keep page-network and DOM evidence as assisted results and diagnostics.
- Never hide partial or unreliable results. Print reliability status and why a result may be incomplete.
- Keep DevTools Network capture optional. The extension must still produce DOM/XHR/fetch results without DevTools.
- Do not store secrets, cookies, auth headers, private message contents, or raw API payloads.
- Store only derived usernames, counts, timestamps, source mode, and diagnostics.
- Dogfood reports/backlog are for kit-level improvements only. Do not record this extension's project-specific bugs in `dogfood/`.

## Code Guidelines

- Keep `main.js` browser-console safe and defensive against Instagram DOM churn.
- Keep `background.js` as a thin relay between action clicks, DevTools, and the inspected tab.
- Keep `devtools.js` privacy-preserving: extract usernames, then discard raw response bodies.
- Avoid hard-coding brittle Instagram class names.
- Prefer semantic selectors, labels, hrefs, roles, and list diagnostics.
- When adding collection logic, include a clear failure reason and Korean console output.
- When adding bridge logic, include ready/status/retry behavior so users can tell whether DevTools capture is connected.

## Manual Validation

Primary validation command: `npm test`

This runs syntax checks and synthetic local fixtures without opening Chrome.
UI quality criteria live in `docs/UI_QUALITY.md`; scenario mapping and optional
browser command limits live in `docs/ACCURACY_EVAL_PLAN.md`.

Use these checks when the user asks for validation:

```bash
node --check main.js
node --check background.js
node --check devtools.js
node tools/walker-fixtures.mjs
node tools/compare-fixtures.mjs
```

Optional local e2e gate after `npm install`:

```bash
npm run e2e
```

If validation cannot be run, record why in `docs/HANDOFF.md`.

Manual browser check:

1. Reload the unpacked extension from `chrome://extensions`.
2. Reload the Instagram profile tab.
3. Close and reopen Chrome DevTools.
4. Open the extension popup and press **비교 시작**. DevTools is optional; an available automatic Debugger capture can run when it is closed.
5. Confirm the page console prints DevTools bridge status.
6. Open followers/following lists and confirm collection counts and partial warnings are readable.

## Accuracy-first Work Order

- Start with source status, not DOM tweaks: check DevTools, Page Network Bridge, DOM, expected counts, and overcount exclusions before changing selectors.
- Strict comparison uses exact DevTools or Debugger list evidence. Page-network and DOM belong to the separately labeled assisted preview; readiness alone is not exact evidence.
- `PAGE_NETWORK_AUTO_ASSIST_ENABLED` remains false. Missing DevTools may use run-scoped Debugger capture, not an instruction to enable page-network auto-assist.
- If no confirmed network payload exists, label results as preview/provisional and keep DOM-only overcount out of the final compare set.
- For suspected false positives, inspect `window.__igFollowerExplainUser("username")` before changing collection logic.

## Regression Guardrails from 2026-06-06 Debugging

- Never hard-code usernames to fix accuracy. If a user appears wrong, fix the evidence rule that classified them.
- Once DevTools or page-network confirmed payload exists for a list, new DOM-only usernames must not be promoted directly into the confirmed compare set.
- DOM-only usernames after network confirmation stay outside the strict comparison, even when collection is short of the expected UI count.
- Any bounded DOM fallback is assisted evidence only. Follow `accuracy-engine.js` for its limits; it must not fill strict-network result sets.
- If list end is confirmed (network pages exhausted + DOM stalled at the visible end) and the gap to the displayed count is small, do not promote DOM candidates. Treat the displayed count as likely including inactive accounts.
- Do not reset a list set after network payloads may already have populated it. Late resets can erase valid DevTools evidence.
- Keep page-network auto-assist off by default unless explicitly re-enabled and validated; unexpected `console.warn` output can create extension error-panel noise.
- Do not use `console.warn` for expected degraded states such as DevTools not yet connected. Use Korean `console.log` diagnostics and reserve warnings/errors for real failures.
- Before claiming a run is wrong, check final compare counts and status first: raw/provenance/candidates are diagnostics, not final diff truth.

## Research-backed Guardrails from 2026-06-07

- Treat `DevTools connected` as readiness only. Treat exact followers/following payload capture as evidence.
- Do not recursively trust every `username` in a JSON payload. Confirm only usernames found through known list-member containers or exact list endpoints; keep the rest candidate-only.
- When confirmed network evidence arrives after DOM collection, reconcile earlier DOM-only confirmed accounts before final compare.
- Prefer trust-gate output first: `확정 비교 가능`, `참고용 결과`, `부분 결과`, or `네트워크 수집 재실행 필요`.
- For repeated failures, record the research source, adoption/rejection decision, runtime change, and fixture/backlog item together. Research without a decision or regression case is incomplete.

## Session and change scope

- Start with `docs/PROJECT_PROFILE.md`, `docs/SECURITY.md`, `docs/HANDOFF.md`, and relevant `docs/REFERENCES.md`; check cwd, branch, HEAD, dirty files, and handoff freshness.
- Treat prior validation as dated evidence. Preserve user edits, existing HOLD/deferred work, and runtime privacy rules.
- For review-only requests, return findings and continuation in chat; do not edit a handoff merely to record a review.
- For kit refreshes, compare first and apply only the owner-selected scope. Recheck source/target revisions and relevant content before edits; stop on relevant drift. Record optional-surface decisions and rollback in `docs/REFERENCES.md`.
- Before non-trivial infrastructure changes, check official APIs or maintained libraries and existing project decisions. Record reuse/rejection and recheck conditions; inspect a meaningful reference or state why comparison is unavailable.
- Existing role files are advisory, not permission controls. Delegation follows the active session's authorization; it adds no authority for nested delegation, account actions, or file writes.
- Important changes use `docs/CHANGE_REVIEW.md`: finish the scoped work and normal checks, obtain a separate review of fixed file contents, verify findings, then let the owner select corrections. Missing review controls mean blocked/unreviewed, never automatic approval. This adds no worker, automatic repair, commit, or release authority.

## Communication

<!-- AI Project Kit refresh 2026-09-02 (kit ef3969d): block added by refresh; edit freely -->
- Assume the reader has general engineering literacy but no knowledge of this
  project's domain or of AI-agent internals, unless `docs/PROJECT_PROFILE.md`
  records a different reader.
- Put the conclusion in the first paragraph with zero undefined concept terms.
  Concrete identifiers such as file names and error codes are fine.
- Define each technical term in plain words at its first use; never use it
  before the definition.
- Start sentences from what the reader already knows; add one new piece at a
  time.
- Pair every abstract claim with one concrete number, file, or example.
- An explicit user instruction about format, length, or language overrides
  these rules.
- For explanations, reports, and proposals that outlive the chat turn, follow
  the `explain-for-humans` skill installed in `.claude/skills/` and
  `.agents/skills/`.
