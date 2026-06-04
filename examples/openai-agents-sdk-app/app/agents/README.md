# Runtime agent structure

Recommended structure:

```text
app/agents/
  instructions/
  tools/
  handoffs/
  guardrails/
  evals/
```

What belongs here:

- `instructions/`: runtime prompts and role instructions used by the app.
- `tools/`: tool definitions, wrappers, and permission boundaries.
- `handoffs/`: explicit routing between runtime agents or workflows.
- `guardrails/`: input/output checks and policy enforcement.
- `evals/`: regression and release-gate cases.

Do not duplicate SDK documentation. This directory should document the project's
runtime contracts and boundaries.

