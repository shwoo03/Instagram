# Project Profile

## Kit adoption

- Adoption mode: refresh-applied-project
- Selected profile: legacy-project-upgrade
- Applied kit revision: unknown - partial selections from a dirty source; no single commit describes all applied guidance
- Last refresh date: 2026-09-19
- Comparison source: `/Users/shwoo/mydir/AI_architecture`, HEAD `e25d4a0d9a11504aa6588333cbaf397e6838266a`, plus nine recorded uncommitted paths; dirty-provisional. Read-only remote check on 2026-09-19 found `origin` HEAD/main at `7fdda0c1db8cc571dc40a366fe9afe44a644a448`, two commits behind the local source; no fetch or source change.
- Earlier partial sources: `ef3969d848d33f905b3977ccaa4ecf0def79b4cd` (2026-09-02) and `7fdda0c1db8cc571dc40a366fe9afe44a644a448` (2026-09-05); original full-adoption revision unknown.
- Owner-authorized selection: R-01 through R-15 from the chat report. The initial low-impact batch excluded R-12; the subsequent “남은 작업 해줘.” selected its remaining documentation adoption. `docs/CHANGE_REVIEW.md` now defines the procedure; actual independent review is blocked/unreviewed because the tested host controls did not enforce the required file boundary.
- Scope: project docs, existing skill/role guidance, and ignore patterns only. Runtime, manifest, dependencies, account operations, and tool configuration are unchanged.
- Provenance, exact paths, validation and rollback: `docs/REFERENCES.md`; latest outcome: `docs/HANDOFF.md`. This is a usable documentation refresh, not full adoption of every optional kit practice or proof of enforced permissions.

## Purpose

This project is a local Chrome extension for comparing Instagram followers and following.
The current practical goal is to collect both lists reliably enough to answer:

- Who follows me but I do not follow?
- Who do I follow but does not follow me?
- Was either list incomplete, and how much should I trust the diff?

## Users

- Primary user: the local operator running the extension in Chrome while logged into Instagram.
- The extension is not designed as a public automation service.

## Core Files

- `manifest.json`: Manifest V3 extension definition.
- `background.js`: extension action handler and message relay.
- `debugger-capture.js`: local run-scoped automatic CDP Network controller.
- `network-payload-parser.js`: sanitized response classification and username extraction.
- `main.js`: injected Instagram page collector and result printer.
- `accuracy-engine.js`: strict/assisted comparison and completion rules.
- `account-list-contract.js`, `account-list-ui.js`, `run-context.js`: bounded lists, explanations, search, and current-profile display.
- `session-retention.js`: serialized writes and bounded session retention.
- `popup.html`, `devtools-panel.html`: start/stop/progress/result interfaces.
- `devtools.html`: DevTools extension entrypoint.
- `devtools.js`: optional DevTools Network response username extractor.
- `docs/HANDOFF.md`: current state and next steps.
- `docs/SECURITY.md`: privacy and permission constraints.
- `docs/BACKLOG.md`: project-specific backlog.
- `docs/REFERENCES.md`: official docs and adoption decisions.
- `docs/LINKS.md`: project-specific link index.
- `docs/PROFILE_CHECKLIST.md`: applied starter-kit profile checklist.

## Collection Strategy

The collector should combine multiple signals instead of trusting one source:

- Existing DevTools Network capture when DevTools is already open.
- Otherwise, run-scoped automatic `chrome.debugger` Network capture.
- Optional MAIN-world `page-network-bridge.js` evidence; automatic page-network assistance is off. Isolated-world hooks are not page traffic proof.
- DOM modal scrolling and profile-link extraction.
- Expected count parsing from visible Instagram labels.
- Diagnostics when collected count differs from expected count.

Strict comparison accepts exact DevTools/Debugger list evidence only. Page-network
and DOM results remain in the assisted preview; neither readiness nor a matching
displayed count alone proves completion. `accuracy-engine.js` also considers
pagination, pending/failed capture, unsafe exits, and comparison integrity.

## Output Strategy

Console output should be Korean-first and readable:

- Print counts before account lists.
- Print account names for each diff bucket.
- Mark partial results clearly.
- Explain which side is incomplete and which diff fields may be wrong.
- Preserve results in `window.__igFollowerResult` for inspection.

## Non-Goals

- Do not build a cloud service.
- Do not collect passwords, cookies, tokens, request headers, or raw payload archives.
- Do not bypass Instagram access controls.
- Do not make dogfood logs about this extension's runtime bugs.

## Operating Model

- This project uses file-based continuity through `docs/HANDOFF.md`.
- Stable project facts belong here, not only in chat.
- Security and permissions belong in `docs/SECURITY.md`.
- Extension bugs and feature work belong in `docs/BACKLOG.md`.
- External references and adoption/rejection decisions belong in `docs/REFERENCES.md`.
- Kit-level lessons belong in `dogfood/`.

## Optional Surfaces

Existing project-local instruction aids are listed in `docs/PROFILE_CHECKLIST.md`:
the accuracy, Notion documentation, and explanation skills, plus six advisory
review-role documents. They are not installed background workers.

The project does not currently need additional:

- hooks
- MCP servers
- skills or subagent registrations
- eval runtime
- worktree automation
- project memory
- research archive

Add any of these only after a project-specific reason, owner, security boundary,
and rollback path are recorded.

## 2026-06-06 Harness Stabilization Update

- Historical policy used page-network auto-assist. Current v1.8.0 policy prefers fresh DevTools, otherwise run-scoped Debugger capture; page-network auto-assist is off and DOM-only output stays a preview.
- Repo-local `.agents/skills/instagram-accuracy-debugging` and `.agents/subagents` are intentionally adopted for repeated Instagram accuracy/debugging work.
- These agent surfaces are documentation and workflow aids only. They do not add runtime permissions, background automation, global Codex behavior, or secret storage.
- Final strict diff uses exact DevTools/Debugger sets. Raw DOM overcount remains diagnostic; assisted fallback never becomes strict evidence.

## Regression Policy: Evidence, Not Usernames

- Accuracy fixes must be rule-based. Do not add username-specific exceptions.
- Exact DevTools/Debugger evidence is the strict compare source; page-network and DOM are assisted or diagnostic layers.
- DOM candidates can explain UI/network disagreement. Bounded fallback may support the assisted preview only, subject to the engine's count and completion checks.
- Runtime diagnostics should make final results visually distinct from raw/provenance/candidate data.

## 2026-06-07 Accuracy Research Policy

- Accuracy work should start from evidence contracts, not selectors: exact network source, payload shape, expected counts, final compare counts, candidates, and stale-run context.
- DevTools capture can miss earlier requests if opened late, so `DevTools connected` is not the same as `followers/following payload confirmed`.
- MV3 background state can be stale or restarted. Bridge state must be timestamped, cleaned on disconnect/navigation, and treated as advisory until content delivery succeeds.
- MAIN-world page-network capture is the only page request interception path that should be treated as page traffic evidence. Isolated content-script hooks are diagnostics only.
- Dynamic DOM APIs help diagnose virtual scrolling but do not prove list completeness by themselves.
