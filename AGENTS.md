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
```

If validation cannot be run, record why in `docs/HANDOFF.md`.

Manual browser check:

1. Reload the unpacked extension from `chrome://extensions`.
2. Reload the Instagram profile tab.
3. Close and reopen Chrome DevTools.
4. Click the extension action to inject `main.js`.
5. Confirm the page console prints DevTools bridge status.
6. Open followers/following lists and confirm collection counts and partial warnings are readable.
