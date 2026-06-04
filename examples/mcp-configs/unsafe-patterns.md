# MCP unsafe patterns

Avoid these patterns unless there is a reviewed, documented exception:

- Broad shell access.
- Full filesystem access.
- Committed tokens.
- Write access by default.
- Remote MCP server without owner, scope, and auth review.
- Trusting tool descriptions blindly.
- Hidden destructive automation.
- No owner or review date.
- Access to home directories or sibling repositories without approval.
- Production database access without a read-only role and audit trail.
- Network access that can reach internal systems without a clear boundary.

