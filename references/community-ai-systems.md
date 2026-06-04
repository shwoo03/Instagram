# Community AI systems reference catalog

This catalog tracks non-official community and open-source AI agent systems that
may be useful as references.

These are not official kit dependencies and are not automatically recommended
for adoption.

Default adoption mode:

- `reference-only` for broad ecosystem awareness
- `concept-only` when borrowing ideas
- project-specific `direct-dependency` or `adapter` only after a project records
  an adoption decision in `docs/REFERENCES.md`

Official links remain in `templates/links.md`.

## Evaluation rule

Before adopting any community system:

- verify repository URL
- check license
- check recent activity
- inspect install surface
- inspect what files/directories it writes
- inspect tool/permission behavior
- inspect uninstall/rollback path
- check security posture
- record decision in `docs/REFERENCES.md`

Do not choose by GitHub stars alone.

## Entries

### ECC

- URL: https://github.com/affaan-m/ECC
- Also known as: Everything Claude Code, ECC
- Category: agent harness optimization / skills / rules / hooks / MCP / research-first workflow
- Default adoption mode: concept-only
- License/activity/security notes: verify before project adoption
- Why it is useful:
  - Good reference for skills, rules, hooks, research-first workflows, security
    scanning, and cross-harness design.
  - Useful comparison point for deciding what should stay optional in this kit.
- Why not adopt by default:
  - It is a large harness layer.
  - It can install skills, commands, hooks, rules, and other surfaces.
  - It may duplicate runtime behavior if combined incorrectly with other installs.
- Concepts to study:
  - skill packaging
  - research-first workflows
  - rule namespace management
  - install/uninstall safety
  - avoiding duplicate harness surfaces
- Kit stance:
  - reference-only / concept-only
  - never default scaffold output
  - project-specific adoption only

### Hermes Agent

- URL: https://github.com/NousResearch/hermes-agent
- Category: personal/long-running agent, memory, skills, tools, MCP, messaging gateways
- Default adoption mode: concept-only
- License/activity/security notes: verify before project adoption
- Why it is useful:
  - Strong reference for persistent memory, toolsets, skills, MCP integration,
    cron/scheduled work, context files, and agent architecture.
- Why not adopt by default:
  - It is closer to a full personal agent OS.
  - Persistent memory, gateways, scheduling, and broad tools are too heavy for
    the thin starter-kit default.
- Concepts to study:
  - memory boundaries
  - skills system
  - context files
  - tool gateway
  - security docs
  - MCP integration
- Kit stance:
  - concept-only
  - useful for agent-runtime-app and research-heavy profiles
  - not a default dependency

### Oh My Codex

- URL: https://github.com/Yeachan-Heo/oh-my-codex
- Also known as: OMX, Oh My codeX
- Category: Codex CLI workflow layer / prompts / plugins / skills / runtime helpers
- Default adoption mode: reference-only
- License/activity/security notes: verify before project adoption
- Why it is useful:
  - Useful reference for Codex workflow layering, project guidance, prompts,
    skills, plugins, and durable runtime artifacts.
  - Good comparison point for why AI Project Kit keeps runtime/state out of the
    default scaffold.
- Why not adopt by default:
  - It adds a workflow/runtime layer above Codex.
  - It uses its own state/workflow surface.
  - This kit intentionally avoids becoming a runtime or operating OS.
- Concepts to study:
  - Codex workflow wrappers
  - plugin packaging
  - project guidance through `AGENTS.md`
  - runtime state tradeoffs
  - worktree/session safety
- Kit stance:
  - reference-only
  - useful for Codex-heavy users who explicitly want a workflow layer
  - not a default dependency

### Paperclip

- URL: https://github.com/paperclipai/paperclip
- Category: agent workplace / task management / governance / delegation / budgeting
- Default adoption mode: concept-only
- License/activity/security notes: verify before project adoption
- Why it is useful:
  - Good reference for team/organization-level agent management, persistent
    sessions, ticketing, delegation, governance, budgets, and recurring work.
- Why not adopt by default:
  - It solves larger organizational problems than this starter kit.
  - It is too heavy for solo-small-project defaults.
- Concepts to study:
  - task-based agent management
  - governance
  - budget/cost tracking
  - persistent conversations
  - delegation
- Kit stance:
  - concept-only
  - useful for team-audit-project and agent-runtime-app thinking
  - not a default dependency

### Oh My Claude

- URL: <verify before adding>
- Category: pending verification
- Default adoption mode: reference-only pending
- License/activity/security notes: unavailable until a canonical repository URL is verified
- Notes:
  - Do not promote this to a stable reference until a specific canonical
    repository URL is verified.
  - If a verified repo exists, add license/activity/security notes before
    recommending.

