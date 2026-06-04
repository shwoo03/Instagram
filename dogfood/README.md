# Dogfooding

Dogfooding means applying AI Project Kit to real projects and recording where
the kit is helpful, missing guidance, too heavy, or unclear.

This is a Markdown-based learning loop, not automation and not an operating
system. Use reports for evidence and `backlog.md` for actionable improvements.
Keep each report short enough to write in about 10 minutes.

## What to try

Apply the kit to representative projects:

- small new projects
- existing projects
- API/backend projects
- agent runtime apps
- research-heavy projects
- team/audit projects

## Reporting rules

- Sanitize every report.
- Do not record secrets.
- Do not record private tokens.
- Do not record customer data.
- Do not copy private source or proprietary content.
- Use anonymous project names when needed.
- Record concrete evidence, not just impressions.

## Workflow

1. Choose a profile.
2. Scaffold or manually copy the needed files.
3. Fill in `AGENTS.md`, `PROJECT_PROFILE`, `SECURITY`, and related docs.
4. Do one real project task.
5. Observe whether reuse-first behavior actually happened.
6. Write a short report in `dogfood/reports/` using
   `dogfood/templates/adoption-report.md`.
7. Add 1-3 actionable items to `dogfood/backlog.md` when warranted.
8. Move repeated lessons to `dogfood/lessons.md`.

For this Instagram extension, do not put extension-specific runtime bugs in
dogfood. Use `docs/BACKLOG.md` for extension work. Use dogfood only when the
starter-kit guidance, templates, or examples should improve.

## Issue classes

Use these types when classifying findings:

- `template-gap`: canonical template is missing needed guidance.
- `recipe-gap`: recipe explanation or checklist is incomplete.
- `example-gap`: copyable example is missing or too abstract.
- `profile-gap`: profile choice or checklist is ambiguous.
- `scaffold-bug`: init/generator behavior is wrong.
- `link-update`: official documentation link or reference needs review.
- `security-gap`: secret/tool/permission guidance is incomplete.
- `too-heavy`: default surface is heavier than needed.
- `project-specific-no-change`: project-specific issue that should not change the kit.

## Promotion rule

Promote lessons to recipes, templates, examples, or README only after they repeat
across projects. Prefer fixing repeated issues over reacting to one-off project
quirks.
