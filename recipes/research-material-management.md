# Research material management recipe

Official links: see `templates/links.md`.
Community references: see `references/community-ai-systems.md`.

## Purpose

Organize papers, blogs, official docs, CVEs, issue threads, and open-source
repos so they produce actionable project decisions.

Research is not useful unless it is connected to:

- a project decision
- a recipe/template/example update
- an adoption record
- a dogfood lesson

## When to use

Use this recipe for:

- SDK/framework comparisons
- papers/blogs that influence architecture
- security research
- open-source library selection
- agent memory/context design
- MCP/tool design
- eval strategy
- long-running project design

## Suggested project structure

Use this only for research-heavy projects.

```text
research/
  README.md
  sources/
    <source-card>.md
  briefs/
    <topic-brief>.md
  syntheses/
    <topic-synthesis>.md
  applied/
    <applied-change-record>.md
```

Do not create this by default for small projects.

## Source card

Use for one source.

Fields:

- Title:
- URL:
- Source type:
  - official-doc | paper | blog | repo | issue | CVE | discussion | other
- Date published:
- Date checked:
- Author/org:
- Trust level:
  - official | primary | reputable-secondary | community | unknown
- Summary:
- Relevant claims:
- Project relevance:
- Adoption mode:
  - reference-only | concept-only | direct-dependency | adapter | fork | vendored-source | rejected
- Risks:
- Follow-up:

## Research brief

Use for one topic.

Fields:

- Topic:
- Question:
- Sources reviewed:
- Key findings:
- Conflicts / uncertainty:
- Recommended decision:
- Applied to:
  - template | recipe | profile | example | docs/REFERENCES.md | no change
- Review date:

## Synthesis

Use when multiple briefs lead to a kit-level change.

Fields:

- Theme:
- Sources:
- Repeated pattern:
- Decision:
- Kit change:
- Files changed:
- Dogfood evidence:
- Revisit trigger:

## Applied change record

Use when research changes the kit.

Fields:

- Change:
- Why:
- Sources:
- Files changed:
- Commit:
- Validation:
- Follow-up:

## Promotion path

- Raw source -> source card
- Source card -> research brief
- Multiple briefs -> synthesis
- Synthesis -> recipe/template/example/profile change
- Project-specific choice -> `docs/REFERENCES.md`
- Repeated real-world problem -> `dogfood/lessons.md`

## Anti-patterns

- Dumping links without decisions.
- Copying long blog/paper excerpts.
- Treating community repos as official docs.
- Letting stale research override newer official docs.
- Adding research directories to every small project.
- Updating recipes based on one anecdote without dogfood evidence.
