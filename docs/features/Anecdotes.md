---
tags: [lepetitmonde/feature]
---

# Anecdotes

Up: [[Le petit monde]] · Route: `/baby/[babyId]/anecdotes` · Code: `anecdotes/`, `actions/anecdotes.ts`, `anecdotes-core.ts`

Short written stories about the baby ("today she laughed at the cat"), with an optional photo, shared with chosen circles.

- Admins create and edit; viewers see the anecdotes shared with their circles. No circle = admin-only.
- Creating one notifies the family (`new_anecdote`).
- Paged list; also exposed to the [[MCP server]] (`list_anecdotes`, `add_anecdote`, no photo support there).

Tables: `anecdotes`, `anecdotes_circles`.
