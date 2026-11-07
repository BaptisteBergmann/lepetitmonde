---
tags: [lepetitmonde/guide]
---

# Adding a feature

Up: [[Le petit monde]] · See also [[Coding conventions]]

## Workflow

1. **Plan**: the planner agent writes `.claude/plans/<feature>.md`.
2. **Design** (if UI): the designer agent fills the plan's Design section.
3. **Approval** by the owner.
4. **Build**: the builder agent implements.
5. **Review**: the reviewer agent checks security, data access, correctness, i18n, accessibility. At most two build/review rounds.
6. **Ship**: migrations, push, deploy ([[Deploying]]).

## Checklist for a new baby page

1. Migration for the tables, with RLS and grants ([[Database migrations]]); regenerate types.
2. Add the page to `PAGE_REGISTRY` with its icon, default role and default state ([[Page settings]]). Add `PageId`.
3. Add `pages.<id>.*` and feature strings to both message files.
4. Server Actions in `src/utils/actions/<feature>.ts`; put the rules in `src/utils/<feature>-core.ts` if MCP will use them ([[Core modules]]).
5. `app/baby/[babyId]/<feature>/page.tsx` calling `assertPageAccess`, `loading.tsx`, `_components/`.
6. Circles join table if content is shared selectively ([[Authorization]]).
7. Notification type if members should hear about it ([[Notifications pipeline]]).
8. Realtime binding if several people edit at once ([[Realtime]]).
9. MCP tools in `src/app/api/mcp/tools/<feature>.ts` if useful to AI clients ([[MCP server]]).
10. Update this documentation: a note in `docs/features/` linked from [[Le petit monde]].
