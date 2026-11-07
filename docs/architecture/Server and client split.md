---
tags: [lepetitmonde/architecture]
---

# Server and client split

Up: [[Le petit monde]] · See also [[Architecture overview]], [[Core modules]]

## Server Components by default

Every `page.tsx` is a Server Component. It reads `params` (for example `babyId`), checks access, fetches data through Server Actions and renders. `'use client'` is only added for forms with state, gestures, lifecycle hooks and live updates.

A Server Component is never imported into a Client Component; when nesting is needed it is passed as `children`.

## Server Actions for all data

All reads and writes live in `src/utils/actions/*.ts` (`'use server'`). Each action:

1. Creates the cookie-bound client with `createClient()` from `@/utils/supabase/server`.
2. Verifies the caller with `supabase.auth.getUser()` (through the cached `getAuthUser()`), never `getSession()`.
3. Checks membership, role and page access ([[Authorization]]).
4. Validates input (Zod and the `*-validation.ts` helpers).
5. Reads or writes, then calls `revalidatePath(...)` after a mutation.
6. Logs through a Pino child logger ([[Logging]]).

Actions return `{ error: code }` objects for expected failures; the code maps to a translated message (`serverErrors.*`).

Some server-only helpers deliberately are **not** `'use server'` files, because any exported function in a `'use server'` file becomes a publicly callable endpoint. That includes `feed-access.ts`, `member-access.ts`, `album-share.ts`, `notify.ts`, `storage.ts` and every `*-core.ts` module. They trust the ids they are given and must only be imported by server code that already authenticated the user.

## Route handlers only where actions don't fit

| Route | Why it isn't a Server Action |
|---|---|
| `POST /api/upload` | Streams large videos straight into Storage; buffering them in an action would exhaust memory. |
| `GET /api/storage/[babyId]/[...path]` | Serves bytes with HTTP Range so iOS Safari can play video. |
| `GET /api/realtime/[babyId]` | Long-lived Server-Sent Events stream. |
| `GET /api/share/[token]/[photoId]` | Public bytes for [[Share links]]. |
| `/api/mcp`, `/api/oauth/*`, `/.well-known/*` | External protocols ([[MCP server]], [[OAuth authorization server]]). |
| `/api/bug-reports/[...path]` | Screenshot bytes for [[Bug reports]]. |

Route handlers are excluded from `proxy.ts` and each one does its own auth, answering JSON errors instead of redirecting.

## URL as state

The baby context lives in the URL (`/baby/[babyId]/...`): `params` on the server, `useParams()` on the client. No React context or prop drilling for it.
