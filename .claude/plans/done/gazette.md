# Gazette — automated newsletter digest (free, ungated)

## Context

The Gazette is one of the app's headline features per `README.md`, but it's never been built — it's just a disabled nav stub (`{ id: "news", name: "Newsletter", role: "viewer", enabled: false }` in `src/app/_header/header.tsx:28`). This plan builds it as a real, working feature available to everyone with baby access, no payment involved. A follow-up plan (`gazette-monetization.md`) will gate it behind a paid subscription once this ships and is verified — do not add any Stripe/paywall code here.

## Phase 1 — Per-recipient visibility for digests

`getPostsForRange()` in `src/utils/actions/posts.ts` calls `withVisibility()` → `getAuthUser()`, i.e. it's bound to the current request's session. A cron job has no session, and a multi-recipient digest needs **per-recipient** visibility (an admin and a circle-restricted viewer legitimately see different posts in the same digest run). So:
- Refactor the visibility rule out of `withVisibility()` into a pure `filterVisiblePosts(posts, { isAdmin, circleIds })` helper (no I/O) — reused by both the existing session-based path and a new one.
- Add `getPostsForRangeAsMember(babyId, from, to, { isAdmin, circleIds })` using that filter + the service-role client.

## Phase 2 — Email template + sender

- New `public/emails/gazette-digest.html`, following the existing `{{PLACEHOLDER}}` string-substitution convention used by `invite-member.html`.
- New `sendGazetteDigestEmail()` in `src/utils/email.ts`, same `Resend` + `readFile` shape as `sendWelcomeEmail`/`sendInviteEmail`.

## Phase 3 — Opt-out

- Migration adding `'gazette_digest'` as a new `notification_type` enum value, reusing the existing notification-preferences table/pattern rather than a parallel mechanism.

## Phase 4 — Cron trigger

- New `src/app/api/cron/gazette/route.ts` (`GET`, `dynamic = 'force-dynamic'`), guarded by a shared secret header (`x-cron-secret` vs. `CRON_SECRET` env var, 401 on mismatch). For every baby:
  1. `since = last_sent_at ?? now - 7 days` — needs a `last_sent_at` column; add `last_gazette_sent_at timestamptz` directly to `babies` (there's no subscription table in this plan — `gazette-monetization.md` can migrate this onto `baby_subscriptions` later if that turns out cleaner).
  2. Per `baby_access` row: resolve circle membership, call `getPostsForRangeAsMember`, skip if nothing visible in the window.
  3. Resolve recipient email via `supabase.auth.admin.getUserById(userId)` — new capability, nothing today queries `auth.users` directly (emails aren't in `public.users`).
  4. Skip recipients with a `'gazette_digest'` opt-out row.
  5. Send, then update `babies.last_gazette_sent_at` once per baby after all recipients are processed (not per-recipient, so the window doesn't drift).
  6. Return a JSON summary, logged via `logger.child({ function: 'GET', route: '/api/cron/gazette' })`.
- **Trigger mechanism**: no scheduler exists in this self-hosted Docker/Portainer deployment (not Vercel — no Vercel Cron). Simplest viable: a host crontab entry (`curl -fsS -H "x-cron-secret: $CRON_SECRET" https://.../api/cron/gazette`, daily) on the Proxmox/Docker host already controlled. Fall back to a tiny `alpine`+`crond` sidecar in `docker-compose.portainer.yml` only if host crontab access isn't available — don't ship both, don't build a job queue.
- New env var `CRON_SECRET`, added to `mise.toml [env]`, `.env.docker.example`, both compose files' `environment:` blocks.

## Phase 5 — UI

- `header.tsx`: flip the existing `"news"` entry to `enabled: true`, rename id to `"gazette"`, route to `/baby/${babyId}/gazette`.
- `src/app/baby/[babyId]/gazette/page.tsx` (Server Component) + `_components/gazette_settings.tsx`: shows last-sent date and the opt-out toggle (reusing the existing notification-preferences toggle UI). No paywall/upsell in this plan — everyone with baby access sees this.

## Critical files
- `src/app/_header/header.tsx`
- `src/utils/actions/posts.ts` (`withVisibility`, `getPostsForRange`)
- `src/utils/email.ts`
- `src/utils/actions/access.ts` (reused for the settings page's admin-only bits, if any)

## Verification
- Cron route: wrong secret → 401; correct → 200 + JSON summary.
- Seed a baby with posts dated within 7 days, run the cron route, confirm exactly one email per eligible member (respecting circle visibility) and `last_gazette_sent_at` updates; re-run immediately, confirm no duplicate send.
- Opt-out: a member with a `'gazette_digest'` preference row is skipped.
- Two babies, run the cron route, confirm no cross-baby leakage in digest content.
