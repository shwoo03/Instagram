# Reference decision example: custom implementation justified

Custom implementation is the last option. Use this shape when candidates were
checked and rejected for concrete reasons.

## Problem

The project needs a tiny deterministic parser for an internal, line-oriented
configuration format.

## Candidates checked

### Official SDK parser

- URL: `https://example.com/official-parser`
- Adoption mode: `rejected`
- Reason: supports a different file format and requires a runtime dependency
  larger than the project.

### General parser framework

- URL: `https://example.com/parser-framework`
- Adoption mode: `rejected`
- Reason: powerful enough, but adds grammar tooling and build steps not needed
  for this small format.

### Community snippet

- URL: `https://example.com/parser-snippet`
- Adoption mode: `rejected`
- Reason: unclear license and no tests.

## Decision

Implement a small custom parser.

## Why existing options do not fit

The format is project-specific, the parser is under 100 lines, and adopting a
framework would create more maintenance burden than the code itself.

## Maintenance owner

- Owner: `<team or maintainer>`
- Review trigger: format changes, security reports, or parser bug reports

## Test/validation plan

- Unit tests for valid examples.
- Negative tests for malformed input.
- Fuzz or property tests if the parser accepts untrusted external input.

## Removal/fallback plan

If the format grows nested structure, escaping rules, or compatibility versions,
re-evaluate maintained parser libraries and replace the custom parser behind a
small interface.

## Security notes

- Limit input size.
- Avoid dynamic evaluation.
- Treat all external files as untrusted.

