---
tags: [lepetitmonde/architecture]
---

# Architecture overview

Up: [[Le petit monde]]

Le petit monde is a single Next.js application (App Router, React 19, strict TypeScript) running in one Docker container, in front of a self-hosted Supabase stack (Postgres, Auth, Storage, Realtime, behind the Kong gateway). There is no separate backend service: the Next.js server *is* the backend.

```mermaid
flowchart LR
  subgraph Clients
    B[Browser / installed PWA]
    AI[MCP clients<br/>Claude, Gemini CLI]
    V[Anonymous visitor<br/>with a share link]
  end

  subgraph App["Next.js container"]
    P[proxy.ts<br/>session refresh + redirects]
    RSC[Server Components<br/>app/baby/[babyId]/...]
    SA[Server Actions<br/>utils/actions/*.ts]
    CORE[Core modules<br/>utils/*-core.ts]
    API[Route handlers<br/>/api/upload, /api/storage,<br/>/api/realtime, /api/share]
    MCP[/api/mcp + /api/oauth/*/]
    RELAY[Realtime relay<br/>singleton]
  end

  subgraph Supabase
    AUTH[Auth / GoTrue]
    PG[(Postgres)]
    ST[(Storage<br/>one bucket per baby)]
    RT[Realtime]
  end

  PUSH[Web Push services]
  MAIL[Resend email]

  B --> P --> RSC
  B -- form / action calls --> SA
  B -- uploads, media, SSE --> API
  AI --> MCP
  V --> API
  RSC --> SA
  SA --> CORE
  MCP --> CORE
  SA & CORE --> PG
  SA --> AUTH
  API --> ST
  RT --> RELAY --> API
  SA --> PUSH
  SA --> MAIL
```

## Key ideas

1. **Server-first.** Pages are Server Components that fetch data through Server Actions. Client Components only exist for interactivity. See [[Server and client split]].
2. **No Supabase client in the browser.** The browser never talks to Supabase directly. Every read and write goes through the Next.js server, which holds the keys. Media goes through a streaming proxy ([[Storage and media]]) and live updates through Server-Sent Events ([[Realtime]]).
3. **Everything is scoped to a baby.** URLs look like `/baby/[babyId]/feed`. The `babyId` from the URL is the context for every action, checked against the caller's membership ([[Authorization]]).
4. **Defense in depth, in progress.** Authorization is enforced in application code for every request. Postgres [[Row Level Security]] is enabled on the newer tables and is being rolled out to the rest.
5. **One rule, two entry points.** The web app (cookie session) and the [[MCP server]] (bearer token) call the same [[Core modules]], so a permission rule can't drift between them.
6. **Self-hosted, single container.** In-memory rate limits and caches are fine because there is one app process per stack. See [[Build and deploy]].

## Request paths

| Caller | Entry | Auth | Supabase client |
|---|---|---|---|
| Logged-in page view | `proxy.ts` → Server Component | Session cookie, `getUser()` | Cookie-bound server client |
| Mutation from the UI | Server Action | Session cookie, `getUser()` | Cookie-bound server client |
| Upload / media read | `/api/upload`, `/api/storage/...` | Session cookie + membership check | Service role (storage only) |
| Live updates | `/api/realtime/[babyId]` (SSE) | Session cookie + membership check | Service role (relay upstream) |
| AI client | `/api/mcp` | Bearer token (`lpm_` or `lpma_`) | Service role + per-call checks in cores |
| Share link visitor | `/share/[token]`, `/api/share/...` | The token itself | Service role, scoped by hand |

Related: [[Data model]], [[Security model]], [[Tech stack]].
