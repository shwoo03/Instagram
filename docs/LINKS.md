# Links

Project-specific official links and references.

## Chrome extension docs

- Chrome Extensions
  - https://developer.chrome.com/docs/extensions/
  - Use for: Manifest V3 extension behavior and permissions.

- DevTools Network API
  - https://developer.chrome.com/docs/extensions/reference/api/devtools/network
  - Use for: response-body access from DevTools extension pages.

- Extension messaging
  - https://developer.chrome.com/docs/extensions/develop/concepts/messaging
  - Use for: one-time messages, long-lived Ports, and relay behavior.

- Scripting API
  - https://developer.chrome.com/docs/extensions/reference/api/scripting
  - Use for: injecting `main.js` into the active Instagram tab.

## Project docs

- `AGENTS.md`: canonical agent instructions.
- `docs/PROJECT_PROFILE.md`: stable project context.
- `docs/HANDOFF.md`: current state and next action.
- `docs/SECURITY.md`: privacy and permissions.
- `docs/BACKLOG.md`: extension-specific work.
- `docs/REFERENCES.md`: adoption decisions and source provenance.

## Additional adopted Chrome APIs

These official pages were opened on 2026-09-19 during the refresh. This confirms
the references, not a live test of the extension or every statement on a page.

- [Debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger): existing run-scoped local capture and permission reference.
- [Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage): session storage and lifecycle reference.
- [Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle): background restart/state assumptions.
- [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts): isolated and page execution context reference.

## Project Kit reference

The local source is `/Users/shwoo/mydir/AI_architecture`; read its `START_HERE.md`
and `recipes/refresh-applied-project.md` before another refresh. The comparison
commit, uncommitted-source hashes, selected changes, and rollback are recorded
in `REFERENCES.md`. This path is a maintenance reference, not a runtime or startup
dependency. Do not replace this project's `START_HERE.md` with the kit entrypoint.
