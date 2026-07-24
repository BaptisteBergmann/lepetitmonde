# Baby Journal ("Le petit monde") — Project Overview

A private, self-hosted family app for sharing a child's milestones (photos, videos, anecdotes, a birth-guessing game, a calendar) with a small, invite-only circle of relatives. Built with Next.js (App Router) + self-hosted Supabase. See the root `README.md` for local dev and deployment instructions, and `CLAUDE.md` for the architectural rules this codebase follows.

This document covers **project structure**, **features**, and **code structure/architecture**. For known bugs, quirks, and tech debt, see `.claude/plans/quirks-and-issues.md`. For the security posture, see `.claude/plans/security-review.md`.

---

## 1. Project Structure

```
src/
  app/                          # Next.js App Router
    (auth)/                     # Route group: login, signup, forgot-password (public)
    auth/confirm/                # Supabase OTP/recovery link callback
    api/                        # API routes (upload, storage proxy, realtime SSE, bug-report screenshots)
    baby/[babyId]/              # Everything scoped to one baby's journal
      feed/                     # Timeline: posts, comments, reactions, polls
      calendar/                 # Month-grid view of events + posts
      guess/                    # Birth-guessing game ("Pronostics")
        admin/                  # Approve/reject/reorder guess questions
      admin/                    # Circles, invitations, members, bug reports
      onboarding/               # Post-signup profile + push-notification opt-in
    profile/, settings/         # Account settings, notification prefs, PWA install
    _header/, _home/            # Shared header/nav, logged-out landing page
  components/                   # Shared React components (forms, dropzone, ui/ = shadcn primitives)
  utils/
    actions/                    # Server Actions ('use server') — all mutations + most reads
    supabase/                   # Supabase client factories (server, admin, middleware, realtime relay)
    hooks/                      # Client hooks (push subscription, realtime SSE)
    *.ts                        # logger, email, reactions, users, video-thumbnail, changelog, webpush
  worker/index.ts               # Source of truth for the PWA service worker (mirrored to public/sw.js)
supabase/migrations/            # Hand-written SQL migrations (schema, no RLS — see security review)
public/                         # Static assets, PWA icons/screenshots, transactional email HTML templates
docker/                         # Self-hosted Supabase stack config (gitignored; not vendored in this repo)
.claude/plans/                  # Feature plans (per-feature .md files; done/ once shipped)
```

**Path aliases** (`tsconfig.json`): `@/*` → `src/*`, `@utils/*` → `src/utils/*`, `@components/*` → `src/components/*`.

**Tooling**: pnpm, mise (Node/tool versions + env vars, see `mise.toml`, gitignored), ESLint, strict TypeScript, no test framework currently configured.

---

## 2. Features

### 2.1 Feed ("Journal") — `baby/[babyId]/feed/`
The main timeline. Admins create posts (`create_post_modal.tsx`) with a caption, a `taken_at` date, up to 10 photos/videos (drag-and-drop via `Dropzone`, 500MB/file), an optional 2–6-option poll, and a "visible to" circle multi-select (empty selection = admin-only). Non-admin members see only posts whose circles intersect their own circle memberships.

Each post supports:
- **Comments** — any member can comment; a comment's visibility is a snapshot of the commenter's circles at write time, not derived live from the post.
- **Reactions** — one of 5 fixed emoji per user per post (`src/utils/reactions.ts`), notifies the post author.
- **Polls** — zero-or-one per post, 2–6 free-text options, one (re-votable) vote per user; locked from editing once it has votes.
- **View tracking** — an `IntersectionObserver` marks a post "seen" per user; admins see a "seen by" list/count and a stats modal (views + reaction/comment breakdown).
- **Photo lightbox** — custom full-screen viewer (pinch/double-tap zoom, swipe, keyboard nav) for mixed photo/video carousels.

### 2.2 Guessing game ("Pronostics") — `baby/[babyId]/guess/`
A game for guests to predict details about the baby (birth date, name, weight, etc.) before/after birth.
- **Question types**: date, number (with min/max/precision), free text, time, single-choice options — one picker component per type under `guess/_components/picker/`.
- **Guess-once**: a submitted guess is final and cannot be changed (unique per user per question).
- **Member proposals**: any member can propose a question (title/description only); it lands as `pending` for an admin to approve — the admin fills in the type/options during approval. Admin-authored questions publish immediately. Rejected proposals stay visible to their author with a "Refusée" badge.
- **Admin controls** (`guess/admin/`): approve/reject/edit pending proposals, manually reorder questions, delete a question (blocked once it has any guesses).

### 2.3 Calendar — `baby/[babyId]/calendar/`
A month-grid view combining **events** (custom or milestone-typed: first steps, first tooth, first word, first smile, first laugh, birthday, other) and feed posts (as day thumbnails). Same circle-based visibility model as posts. Clicking a day opens a sheet with that day's full posts/events; admins can create/edit events and milestones from here (milestones trigger a notification).

### 2.4 Admin — "Cercles & accès" — `baby/[babyId]/admin/`
Admin-only management console:
- **Invitations** — generate a shareable, time-limited (24h) signup link (`generateShortLivedLink`); a separate "invite by email" action creates the same kind of row but currently does not send an email.
- **Circles** — create circles and manage per-circle membership; used to scope who sees which posts/events.
- **Members** — view all members, change access level (`admin`/`viewer`) with last-admin-removal protection, send a manual test push notification per member.
- **Bug reports** — review reports submitted via the floating bug-report button, with screenshot preview and status transitions (`new` → `reviewed` → `fixed`, the last one notifies the reporter).

Member/circle lists update live via the realtime relay (see §3.3 below).

### 2.5 Onboarding — `baby/[babyId]/onboarding/`
A two-step flow shown once, right after signup: (1) nickname + relation-to-baby, (2) push-notification opt-in (with an "Add to Home Screen" fallback card on iOS, where push requires a home-screen install). Not re-enforced if skipped.

### 2.6 Settings & Profile
`settings/` holds account info (avatar initials, email, logout) and a generic push-notification subscribe/test card. Per-notification-type opt-out and quiet-hours configuration live in the header's notification bell popover instead (`_header/notification_bell.tsx`), not in settings. `profile/` is currently a near-empty placeholder page.

### 2.7 Notifications
A single pipeline (`notifyUsers`, `src/utils/actions/notify.ts`) drives every notification type (`new_post`, `new_comment`, `new_pronostic`, `new_member`, `new_reaction`, `new_milestone`, `circle_access_granted`). For each event it: writes an in-app inbox row (always, regardless of push state), skips users who opted out of that type for that baby, skips users currently in their per-user quiet-hours window (Europe/Paris, hardcoded), then sends a Web Push to every registered device of the remaining recipients — pruning subscriptions that come back 404/410 (expired). A notification failure never throws; it's logged and swallowed so it can't break the action that triggered it. The bell icon shows the in-app inbox with unread counts and click-to-navigate.

### 2.8 Realtime
Live UI updates (currently: the admin page's member/circle lists) are delivered over **Server-Sent Events** from `GET /api/realtime/[babyId]`, not a direct browser-to-Supabase WebSocket. A server-side singleton relay (`src/utils/supabase/realtime-relay.ts`) opens one Supabase Realtime channel per `babyId` (service-role client) and fans it out to every subscribed SSE connection for that baby, tearing the upstream channel down only once the last listener disconnects. The API route authenticates and checks baby membership before subscribing.

### 2.9 Media / storage
Each baby gets its own Supabase Storage bucket (named after the baby's UUID), created lazily on first post. Uploads go through `POST /api/upload` (not a Server Action — large video uploads would OOM the container if buffered in memory there), which streams the request body straight into Storage via the service-role client, after re-checking the uploader is an admin of that baby. HEIC/HEIF photos (iPhone default format) are transparently converted to JPEG server-side. Video posts get a client-side-captured JPEG thumbnail uploaded alongside the video. Reads go through `GET /api/storage/[babyId]/[...path]`, which proxies bytes through the app's own HTTPS origin (a raw Supabase signed URL would point at an internal LAN host and get blocked as mixed content) and implements HTTP Range requests so iOS Safari will play `<video>`.

### 2.10 Bug reporting
A floating button (present app-wide) captures a screenshot of the current page (`html2canvas-pro`) plus a free-text description and submits it via a Server Action. Screenshots are stored in a shared (non-baby-scoped) bucket and served through a dedicated proxy route gated on "admin of any baby."

### 2.11 PWA
Installable on iOS/Android home screens (`src/app/manifest.ts`). The service worker (`src/worker/index.ts`, mirrored byte-for-byte to `public/sw.js` — no build step, no offline caching) only handles push display and notification-click-to-open. `InstallCard` gives platform-specific install instructions (native prompt on Chrome/Android, manual Share-sheet instructions on iOS).

### 2.12 Not yet built
- **The Gazette** (automated email newsletter/digest) — advertised in the README, but only a disabled (`enabled: false`) nav stub exists in the header; no digest logic, cron job, or route.
- OAuth login ("Continue with Apple/Google/Meta") — buttons exist in the login/signup forms but are inert (no handler, no provider configured).

---

## 3. Code Structure & Architecture

### 3.1 Server/client split
Per `CLAUDE.md`: Server Components by default; `'use client'` only for interactivity (forms, realtime, lifecycle). All reads and writes go through **Server Actions** in `src/utils/actions/*.ts` (`'use server'`), each of which independently re-verifies the caller via `supabase.auth.getUser()` — never `getSession()` — before doing anything. There is no tRPC/REST-style API layer for app data; the four routes under `src/app/api/` exist only where a Server Action doesn't fit (raw byte streaming for upload/download, Server-Sent Events for realtime).

### 3.2 Authorization model
Authorization is enforced **entirely in application code**, not in Postgres:
- `src/utils/actions/access.ts` — `assertIsAdmin(supabase, babyId)` (throws unless the caller is an `admin` in `baby_access` for that baby) and helper functions (`getVisibleUserIds`, `getAllBabyMemberIds`, `getBabyAdminIds`) used to compute notification recipients.
- `src/utils/actions/users.ts` — `getUserAccess(babyId)` (the caller's own `baby_access` row, memoized per-request via React `cache()`) is the primitive nearly every page/action uses to decide what a user may see.
- **Circle-based content visibility** (posts, events) is *not* a SQL filter — it's computed in JS (`withVisibility()` in `posts.ts`, inline in `events.ts`) after fetching all rows for the baby: a post/event with no circle attached is admin-only; otherwise visible to admins plus anyone whose `circles_access` intersects the post's/event's circles.
- Comments are the one exception: visibility is captured as a `circle_ids` snapshot on the comment row at write time, not derived from the parent post's current circles.

See `.claude/plans/security-review.md` for the implications of having no database-level RLS as a backstop to this model.

### 3.3 Data layer
- **Supabase client factories** (`src/utils/supabase/`):
  - `server.ts` — cookie-based SSR client (`SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`, server-only env vars, no `NEXT_PUBLIC_` prefix) for use in Server Components/Actions.
  - `admin.ts` — service-role client, used exclusively for Storage operations (no storage RLS is defined, so this is the only way to read/write buckets) and for the realtime relay's upstream channel. Never exposed to the browser.
  - `middleware.ts` — `updateSession()`, invoked from the project's `proxy.ts` (Next.js 16's rename of `middleware.ts` at the app root) on every route except static assets; refreshes the session cookie, redirects unauthenticated users to `/login?redirectTo=...`, and bounces authenticated users away from `/login`, `/signup`, `/forgot-password`.
  - `realtime-relay.ts` — the server-side SSE fan-out singleton described in §2.8.
  - `auth.ts` — `getAuthUser()`, a `cache()`-wrapped `supabase.auth.getUser()` to dedupe repeat calls within one request without skipping re-verification.
  - `database.types.ts` — generated types (`mise run update_types`); all action code types against `Tables<'...'>` / `Enums<'...'>` rather than hand-rolled interfaces, per `CLAUDE.md`.
- There is **no browser-side Supabase client** anywhere in the codebase (`'use client'` components call Server Actions, not `@supabase/supabase-js` directly) — the anon/publishable key never reaches the browser bundle.

### 3.4 Database schema (`supabase/migrations/`)
16 hand-written, chronologically timestamped migrations (`mise run db_migration_new`), applied via `mise run db_push`. No ORM. Core tables:

| Table | Purpose |
|---|---|
| `babies` | One row per child/journal |
| `baby_access` | Who belongs to which baby, at `admin`/`viewer` level (composite PK) |
| `circles`, `circles_access` | Sub-groups within a baby used to scope content visibility |
| `posts`, `post_photos`, `post_comments`, `post_reactions`, `post_views`, `posts_circles` | Feed content |
| `polls`, `poll_options`, `poll_votes` | Embedded post polls |
| `events`, `events_circles` | Calendar entries (custom or milestone) |
| `guess_questions`, `guesses` | The guessing game |
| `invitations` | Time-limited signup tokens |
| `push_subscriptions` | One row per registered device, keyed by unique push `endpoint` |
| `notifications`, `notification_preferences`, `notification_settings` | In-app inbox, per-type opt-out, per-user quiet hours |
| `bug_reports` | Bug report submissions (not baby-scoped) |
| `users` | App-level profile, 1:1 with `auth.users` |

### 3.5 Logging
Pino (`src/utils/logger.ts`) — pretty-printed debug logs in dev, structured JSON at info level in prod. Every Server Action/route creates a child logger with call-site context (`logger.child({ function: fnName, babyId, ... })`) per `CLAUDE.md` convention; `console.log` is not used.

### 3.6 UI
Tailwind CSS v4 + Shadcn UI (`components.json`, base color `neutral`, icon library Lucide) + Framer-Motion-free custom animations (`src/components/reveal.tsx` for scroll-triggered fades). `src/utils/utils.ts` exports the standard `cn()` helper (clsx + tailwind-merge). Custom touch interactions (pull-to-refresh, pinch-zoom lightbox) are hand-rolled rather than pulled from a library.

### 3.7 Build & deploy
Multi-stage `Dockerfile` (deps → build → standalone runner, non-root user) produces a multi-arch image pushed to a private registry (`mise run docker_build_push`) and deployed via a Portainer stack (`docker-compose.portainer.yml`) that pulls the image and injects runtime-only secrets (`SUPABASE_URL`, `SERVICE_ROLE_KEY`, VAPID keys, etc.) as environment variables. `NEXT_PUBLIC_*` values are baked in at build time via `--build-arg`. See `README.md` for the full command and troubleshooting notes (insecure-registry config, etc.).
