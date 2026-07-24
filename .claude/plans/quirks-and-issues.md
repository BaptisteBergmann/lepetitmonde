# Quirks & Issues Audit

## Context

A full read-through of the codebase (`docs/PROJECT_OVERVIEW.md` covers the resulting architecture) turned up a number of dead-code paths, half-finished features, and small correctness bugs — none of them exploitable security holes (those are tracked separately in `.claude/plans/security-review.md`), but worth working through since several silently produce wrong behavior. Grouped by area, roughly in priority order within each group. Each item lists the evidence so it can be re-verified before fixing.

## Status: items 0, 1, 2, 3, 4, 5, 6 fixed (item 1 needs a live confirm — see note); rest outstanding

---

## Correctness bugs

### 0. [High, fixed] `proxy.ts` (the auth-redirect middleware) never actually ran, in dev or production
Discovered while testing the fix for item 5 below: unauthenticated requests to any page (including `/`) returned `200` instead of the expected `307` redirect to `/login`, in both `next dev` and a real `next build` + `node .next/standalone/server.js` run (the exact mechanism the Docker image uses). Root cause: this project uses the `src/app` layout, and Next.js's build computes the required location for the `middleware.ts`/`proxy.ts` convention file as the *parent of the app directory* — i.e. `src/`, not the actual repository root. `proxy.ts` lived at the true repo root, so Next.js's file scan never found it; the emitted `middleware-manifest.json` had an empty `sortedMiddleware: []`. Confirmed by moving the file to `src/proxy.ts`, rebuilding, and seeing `ƒ Proxy (Middleware)` appear in the build's route table for the first time, plus real `307` redirects with a working `redirectTo` param on the standalone server.

**Impact**: not an auth bypass — every Server Component/Action still does its own `getUser()`/`getAuthUser()` check (confirmed via warn-logs like `"No authenticated user on settings page"`) — but the "bounce a logged-out user to `/login`" UX flow has silently never fired, on any deployment of this app to date. Logged-out users hitting a protected page got a broken/empty page shell instead of a redirect.
**Fix**: moved `proxy.ts` → `src/proxy.ts` (no content change beyond the item-6 fix below). Verified end-to-end against a real production standalone build.

### 1. [Fixed, needs a live confirm] Realtime relay subscribed to a `users` filter on a column that doesn't exist
`src/utils/supabase/realtime-relay.ts` opened a `postgres_changes` binding on `users` with `filter: baby_id=eq.${babyId}` — but `users` has no `baby_id` column (only `circles` and `circles_access` do; confirmed against `database.types.ts` and the baseline migration). Supabase Realtime silently drops/never-matches filters against nonexistent columns, so new-member and profile-update events never reached `RealtimeUsersList` on the admin page.
**Fix**: split into two bindings — `baby_access` filtered by the (real) `baby_id` column for membership changes (join/leave/access-level edits), which triggers `router.refresh()` in `RealtimeUsersList` since the payload doesn't carry the joined user profile; and an unfiltered `users` `UPDATE` binding for profile edits (name/nickname), applied client-side only if the user is already a known member of the list.
**Not verified live**: couldn't confirm from this environment whether `baby_access` is actually in the self-hosted instance's `supabase_realtime` publication (only the Kong gateway port was reachable, not Postgres directly). `docker/dev/data.sql`'s local dev seed only adds a leftover `profiles` table to the publication, not any of this app's real tables, so production's publication membership may have been configured manually and could differ. If events still don't show up after this fix, check with:
```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```
and `alter publication supabase_realtime add table baby_access, users;` if missing.

### 2. [Fixed] `getBaby()`'s `isAdmin` field is always `false`
`src/utils/actions/baby.ts` returned `{ ...baby, isAdmin: baby.owner_id === user.id }`, but `babies` has no `owner_id` column (only `id`, `created_at`, `baby_surname`). Confirmed dead code via grep (zero consumers read `.isAdmin` off a `getBaby()` result), so no live authorization gap existed.
**Fix**: deleted the field — `getBaby()` now returns the `baby` row as-is.

### 3. [Fixed in `882ff1a`] Invitation expiry is never checked at signup
`src/utils/actions/signup.ts` fetches the `invitations` row by `id = token` and only checks that it exists — `expires_at` is never compared against `now()`. Only the admin-facing `InvitationsList` UI treats an old link as "Expiré" (cosmetic only). An expired invite link can still be redeemed to create an account indefinitely.
**Fix direction**: add `.gt('expires_at', new Date().toISOString())` to the lookup in `signup()`, matching the same message shown for a missing/invalid token.

### 4. [Fixed] "Inviter par e-mail" doesn't send an email
`sendInvite` (`src/utils/actions/invite.ts`) inserted an `invitations` row exactly like `generateShortLivedLink` but never called anything from `src/utils/email.ts` (which only exported `sendWelcomeEmail`, sent post-signup, not pre-signup) — and never even read the `email` field the form already collected. The admin UI copy implied an email goes out; it just silently created a redeemable link nobody received.
**Fix**: added `sendInviteEmail` to `email.ts` (same `Resend` + `readFile`/`replaceAll` template pattern as `sendWelcomeEmail`) and a new `public/emails/invite-member.html` template styled like `welcome.html`. `sendInvite` now reads `email` from the form, builds the same `/signup?token=<id>` link `generateShortLivedLink` produces, and emails it with the baby's name for context.

### 5. [Fixed] `redirectTo` query param is set but never consumed
`src/utils/supabase/middleware.ts` redirects unauthenticated users to `/login?redirectTo=<path>`, but `src/utils/actions/login.ts`'s `login()` action ignored form/query state entirely and always `redirect('/')` on success. A user who got bounced from a deep link (e.g. a notification pointing at a specific post) landed on the baby picker instead of back where they were headed.
**Fix**: `redirectTo` is now threaded through `login/page.tsx` → a hidden field in `login-form.tsx` → `login()`, which redirects there on success (and preserves it across a failed-login retry). Guarded against open redirects: only same-origin relative paths are honored (`//evil.com` and `/\evil.com` are rejected). Only actually exercisable once item 0 above was fixed — before that, the middleware which sets `redirectTo` never ran.

### 6. [Fixed] Unauthenticated API requests get an HTML redirect, not a JSON error
`proxy.ts`'s matcher didn't exclude `/api/*`, so `updateSession()` would run for API routes too — though this turned out to be moot in practice until item 0 above was fixed, since the middleware wasn't running at all. Still worth excluding for correctness once middleware is live: an unauthenticated `fetch('/api/upload')` should get the route handler's own JSON `401` (`{ error: 'Non authentifié' }`), not an HTML redirect it can't `res.json()`.
**Fix**: added `api` to the negative-lookahead in `proxy.ts`'s matcher. Verified on a real production build: unauthenticated `POST /api/upload` returns `401` JSON, while `/` and `/baby/[id]/feed` correctly redirect to `/login?redirectTo=...`.

---

## Half-finished / placeholder features

### 7. "The Gazette" (newsletter) is advertised but not built
`README.md` lists it as a key feature; the only code trace is a hardcoded `enabled: false` entry in `src/app/_header/header.tsx`'s `pages` array. No route, no digest/cron logic, no email template beyond the one-off welcome email. Either scope and build it, or adjust the README so it doesn't read as a shipped feature.

### 8. Login is password-based, not "Magic Link" as the README claims
`src/utils/actions/login.ts` uses `supabase.auth.signInWithPassword` exclusively. The OAuth buttons in `login-form.tsx`/`signup-form.tsx` ("Continue with Apple/Google/Meta") are inert (`type="button"`, no handler, no provider configured server-side). Decide whether to implement magic-link/OAuth or update the README to describe the actual email+password flow, and remove or wire up the dead OAuth buttons.

### 9. `src/app/profile/page.tsx` is a near-empty stub
Contains a literal placeholder ("bonjour") and a link to `/settings`. Either build it out (if it's meant to be distinct from Settings) or remove the route/nav entry if Settings already covers everything it was meant to.

### 10. `circles.parent_circle` is unused dead schema
The self-referencing FK for circle hierarchy exists in the baseline migration but is never read or written by any app code (confirmed by grepping outside generated types). Either build the hierarchy feature it implies, or drop the column in a follow-up migration to stop it being a red herring for future readers.

---

## Minor / cosmetic

### 11. Duplicate service worker registration
`src/app/settings/pwaRegistry.tsx` and `usePushSubscription()` both call `navigator.serviceWorker.register('/sw.js')` independently. Harmless (registration is idempotent) but worth consolidating into one call site to avoid confusion later.

### 12. `public/sw.js` and `src/worker/index.ts` must be kept manually in sync
They're byte-identical today with no build step enforcing it (confirmed via diff). A future edit to one and not the other will silently desync. Consider a `pnpm build`-time copy step or a comment at the top of each file pointing at the other.

### 13. No automated tests
No test framework is configured anywhere in `package.json`/the app (only unrelated `docker/tests/*.yml` fixtures for the separate self-hosted Supabase bundle). Not necessarily wrong for a small self-hosted family project, but worth an explicit decision rather than an accidental gap — at minimum the visibility-filtering logic (`withVisibility()` in posts/events) and the guess-approval state machine are exactly the kind of pure logic that regresses silently without tests.

### 14. Quiet hours are one global window per user, not per baby
`notification_settings` is keyed only on `user_id` (not `(user_id, baby_id)`), and the timezone is hardcoded to Europe/Paris in `notify.ts`. Fine for the current single-family, single-timezone deployment; would need a schema change if the app is ever used by a family spread across timezones or managing babies with different notification preferences.

### 15. New `notification_type` enum values default to "on" for everyone
`notification_preferences` is a sparse opt-out table (a row means *disabled*), so adding a new notification type in a future migration silently turns it on for every existing user with no opt-in step. Worth a deliberate decision each time a new type is added (e.g. a backfill migration that pre-opts-out existing users) rather than relying on the default.

---

## Feature ideas

### 16. Prioritize loading images closest to the viewport
Feed (`post_card.tsx:102-110`) and calendar day cells (`calendar_view.tsx:183`) both render photos as plain `<img loading="lazy" decoding="async">` — no Next.js `<Image>` (images are served through the app's own storage-proxy route, not the Next image optimizer). Native `loading="lazy"` already defers offscreen images, but gives no control over *ordering* among the images the browser decides are near-viewport — on a long scroll, images just about to enter view compete evenly with ones further down. Idea: give the browser an explicit priority hint (e.g. `fetchpriority="high"` on the first row of photos, or an `IntersectionObserver`-driven approach that bumps priority as an image approaches the viewport) so the images the user is about to see win the fetch queue over ones several screens away. Would touch `post_card.tsx` and `calendar_view.tsx`; no backend change needed.

---

## Suggested order of attack
Items 3 and 6 are the cheapest fixes with the clearest user-facing benefit (real auth-adjacent correctness). Item 1 (realtime `users` filter) is worth confirming with a manual test (add a member, watch the admin page without refreshing) before spending time on a fix. Items 7–10 are product decisions as much as engineering ones — worth a quick conversation about whether to build or prune them before touching code.
