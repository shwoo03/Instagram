---
name: open-source-adoption
description: Find, evaluate, and adopt official SDKs or open-source libraries before custom infrastructure.
allowed-tools: Read Grep WebSearch
---

# Open-source adoption skill

Use this skill before implementing non-trivial infrastructure.

## Required behavior

1. Identify the subsystem to build.
2. Search for official SDKs first.
3. Search for maintained open-source candidates.
4. Inspect actual API/source usage, not only README summaries.
5. Produce candidate cards unless the domain is highly project-specific.
6. Recommend one adoption mode:
   - direct-dependency
   - adapter
   - fork
   - vendored-source
   - concept-only
   - rejected
7. If custom implementation is recommended, justify why.

## Output

Use:

- `candidate-card.md`
- `decision-matrix.md`

## Safety

- Do not copy source without license and provenance.
- Do not add dependencies without maintenance/security review.
- Prefer adapter over fork.
- Prefer official SDK over custom runtime.
