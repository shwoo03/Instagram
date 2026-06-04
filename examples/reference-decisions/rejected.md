# Reference decision example: rejected

## Candidate

- Name: Broad Workflow Framework
- URL: `https://example.com/workflow-framework`
- Date checked: 2026-05-30
- License: GPL-3.0
- Version / commit: `3.2.0`
- Adoption mode: `rejected`

## Why considered

The framework provides queues, retries, state machines, and scheduling.

## Rejection reason

- License is incompatible with the intended distribution.
- The project only needs one scheduled task.
- Operational overhead is higher than the current need.

## Safer alternative

Use the platform scheduler already available in the deployment environment and
record that decision in `docs/REFERENCES.md`.

## What would change the decision later

Revisit if the project grows multiple long-running workflows with retries,
visibility requirements, and an operations owner.

## Security notes

No source or API was copied. The candidate was read only for evaluation.

