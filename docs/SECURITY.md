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

## Extension Permissions

Current permissions should stay minimal:

- `activeTab`
- `scripting`

Avoid adding high-risk permissions unless there is a clear adoption record:

- `debugger`
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

## 2026-06-06 Privacy and Harness Notes

- Current extension permissions include `activeTab`, `scripting`, and `storage`; keep any future permission additions justified by a concrete collection/debugging need.
- DevTools capture and page-network bridge must continue to discard raw payloads after extracting derived usernames/counts/diagnostics.
- Auto-assist may enable page-network bridge when DevTools is not connected, but it must not store cookies, auth headers, full request headers, private messages, or raw API responses.
- Repo-local `.agents` skill/subagent files are allowed as non-runtime harness documentation. They must not become hidden automation that changes browser state or stores sensitive Instagram data.
