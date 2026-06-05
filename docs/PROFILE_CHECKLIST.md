# Profile checklist

Profile: legacy project upgrade / local Chrome extension.

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
- [ ] skills
- [ ] subagents
- [ ] eval runtime
- [ ] worktree automation
- [ ] runtime logs
- [ ] raw network payload archives
- [ ] `docs/PROJECT_MEMORY.md`
- [ ] `research/`

## Project-specific checks

- [ ] `README.md` explains extension usage, not starter-kit usage.
- [ ] `START_HERE.md` explains how to resume extension work.
- [ ] `docs/HANDOFF.md` has current next action and validation evidence.
- [ ] `docs/SECURITY.md` lists allowed and forbidden data.
- [ ] `docs/BACKLOG.md` keeps extension bugs separate from dogfood lessons.
- [ ] Manual Chrome validation is run after extension behavior changes.

## 2026-06-06 Harness Surface Decision

- Applied: repo-local accuracy debugging skill at `.agents/skills/instagram-accuracy-debugging/SKILL.md`.
- Applied: repo-local subagent guidance under `.agents/subagents/` for accuracy policy, runtime review, and debug UX.
- Still intentionally absent: hooks, MCP servers, eval runners, worktree automation, and hidden global starter-kit scaffolding.
- Required runtime behavior: DevTools first, page-network auto-assist second, DOM preview/provisional last.
