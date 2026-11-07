---
tags: [lepetitmonde/architecture]
---

# Tech stack

Up: [[Le petit monde]] · See also [[Architecture overview]]

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19 | `output: "standalone"` for the Docker image. Middleware is `src/proxy.ts` (Next 16 rename). |
| Language | TypeScript, strict | `pnpm typecheck` runs `tsc --noEmit`. |
| Database | Supabase Postgres | Hand-written SQL migrations, no ORM. See [[Database migrations]]. |
| Auth | Supabase Auth via `@supabase/ssr` | Cookie sessions. See [[Authentication]]. |
| Files | Supabase Storage | One bucket per baby. See [[Storage and media]]. |
| Live updates | Supabase Realtime, relayed as SSE | See [[Realtime]]. |
| Validation | Zod 4 | Plus hand-written limits in `utils/*-validation.ts`, `input-limits.ts`. |
| UI | Tailwind CSS v4, Shadcn UI, Base UI, Lucide icons | `cn()` in `src/utils/utils.ts`. See [[UI system]]. |
| Dates | date-fns, react-day-picker | Times are stored UTC; the display zone comes from a `tz` cookie. |
| i18n | next-intl | `messages/fr.json`, `messages/en.json`. See [[Internationalization]]. |
| Images | sharp, heic-convert | Thumbnails, EXIF handling, HEIC → JPEG. |
| Push | web-push (VAPID) | See [[Notifications pipeline]]. |
| Email | Resend | Invitations, broadcast, transactional mail. |
| AI integration | `mcp-handler`, `@modelcontextprotocol/server` | See [[MCP server]]. |
| Logging | Pino (+ pino-pretty in dev) | See [[Logging]]. |
| Screenshots | html2canvas-pro | For [[Bug reports]]. |
| Tooling | pnpm, mise, ESLint | mise pins Node and injects env vars. See [[Local development]]. |

There is no test framework configured; verification relies on typecheck, lint, `pnpm build` and the reviewer agent.
