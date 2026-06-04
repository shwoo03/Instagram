# Start here

Use this file when resuming work on the Instagram follower comparison extension.

## 1. Read the project docs

1. `AGENTS.md`
2. `docs/PROJECT_PROFILE.md`
3. `docs/SECURITY.md`
4. `docs/HANDOFF.md`
5. `docs/BACKLOG.md`
6. `docs/REFERENCES.md` if the task involves external APIs, Chrome docs, or copied ideas

## 2. Confirm the task type

- Extension behavior change -> inspect `main.js`, `background.js`, `devtools.js`, and `manifest.json`.
- Collection reliability issue -> inspect `docs/HANDOFF.md`, `docs/BACKLOG.md`, and recent console output from the user.
- Privacy/permission change -> inspect `docs/SECURITY.md` before editing.
- Starter-kit feedback -> write sanitized notes under `dogfood/`, not project-specific bugs.

## 3. Validate locally

```bash
node --check main.js
node --check background.js
node --check devtools.js
```

Manual Chrome validation still matters because DevTools and Instagram DOM
behavior cannot be proven with syntax checks alone.

## 4. Update continuity

Before stopping work, update `docs/HANDOFF.md` with:

- current state
- next smallest action
- changed files
- validation run and result
- blockers or unknowns
- anything that should move to `docs/PROJECT_PROFILE.md`, `docs/SECURITY.md`, or `docs/REFERENCES.md`

## 5. Keep boundaries clear

- Project runtime bugs live in `docs/BACKLOG.md`.
- Stable project facts live in `docs/PROJECT_PROFILE.md`.
- Security and permissions live in `docs/SECURITY.md`.
- External references and adoption decisions live in `docs/REFERENCES.md`.
- Kit-level lessons live in `dogfood/`.
