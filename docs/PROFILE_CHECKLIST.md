# Profile checklist

Profile: legacy project upgrade / local Chrome extension.

Selected profile: `legacy-project-upgrade`. Reviewed 2026-09-18 against the
dirty-provisional kit source recorded in `PROJECT_PROFILE.md`. Checked boxes
below describe documentation/inventory, not live tool enforcement.

## Default docs

- [x] `AGENTS.md`
- [x] `docs/PROJECT_PROFILE.md`
- [x] `docs/HANDOFF.md`
- [x] `docs/SECURITY.md`
- [x] `docs/BACKLOG.md`
- [x] `docs/REFERENCES.md`
- [x] `docs/LINKS.md`

## Optional surfaces

Do not add these by default:

- [ ] hooks
- [ ] MCP servers
- [x] Existing skills only: accuracy debugging, Notion documentation, and explain-for-humans; paths and source limits in `REFERENCES.md`
- [x] Existing `.agents/subagents/` role documents only; no worker registration or automatic invocation
- [ ] eval runtime
- [ ] worktree automation
- [ ] runtime logs
- [ ] raw network payload archives
- [ ] `docs/PROJECT_MEMORY.md`
- [ ] `research/`

## Project-specific checks

- [x] `README.md` explains extension usage, not starter-kit usage.
- [x] `START_HERE.md` explains how to resume extension work and keep reviews read-only.
- [x] `docs/HANDOFF.md` has current next action and validation evidence.
- [x] `docs/SECURITY.md` lists allowed/forbidden data and discloses unobserved controls.
- [x] `docs/BACKLOG.md` keeps extension bugs separate from dogfood lessons.
- [x] R-12 procedure adopted in `docs/CHANGE_REVIEW.md`; static decision scenarios checked. Independent reviewer execution remains blocked/unreviewed.
- [x] Fresh synthetic browser checks on 2026-09-19: `npm run e2e`, `npm run e2e:capture`, and `npm run ui:e2e` passed.
- [ ] Fresh live Instagram validation for v1.8.0 remains an operator task; historical local browser tests do not close it.

## 2026-06-06 Harness Surface Decision

- Applied: repo-local accuracy debugging skill at `.agents/skills/instagram-accuracy-debugging/SKILL.md`.
- Applied: repo-local subagent guidance under `.agents/subagents/` for accuracy policy, runtime review, and debug UX.
- Still intentionally absent: hooks, MCP servers, eval runners, worktree automation, and hidden global starter-kit scaffolding.
- Current runtime behavior supersedes the historical auto-assist policy: fresh DevTools first, otherwise run-scoped Debugger; page-network auto-assist off, page-network/DOM assisted only.

## Remaining choices

- Blocked: independent review and fresh-session behavior trials. A Codex CLI 0.154.0 probe denied loopback networking but unexpectedly allowed a denied synthetic read and a write in its declared read-only area; no reviewer was started with that failed boundary. See `SECURITY.md`.
- Deferred: CI, broad module extraction, partial-side recollection/recovery, download/import, side panel and persistent history; retain `BACKLOG.md` decisions.
- Not added: Context7 or other MCP, Claude refinement skill, hooks, plugins, memory, eval runtime, worktree automation, or a research archive.
- Confirmed: remote kit HEAD/main is `7fdda0c1db8cc571dc40a366fe9afe44a644a448`, two commits behind local source; Notion skill copies match their local introducing commit `d807f78d33374454de40fece29178161296f4c5c`.
- Unknown: Notion skill external upstream/author/update channel, organization-wide controls, provider retention/telemetry, and fresh-session instruction behavior. Scoped denial results are evidence only for the tested CLI command path.
- Exact full-applied revision remains unknown until the dirty comparison source is reconciled and remaining scope decisions are recorded.
