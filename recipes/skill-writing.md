# Skill writing recipe

Official links: see `templates/links.md`.

A skill is a small reusable workflow contract. Do not create skills for one-off
tasks.

## When to use

- A workflow repeats across projects or sessions.
- Inputs, outputs, permissions, and verification can be described.
- The skill reduces real duplication or operational risk.

## When not to use

- The task is a one-off prompt.
- The workflow has unclear activation conditions.
- The skill would silently perform broad side effects.

## Template

```text
# <skill-name>

## Purpose

## Activation

## Input contract

## Output contract

## Required tools / permissions

## Failure modes

## Verification

## Examples

## Anti-patterns
```

## Checklist

- Purpose is one sentence.
- Activation condition is specific.
- Inputs and outputs are named.
- Tool permissions are explicit.
- Failure modes say whether retry is safe.
- Verification has at least one acceptance check.
- Examples include one good and one bad use.

## Skill locations

Examples:

- Example only: `examples/skills/<skill-name>/SKILL.md`
- Project-local Claude skill: `.claude/skills/<skill-name>/SKILL.md`
- Personal/user skill: user-level Claude skill directory

Do not add `.claude/skills/` to generated projects by default.

## Permission warning

- Review any skill that grants tool permissions.
- Prefer read/search-only permissions for research skills.
- Do not add broad Bash/Edit tools unless the project is trusted and the
  permission is justified.
- Skills must not replace official SDK/runtime behavior.

## Plugin packaging

If multiple skills/hooks/agents/MCP configs need to be reused together, consider
plugin packaging. Do not package a plugin just to avoid writing a clear recipe.
See `recipes/plugin-packaging.md`.

## Command-like skills

Claude Code custom commands are now effectively skill-like workflows. Prefer
skills for repeatable commands because skill content loads only when used.

Use command-like skills when:

- you repeatedly paste the same procedure
- the procedure has clear inputs/outputs
- supporting files are useful
- it should not live in `AGENTS.md` all the time

Do not use command-like skills when:

- a one-line shell alias is enough
- the workflow has broad side effects
- the project does not trust the skill source

Example: `examples/skills/open-source-adoption/`

## Reuse-first skills

Use a skill when you repeatedly paste the same checklist or multi-step procedure.

Recommended optional skill:

- `open-source-adoption`
- Purpose: force agents to evaluate official SDKs/open-source projects before custom infrastructure.

A skill should be concise. Supporting files can hold candidate cards and decision matrices. Skills are optional and should not be enabled by default in every generated project.

Example: `examples/skills/open-source-adoption/`

## Common mistakes

- Using natural-language-only inputs for structured tasks.
- Leaving side effects after failure.
- Replacing official SDK behavior with a skill.
- Creating a skill that cannot be validated.
