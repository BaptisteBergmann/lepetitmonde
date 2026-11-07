---
tags: [lepetitmonde/feature]
---

# Settings and profile

Up: [[Le petit monde]] · Routes: `/settings`, `/profile` · Code: `settings/_components/`

- **Account**: name, email change, password change, logout.
- **Devices**: every push-subscribed device, which can be renamed or removed ([[Notifications pipeline]]).
- **Connected apps**: personal API tokens for the [[MCP server]] (admins create them; the token is shown once with a ready-to-paste `claude mcp add` command) and OAuth connections ([[OAuth authorization server]]), each revocable.

Per-baby notification preferences and quiet hours are in the header's notification bell, not in settings.
