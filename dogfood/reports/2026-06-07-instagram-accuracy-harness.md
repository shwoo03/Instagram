# Dogfood Report: Accuracy-first Harness Improvement

## Source project

Sanitized local Chrome extension debugging session. The project-specific runtime bugs remain in `docs/BACKLOG.md`; this report records kit-level lessons only.

## What happened

A repeated accuracy issue was initially tempting to treat as a selector problem or account-specific exception. The better pattern was to treat it as an evidence-contract failure:

- Separate raw observations from confirmed compare evidence.
- Make candidates visible but excluded from final diff.
- Reconcile stale lower-confidence evidence when higher-confidence evidence arrives later.
- Preserve a short, operator-readable trust gate.
- Convert research into references, decisions, implementation guardrails, and eval cases.

## What worked

- Four-lens subagent review worked well: accuracy policy, runtime stability, debug UX, and research synthesis.
- Official docs clarified platform boundaries: MV3 worker lifecycle, DevTools request-body access, isolated vs MAIN worlds, and powerful/rejected debugger permissions.
- Research papers on flaky web UI behavior supported a fixture/eval approach instead of more retries or selector tweaks.

## Kit improvement proposal

Add a reusable recipe named `research-to-decision-to-fixture` with this flow:

1. State the observed failure in one sentence.
2. Split facts into `confirmed`, `candidate`, `diagnostic`, and `unknown`.
3. Search official docs first, then papers or primary research for unstable UI/system behavior.
4. Record an adoption/rejection decision in `docs/REFERENCES.md`.
5. Update the repo-local handoff/backlog/agent instructions.
6. Add or update one fixture/checklist per repeated failure class.
7. Keep project bugs out of dogfood; promote only reusable kit lessons.

## Suggested template fields

- Failure class:
- Evidence layers:
- Official docs checked:
- Papers/specs checked:
- Decision:
- Runtime guardrail:
- Operator UX guardrail:
- Fixture/checklist:
- Privacy/security boundary:
- Dogfood lesson candidate:

## Backlog links

- DF-003: research-to-decision-to-fixture recipe.
- DF-004: evidence-contract checklist.
- DF-005: subagent synthesis template.
