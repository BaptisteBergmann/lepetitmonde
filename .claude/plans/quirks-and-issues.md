# Quirks & Issues Audit

## Context

A full read-through of the codebase (`docs/PROJECT_OVERVIEW.md` covers the resulting architecture) turned up a number of dead-code paths, half-finished features, and small correctness bugs — none of them exploitable security holes (those are tracked separately in `.claude/plans/security-review.md`), but worth working through since several silently produce wrong behavior. Grouped by area, roughly in priority order within each group. Each item lists the evidence so it can be re-verified before fixing.

## Status: item 3 fixed in `882ff1a`; rest outstanding

---

## Correctness bugs

### 1. Realtime relay subscribes to a `users` filter on a column that doesn't exist
`src/utils/supabase/realtime-relay.ts` opens a `postgres_changes` binding on `users` with `filter: baby_id=eq.${babyId}` — but `users` has no `baby_id` column (only `circles` and `circles_access` do; confirmed against `database.types.ts` and the baseline migration). Supabase Realtime silently drops/never-matches filters against nonexistent columns, so **new-member and profile-update events likely never reach `RealtimeUsersList`** on the admin page — members would need a manual page refresh to see a new signup appear, contradicting the apparent intent of wiring it into the realtime relay at all.
**Fix direction**: either drop the `baby_id` filter on the `users` binding and filter client-side by cross-referencing `circles_access`/`baby_access`, or bind on `baby_access` instead (which does have `baby_id` and is the table that actually changes when someone joins).

### 2. `getBaby()`'s `isAdmin` field is always `false`
`src/utils/actions/baby.ts` returns `{ ...baby, isAdmin: baby.owner_id === user.id }`, but `babies` has no `owner_id` column (only `id`, `created_at`, `baby_surname`). This is dead/broken code — real admin checks elsewhere correctly go through `baby_access.access_level` via `getUserAccess`/`assertIsAdmin`, so it doesn't appear to cause a live authorization gap. Grep for consumers of `.isAdmin` on a `getBaby()` result before removing it — if unused, delete the field; if something reads it expecting real admin status, that call site has a live bug.

### 3. [Fixed in `882ff1a`] Invitation expiry is never checked at signup
`src/utils/actions/signup.ts` fetches the `invitations` row by `id = token` and only checks that it exists — `expires_at` is never compared against `now()`. Only the admin-facing `InvitationsList` UI treats an old link as "Expiré" (cosmetic only). An expired invite link can still be redeemed to create an account indefinitely.
**Fix direction**: add `.gt('expires_at', new Date().toISOString())` to the lookup in `signup()`, matching the same message shown for a missing/invalid token.

### 4. "Inviter par e-mail" doesn't send an email
`sendInvite` (`src/utils/actions/invite.ts`) inserts an `invitations` row exactly like `generateShortLivedLink` but never calls anything from `src/utils/email.ts` (which only exports `sendWelcomeEmail`, sent post-signup, not pre-signup). The admin UI copy implies an email goes out; today it just creates a redeemable link with no delivery mechanism and no way for the admin to retrieve/share it afterward (unlike `generateShortLivedLink`, which returns the URL for copying).
**Fix direction**: either wire an actual "you're invited" email (new Resend template) or rename the UI/action to match what it does (e.g. fold it into the copy-link flow and drop the separate "by email" entry point).

### 5. `redirectTo` query param is set but never consumed
`src/utils/supabase/middleware.ts` redirects unauthenticated users to `/login?redirectTo=<path>`, but `src/utils/actions/login.ts`'s `login()` action ignores form/query state entirely and always `redirect('/')` on success. A user who got bounced from a deep link (e.g. a notification pointing at a specific post) lands on the baby picker instead of back where they were headed.
**Fix direction**: read `redirectTo` from the login form's hidden field (would need adding) or searchParams and redirect there after a successful `signInWithPassword`, with a same-origin check against open-redirect (only allow relative paths).

### 6. Unauthenticated API requests get an HTML redirect, not a JSON error
`proxy.ts`'s matcher doesn't exclude `/api/*`, so `updateSession()` runs for API routes too. An unauthenticated `fetch('/api/upload')` (or `/api/storage/...`, `/api/realtime/...`) gets a 307 redirect to `/login` **before** the route handler's own `getAuthUser()` check ever runs — meaning that check is currently unreachable dead code for the "no session" case, and any client-side code expecting a `401` JSON body (`{ error: 'Non authentifié' }`) instead gets redirected and likely fails on `res.json()` parsing HTML. Not a security gap (still blocked), just an inconsistent failure mode.
**Fix direction**: exclude `/api` from the `proxy.ts` matcher (or from the redirect branch specifically) and let each route's own `getAuthUser()`/`getUserAccess()` checks be the sole gate, returning proper JSON errors.

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

## Suggested order of attack
Items 3 and 6 are the cheapest fixes with the clearest user-facing benefit (real auth-adjacent correctness). Item 1 (realtime `users` filter) is worth confirming with a manual test (add a member, watch the admin page without refreshing) before spending time on a fix. Items 7–10 are product decisions as much as engineering ones — worth a quick conversation about whether to build or prune them before touching code.
