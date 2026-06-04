# Community reference evaluation recipe

Official links: see `templates/links.md`.
Community references: see `references/community-ai-systems.md`.

## Purpose

Evaluate community/open-source AI agent systems without blindly adopting them.

This recipe helps decide whether a community system should be:

- ignored
- used as background reference
- used concept-only
- installed as a tool
- wrapped with an adapter
- forked
- vendored
- rejected

## When to use

Use this recipe when considering:

- agent harnesses
- Claude/Codex workflow layers
- plugin packs
- hook packs
- skill packs
- MCP servers
- subagent packs
- prompt/rule packs
- memory systems
- agent management platforms
- tool gateways
- orchestration layers

## Default stance

Start with:

- `reference-only` for large systems
- `concept-only` for design ideas
- `adapter` if a small bounded integration makes sense
- `direct-dependency` only if the project explicitly needs the runtime/tool

Do not make community systems default dependencies.

## Evaluation checklist

For each candidate:

- Repository URL:
- License:
- Maintainer / org:
- Last meaningful commit:
- Release activity:
- Install method:
- Files/directories written:
- Runtime/state directories:
- Hooks or background processes:
- Tool permissions:
- Network access:
- Secret handling:
- Uninstall/rollback path:
- Security documentation:
- Docs quality:
- Test/CI quality:
- Fit for this project:
- Maintenance burden:
- Adoption mode:

## Red flags

- Requires broad shell/file/network access by default.
- Installs hidden hooks or background jobs.
- Hides shell/MCP behavior inside plugin-bundled hooks or settings.
- Writes global config without clear uninstall.
- Duplicates official SDK/harness behavior without clear value.
- Encourages bypassing sandbox/approval by default.
- Has unclear license or provenance.
- Requires copying large prompt packs without review.
- Has no rollback path.
- Treats stars as proof of quality.

## Output

Record a short decision in `docs/REFERENCES.md`.

Use:

- reference-only
- concept-only
- direct-dependency
- adapter
- fork
- vendored-source
- rejected

## Anti-patterns

- Adding community tools to default scaffold.
- Treating a popular repo as official guidance.
- Installing large workflow layers before trying official SDK features.
- Copying prompt/skill packs without reviewing permissions.
- Reintroducing agent-flow-like runtime behavior under a new name.
