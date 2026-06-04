# MCP server config example: local filesystem readonly

## Purpose

Allow an agent to inspect project documentation without granting write, shell,
or network access.

## Server

- Name: `local-docs-readonly`
- Owner: `<team or maintainer>`
- Review date: `<date>`

## Transport

- Transport: local process or `<fill in>`
- Command: `<fill in>`

## Root directory

- Root directory: project docs directory or `<fill in>`
- Reads outside root: not allowed without explicit approval

## Allowed tools

- `read_file`
- `list_directory`

## Disallowed tools

- `write_file`
- `delete_file`
- `shell`
- `network_request`

## Secrets

- None.

## Filesystem boundary

Read-only access to the configured root. No hidden dotfiles, home directories,
or sibling repositories unless explicitly reviewed.

## Network boundary

No network access.

## Consent / approval

User approval is required before reading outside the project root or expanding
the root directory.

## Review date

- `<date>`

