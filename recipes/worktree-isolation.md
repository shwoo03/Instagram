# Worktree isolation recipe

Official links: see `templates/links.md`.

## Purpose

Use git worktrees or harness-provided worktree features to isolate parallel
agent sessions so file edits do not collide.

This is optional and mostly useful for larger projects or parallel work.

## When to use

Use worktree isolation when:

- multiple agents/sessions work in parallel
- subagents may edit files independently
- risky refactors need isolation
- you want clean rollback boundaries
- long-running tasks should not touch the main checkout

## When not to use

Do not use worktrees when:

- one small change is enough
- the repo setup is hard to reproduce
- local secrets/env cannot be safely copied
- the team cannot clean up worktrees
- normal branches are sufficient

## Checklist

- Choose base branch.
- Decide where worktrees live.
- Add worktree directory to `.gitignore` if needed.
- Decide whether ignored files are copied.
- Never copy secrets blindly.
- Record how to install dependencies in new worktrees.
- Record cleanup command.
- Require merge/review before applying changes to main checkout.

## Minimal manual flow

```bash
git worktree add ../project-feature-a -b feature-a
cd ../project-feature-a
# run the chosen harness here
```

## Handoff for parallel sessions

Each worktree/session should record:

- branch/worktree name
- goal
- files changed
- validation
- merge status
- cleanup status
- next action

## Anti-patterns

- Parallel sessions editing the same checkout.
- Copying `.env` or secrets into worktrees without review.
- Forgetting to clean up abandoned worktrees.
- Treating worktrees as memory.
- Running multiple agents without a merge plan.
