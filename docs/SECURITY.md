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
- 2026-09-24: 4xx responses on candidate list URLs (and `status: "fail"` 2xx bodies) are read only to classify a fixed warning code (`network-payload-parser.js` `BLOCK_CODES`); the body, message text and URL are discarded. Only the code, HTTP status and existing binding fields are relayed. The same rule applies to `devtools.js`.

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

The 2026-09-21 lookup sends one normalized username through extension-UI-only
messages bound to the displayed tab/run/profile. It queries existing collector
memory without making network requests or storing search history. Responses
contain only the same binding and per-list exact/observed booleans plus a fixed
relationship category. Stale or unavailable memory cannot fall back to treating
absence in truncated storage as proof. Relationship classification additionally
requires a finished, non-cancelled, canonically confirmed run.

Additive progress `completion` contains two bounded list summaries: fixed
completion/reason codes, expected/confirmed counts, exact payload counts and
pending/failed counts. `result-insights.js` sanitizes them at collection, relay
and UI boundaries. Popup/panel diagnostic copy explicitly selects counts,
completion, existing bounded diagnostics and a verdict code; it excludes all
usernames, profile/run identifiers, URLs, free-form warnings/events and raw
payloads. Copy scope is described in the UI before copying. No permission,
persistent storage, full-list transfer or account action is added.

The 2026-09-21 progress diagnostics add only an existing 429 pause's numeric
deadline/count and per-list pending/failure counts. Failure keys are restricted
to eight fixed categories in `run-diagnostics.js`; the background and both UIs
sanitize again. Diagnostic copy includes those derived fields, without raw
bodies, URLs, headers, arbitrary exception strings or usernames in the new
diagnostics object. Existing account-list storage remains separately governed
below. This adds no permissions, requests or persistent storage.

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

- Historical permissions were `activeTab`, `scripting`, and `storage`. The later local-only Debugger adoption above also authorizes `debugger`; further additions still need a concrete decision.
- DevTools capture and page-network bridge must continue to discard raw payloads after extracting derived usernames/counts/diagnostics.
- Page-network auto-assist is currently off. If explicitly enabled in another task, it must still exclude cookies, auth headers, full request headers, private messages, and raw API responses.
- Repo-local `.agents` skill/subagent files are allowed as non-runtime harness documentation. They must not become hidden automation that changes browser state or stores sensitive Instagram data.

<!-- AI Project Kit refresh 2026-09-02 (kit ef3969d): block added by refresh; edit freely -->

## Effective harness enforcement

This file is guidance. The record below is a dated observation of one runnable
surface, not a claim about the whole harness product. Instructions and settings
alone do not prove that an action is stopped.

Complete every field before calling project setup ready. Replace each
placeholder with the observed value or, when it applies, `off`, `not applicable`,
`not enforced`, `configured, not observed`, or `unknown`. Do not leave a field
blank.

```text
selected harness: Codex current task session; Claude project instructions also exist but its execution settings were not observed
runnable surface (CLI/IDE/desktop/cloud/remote): unknown - client surface/build not independently identified; local shell tools observed on macOS
observed version/build or rolling-service observation date: 2026-09-19 session observation; exact client build unknown
official enforcement references checked (docs/LINKS.md entry + date): official Codex permissions and config reference checked 2026-09-19; exact links are in docs/REFERENCES.md follow-up for the separate CLI trial below, not a parent-session enforcement claim
policy owner: local project operator; host/organization policy ownership unknown
settings file path: no project .codex/config.toml, .claude/settings.json, .claude/settings.local.json or .mcp.json; effective host settings path unknown
filesystem scope (configured -> effective): session reports danger-full-access -> local reads/writes available; no filesystem sandbox claimed
network scope (configured -> effective): session reports enabled -> public documentation read observed; domain restriction not tested
command gating (configured -> effective): session reports approval policy never -> local tests executed without a confirmation; no human approval gate claimed
unlisted tool/command behavior (allow/ask/deny/skip/unknown): unknown - only commands in this task were exercised
credential exclusion (configured -> effective): project forbids access/storage of secrets -> no credential isolation test performed; not enforced by this document
behavior when enforcement is unavailable or unsupported: unknown at host level; project instruction is to stop an action that needs missing authority, not try another access path
no-approver behavior (not applicable for interactive-only): current session reports never; missing user authority is not granted by that setting; unattended behavior unknown
model/telemetry/trace egress (data classes, destination, retention; off/unknown): unknown - provider retention and host telemetry not audited; no private Instagram artifacts supplied by this refresh
organization-enforced floor: unknown - managed policy not inspected
effective deny evidence (tested path only): parent session not enforced; separate CLI 0.154.0 trial below denied command networking but failed the declared file read/write restrictions
last verified: 2026-09-19 (record and scoped observations only)
```

Effective deny evidence names the surface and version or observation date, the
tested tool or execution path, a harmless attempted action, the expected and
observed results, and a sanitized artifact locator when one exists. It proves
only that tested path. When no safe observation is possible, record
`configured, not observed`; do not call the boundary enforced.

### Separate CLI denial trial — 2026-09-19

The current author session still has full filesystem access. No persistent
settings were changed. A separate `codex sandbox -P ig-review` invocation used
CLI-only overrides: `:minimal` and the existing Python runtime readable, a
synthetic temporary directory readable, one synthetic file denied, network off.
This tests that specific execution path, not all Codex clients or permission modes.

| Probe | Expected | Observed |
| --- | --- | --- |
| Read synthetic allowed file | Allowed | Allowed |
| Read synthetic explicitly denied file | Denied | Unexpectedly allowed |
| Create file in declared read-only temporary directory | Denied | Unexpectedly allowed |
| Connect to an active local loopback listener | Denied | `EPERM`, errno 1; unsandboxed control connected |

The first attempt used `/usr/bin/python3` and failed before probe execution
because the configured CommandLineTools path lacked `xcrun`. A second attempt
used the already installed Homebrew Python 3.14.7, adding its runtime read path
while keeping the same test-file restrictions. No dependencies were installed.
Both attempts are retained, not counted as two successful tests.

Sanitized exact commands, overrides and results:
`/private/tmp/instagram-kit-review-4snbwf_j/remaining/sandbox-probe.json` and
`sandbox-probe-python.json`. The unexpected file access prevents using this
configuration for the independent reviewer. Root cause is unassessed; do not
generalize it to every permission profile. No reviewer or fresh-session behavior
trial was started with it, and no credentials or real private files were probed.

`codex login status` reported ChatGPT login; no model request was made for the
blocked review. Authentication material stayed in the product credential store.
Provider retention, telemetry and organization policy remain unknown. Command
network denial does not prove those separate channels are disabled.

## Third-party skills, plugins, and MCP servers

- Record source, author, version or commit, and retrieval date before installing.
- Read the full body and every bundled script, hook, and MCP entry.
- Install project-local first; do not widen to user or plugin scope early.
- Diff before every update and record the removal path.

## Validation versus enforcement

`npm test` is an explicitly invoked local check, not a mandatory merge gate.
No project CI workflow or new hook was installed by this refresh. A test pass,
complete adoption record, or review does not authorize browser/account actions,
dependency installation, publishing, or broader access. Recheck this dated host
record when switching clients, machines, permission settings, or execution paths.
