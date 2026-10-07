# Start here

Use this file when resuming work on the Instagram follower comparison extension.

## 1. Read the project docs

1. `AGENTS.md`
2. `docs/PROJECT_PROFILE.md`
3. `docs/SECURITY.md`
4. `docs/HANDOFF.md`
5. `docs/BACKLOG.md`
6. `docs/REFERENCES.md` if the task involves external APIs, Chrome docs, or copied ideas

Check the working directory, branch, HEAD, dirty files, and the latest handoff
entry before relying on historical notes. Preserve the existing partial
recollection/download and CI deferrals in `docs/BACKLOG.md`.

## 2. Confirm the task type

- Extension behavior change -> inspect the relevant callers and tests, starting with `main.js`, `background.js`, `debugger-capture.js`, `network-payload-parser.js`, `accuracy-engine.js`, and `manifest.json`.
- Popup/panel change -> inspect the shared account-list UI/contract, `run-context.js`, `session-retention.js`, and `docs/UI_QUALITY.md` as applicable.
- Collection reliability issue -> inspect `docs/HANDOFF.md`, `docs/BACKLOG.md`, and recent console output from the user.
- Privacy/permission change -> inspect `docs/SECURITY.md` before editing.
- Starter-kit feedback -> write sanitized notes under `dogfood/`, not project-specific bugs.

## 3. Validate locally

```bash
npm test
```

Focused syntax checks remain available:

```bash
node --check main.js
node --check background.js
node --check devtools.js
```

Manual Chrome validation still matters because DevTools and Instagram DOM
behavior cannot be proven with syntax checks alone.
Browser checks are optional and task-scoped; use `docs/ACCURACY_EVAL_PLAN.md`
for commands, time limits, and rerun conditions. Do not install dependencies or
launch a real-account browser solely to validate documentation changes.

## 4. Update continuity

When the request includes file changes, update `docs/HANDOFF.md` with:

- current state
- next smallest action
- changed files
- validation run and result
- blockers or unknowns
- anything that should move to `docs/PROJECT_PROFILE.md`, `docs/SECURITY.md`, or `docs/REFERENCES.md`

For a read-only request, return this information in chat instead of writing files.
Keep current product work and kit-refresh work distinct; do not truncate old
handoffs or treat their former next steps as new authorization.

## 5. Keep boundaries clear

- Project runtime bugs live in `docs/BACKLOG.md`.
- Stable project facts live in `docs/PROJECT_PROFILE.md`.
- Security and permissions live in `docs/SECURITY.md`.
- External references and adoption decisions live in `docs/REFERENCES.md`.
- Kit-level lessons live in `dogfood/`.
- Kit refresh history and selection live in `docs/PROJECT_PROFILE.md` and `docs/REFERENCES.md`. Use the recorded kit source for a fresh temporary comparison; never run a scaffold generator against this project.
