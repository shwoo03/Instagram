# Dogfood backlog

Use this file for actionable AI Project Kit improvements discovered while
working on real projects. Do not use it for Instagram extension runtime bugs.

## Open

| ID | Type | Source report | Problem | Fix target | Priority | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Done

| ID | Fixed in commit | Summary |
| --- | --- | --- |
| DF-002 | AI_architecture `91221b3` | Research capture, filled examples, handoff strengthening, optional-surface guidance, dogfood observations, and validation coverage were added to the source starter kit. |

## Rejected / no change

| ID | Reason |
| --- | --- |
| DF-003 | Kit improvement | Instagram accuracy hardening 2026-06-07 | Research findings were useful only after they were converted into references, decisions, runtime guardrails, and eval cases. | Add a `research-to-decision-to-fixture` recipe/template to the kit. | P1 | open |
| DF-004 | Kit improvement | Instagram accuracy hardening 2026-06-07 | Repeated regressions came from missing evidence contracts, not missing comments. | Add an evidence-contract checklist to harness/debugging templates. | P1 | open |
| DF-005 | Kit improvement | Instagram accuracy hardening 2026-06-07 | Subagent reviews were valuable when each role had a specific lens and produced prioritized findings. | Add a subagent synthesis template that forces `finding -> risk -> implementation implication -> fixture`. | P2 | open |
