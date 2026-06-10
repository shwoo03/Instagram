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
- `main.js` runs in the Instagram page context, opens lists, scrolls modals, collects usernames, follows visible accounts when requested by the flow, and prints/stores results.
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
- Prefer layered collection: DevTools Network capture, page XHR/fetch hooks, DOM collection, then diagnostics.
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

Use these checks when the user asks for validation:

```bash
node --check main.js
node --check background.js
node --check devtools.js
node tools/walker-fixtures.mjs
node tools/compare-fixtures.mjs
```

If validation cannot be run, record why in `docs/HANDOFF.md`.

Manual browser check:

1. Reload the unpacked extension from `chrome://extensions`.
2. Reload the Instagram profile tab.
3. Close and reopen Chrome DevTools.
4. Click the extension action to inject `main.js`.
5. Confirm the page console prints DevTools bridge status.
6. Open followers/following lists and confirm collection counts and partial warnings are readable.

## Accuracy-first Work Order

- Start with source status, not DOM tweaks: check DevTools, Page Network Bridge, DOM, expected counts, and overcount exclusions before changing selectors.
- Prefer confidence in this order: `DEVTOOLS_ASSISTED`, `PAGE_NETWORK_ASSISTED`, then `DOM_PREVIEW`.
- If DevTools is missing, the runtime may auto-enable the page-network bridge. Treat that as assisted evidence, not the same confidence level as DevTools Network capture.
- If no confirmed network payload exists, label results as preview/provisional and keep DOM-only overcount out of the final compare set.
- For suspected false positives, inspect `window.__igFollowerExplainUser("username")` before changing collection logic.

## Regression Guardrails from 2026-06-06 Debugging

- Never hard-code usernames to fix accuracy. If a user appears wrong, fix the evidence rule that classified them.
- Once DevTools or page-network confirmed payload exists for a list, new DOM-only usernames must not be promoted directly into the confirmed compare set.
- DOM-only usernames after network confirmation should stay as `dom-candidate` unless confirmed collection is short of the expected UI count.
- If confirmed collection is short, promote DOM candidates only as a bounded fallback up to the missing expected-count gap, and label the source as fallback evidence.
- Do not reset a list set after network payloads may already have populated it. Late resets can erase valid DevTools evidence.
- Keep page-network auto-assist off by default unless explicitly re-enabled and validated; unexpected `console.warn` output can create extension error-panel noise.
- Do not use `console.warn` for expected degraded states such as DevTools not yet connected. Use Korean `console.log` diagnostics and reserve warnings/errors for real failures.
- Before claiming a run is wrong, check final compare counts and status first: raw/provenance/candidates are diagnostics, not final diff truth.

## Research-backed Guardrails from 2026-06-07

- Treat `DevTools connected` as readiness only. Treat exact followers/following payload capture as evidence.
- Do not recursively trust every `username` in a JSON payload. Confirm only usernames found through known list-member containers or exact list endpoints; keep the rest candidate-only.
- When confirmed network evidence arrives after DOM collection, reconcile earlier DOM-only confirmed accounts before final compare.
- Prefer trust-gate output first: `확정 비교 가능`, `참고용 결과`, or `DevTools 재실행 필요`.
- For repeated failures, record the research source, adoption/rejection decision, runtime change, and fixture/backlog item together. Research without a decision or regression case is incomplete.
