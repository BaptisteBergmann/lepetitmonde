---
tags: [lepetitmonde/guide]
---

# Coding conventions

Up: [[Le petit monde]] · Full rules: `CLAUDE.md` at the repo root

## Code

- Server Components by default; `'use client'` only for interactivity. See [[Server and client split]].
- All data access through Server Actions in `src/utils/actions/`; `revalidatePath()` after a mutation.
- Always `createClient()` from `@/utils/supabase/server` and `supabase.auth.getUser()`. Never `getSession()` for a security check.
- Check membership, role, page access and every child id ([[Authorization]]).
- Use generated types (`Tables<'...'>`, `Enums<'...'>`), never hand-written interfaces for tables.
- Baby context from the URL (`params`, `useParams()`).
- Pino child logger at the top of every action ([[Logging]]); no `console.log`.
- Every string in `messages/fr.json` and `messages/en.json` ([[Internationalization]]).
- `cn()` for classes; `z-index` only from the [[z-index]] scale.
- Shared rules for web + MCP go in a [[Core modules|core module]].

## Files

- `snake_case.tsx` for feature components in `_components/`, kebab or snake case in `utils/`, following the neighbours.
- One `page.tsx` + `loading.tsx` per route.

## Git

- Work on `main`.
- Conventional Commits: `feat(feed): ...`, `fix(tracker): ...`, `docs: ...`.
- One small commit per subtask, then a `docs: update CHANGELOG.md for <hash>` commit adding `` `<hash>` <subject> `` under today's date.
- Plans in `.claude/plans/<feature>.md`; when shipped, add `## Status: implemented` and move to `.claude/plans/done/`.
