# Permission policy

## Defaults

- Start read-only.
- Grant write, shell, network, deploy, and database permissions only when needed.

## Destructive operations

Confirm before:

- deleting files
- overwriting user work
- deploying
- migrating databases
- rotating secrets
- changing permissions

## Broad permissions

Document:

- permission requested
- reason
- scope
- owner
- review date

## Hidden write behavior

Avoid hidden writes through hooks, generated files, or background tasks.

