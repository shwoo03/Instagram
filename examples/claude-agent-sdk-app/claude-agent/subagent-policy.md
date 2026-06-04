# Subagent policy

## Default

Subagents are optional.

## Use when

- Scope separation is real.
- Permission separation is needed.
- Long context should be isolated.
- A specialist role repeats across tasks.

## Do not use when

- The task is simple.
- It is a one-file edit.
- The request is only to think more.
- Coordination cost exceeds benefit.

## Required record

For each subagent, record:

- purpose
- allowed tools
- scope
- output format
- owner
- review date

