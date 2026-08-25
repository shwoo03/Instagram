# Security

## Scope

This extension runs locally in Chrome and targets Instagram pages.
It should collect derived username lists and comparison diagnostics only.

## Data Handling

Allowed:

- Usernames.
- Counts.
- Collection mode: `followers` or `following`.
- Timestamps.
- Reliability warnings and diagnostics.

Not allowed:

- Passwords.
- Cookies.
- Auth headers.
- Access tokens.
- Raw API payload archives.
- Direct messages.
- Private profile contents beyond usernames visible to the logged-in user.

## DevTools Network Capture

DevTools capture is optional and must stay privacy-preserving:

- `devtools.js` may read response bodies through Chrome DevTools APIs.
- It should extract usernames and discard raw body text.
- It should log safe URL labels without query strings where possible.
- It should relay only derived username arrays and metadata to `main.js`.

## Automatic Debugger Capture

The local-only build intentionally adopts the powerful `debugger` permission:

- Attach only after the user starts a comparison and only when a fresh DevTools bridge is absent.
- Use CDP `Network` only; do not issue Instagram list requests or enable unrelated domains.
- Never attach to a target already owned by DevTools or another debugger.
- Bind evidence to tab, run ID, profile, and capture-session ID.
- Retrieve only bounded candidate response bodies, immediately extract derived usernames/pagination, and discard raw bodies.
- Never relay or store URLs with query strings, request/response headers, cookies, tokens, raw bodies, or DMs.
- Detach on completion, failure, navigation, tab close, or user/Chrome cancellation. Do not auto-reattach.

## Extension Permissions

Current permissions should stay minimal:

- `activeTab`
- `debugger` (local-only, run-scoped automatic capture)
- `scripting`
- `storage`

Avoid adding further high-risk permissions unless there is a clear adoption record:

- broad host permissions
- persistent storage of raw network data
- remote MCP/tool access
- hidden hooks or background automation

## Operator Safety

Instagram prints a self-XSS warning in the console. Treat it as expected when scripts are pasted or injected during local development.

Do not ask the operator to paste unknown third-party scripts into Instagram.

## Optional Surface Policy

Do not add hooks, MCP servers, skills, subagents, eval runtime, or worktree
automation for this extension by default. If one becomes necessary, document:

- owner
- purpose
- allowed operations
- data boundary
- validation command
- rollback path

## Storage Policy

Allowed runtime storage should be limited to derived result snapshots and
diagnostics. Do not persist raw DevTools response bodies, cookies, request
headers, auth state, private messages, or unrelated profile data.

Per-tab progress may contain only the four derived account-name lists used by
the UI: two relationship differences and followers/following candidates. Each
list is normalized, deduplicated, sorted, capped at 1,000 names, and sanitized
again in the background before `chrome.storage.session` storage. Profile links
are constructed from validated usernames on the fixed Instagram origin.

## E2E Test Build Boundary

The Puppeteer e2e harness may create a copied extension under `tools/e2e/.build/` with localhost-only `host_permissions` for synthetic fixture pages. That permission is test-build only and must not be added to the deployment `manifest.json`. The fixture uses only generated `e2e_user_###` usernames and must not copy real Instagram markup, cookies, headers, raw payloads, or account data.

## 2026-06-06 Privacy and Harness Notes

- Current extension permissions include `activeTab`, `scripting`, and `storage`; keep any future permission additions justified by a concrete collection/debugging need.
- DevTools capture and page-network bridge must continue to discard raw payloads after extracting derived usernames/counts/diagnostics.
- Auto-assist may enable page-network bridge when DevTools is not connected, but it must not store cookies, auth headers, full request headers, private messages, or raw API responses.
- Repo-local `.agents` skill/subagent files are allowed as non-runtime harness documentation. They must not become hidden automation that changes browser state or stores sensitive Instagram data.
