# MCP configuration examples

MCP is a reviewed boundary between an AI host and external tools or data.

- Host: the AI app or coding harness.
- Client: the connector used by the host.
- Server: the process exposing tools, resources, or prompts.

Use MCP only when external tools or data need a boundary that can be reviewed,
owned, and audited. See `recipes/mcp-connection.md` for the project recipe.

Secrets must not be committed. Tool descriptions and external content are
untrusted until reviewed. These files are examples only; scaffold helpers do not
generate MCP configs by default.

