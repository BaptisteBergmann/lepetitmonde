# Security fixes: auth, sessions, invitations and share-token logging

## Status: implemented

All 12 steps shipped on `main` (2651814 to b29fcfa, plus the docs commits). Steps 1-4 and 8-10 follow the plan; Steps 5-6 were reviewer-approved earlier. Deviations:

- Step 7 (`f940f96`): the `users:used_by` embed is typed as an array by the generated types but PostgREST returns an object for this many-to-one relation, so `display_invitations.tsx` accepts both. Statuses use one `now` captured in state (refreshed on revoke) to satisfy the React purity lint rule. Optimistic revoke with rollback, `useConfirm` and a dedicated `revokeError` key as designed.
- `auth.invalidOrExpiredLink` is reworded to "This link is invalid, has expired or was already used." (and the French equivalent) rather than "invitation link", because `auth/confirm` shows the same key for reset and email links.
- Step 11 (`b29fcfa`): `changePassword` returns `{ error: code }` for failures and redirects to `/login` only on success (designer recommendation, accepted). The form uses `onSubmit` instead of a form action, because React resets uncontrolled fields after an action and would wipe the new-password fields on error. The three login limiters moved from `login.ts` into `src/utils/login-limiters.ts` so both actions share them (a `'use server'` file cannot export non-async values). The current password is verified with `signInWithPassword`, which rotates the session cookie; the action signs out right after anyway. The password hint appears under the settings new-password field only (`settingsPage.account.passwordHint`); `auth.signup.passwordHint` and `auth.resetPassword.passwordHint` were not added.
- Not verified at runtime: the UI flows (revoke, wrong current password, throttling) were typechecked and linted but not exercised in a browser.
- Manual, user side (not done by the builder): on the Supabase stack set `GOTRUE_PASSWORD_MIN_LENGTH=10`, `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT=720h` and `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true`, then restart auth. Per-IP throttling is only reliable once L9 (app port bind) is deployed.

Status: draft
Approved by:

Updated 2026-10-23 with `.claude/plans/security-plan-review.md` (items 7-14, the
`updatePassword` reauthentication item, recommended order).

## Goal
Fix seven findings from `.claude/plans/security-findings.md` (2026-10-23 audit): session cookie
hardening (M2), the `/auth/confirm` open redirect (M3), share tokens leaking into web-vitals logs
and bug reports (M4), reusable/unrevocable invitation links (M7), weak passwords and no
login/reset throttling (L2), unescaped values in emails (L4) and the `Origin`-based reset
`redirectTo` (L15). Also require the current password to change a password from account
settings (review). Affects every signed-in family member (cookies, password rules), admins
(invitations) and anonymous share-link visitors (logs).

## Out of scope
- M5 (vitals env gate, body size cap). Step 4 defines the field whitelist (enums below) because
  it has to rebuild the log line to drop the raw path. `security-hardening.md` Step 2 adds only
  the env gate, the 413 response and the byte-capped read on top.
- L1 (unbounded TTL caches) beyond making the new rate-limit store bounded.
- L14 (pino `redact`). Step 4 sanitises the vitals path at the source instead.
- L5 (bug report `page_url` validation and display). `security-hardening.md` Step 8 owns it,
  including the server-side `/share/<token>` redaction. Step 4 here only stops the button
  rendering on share pages.
- Anything already in `.claude/plans/share-links.md`: share token hashing, `/share` in
  `ALWAYS_PUBLIC_PATHS`, `referrer: no-referrer`, the single-use share consumption, the access log
  and the "never log the token" rule inside share code. This plan only fixes the web-vitals path
  and the bug report button, which that plan doesn't touch.
- Requiring email confirmation before the welcome email (L4's second suggestion). It's an open
  question below. It changes the signup flow and depends on GoTrue's autoconfirm setting.
- A duration picker in the invite UI. M7 only clamps the server side. The UI keeps sending the
  default 24h.
- RLS on `invitations`. That stays in batch B3 of `.claude/plans/rls.md`.
- Multi-use invitations (`max_uses`). See Approach.

## Current state
- **Cookies (M2)**: `src/utils/supabase/server.ts` and `src/utils/supabase/middleware.ts` call
  `createServerClient` without `cookieOptions`. In `@supabase/ssr` 0.12.0 the defaults
  (`node_modules/@supabase/ssr/dist/main/utils/constants.js`) are `httpOnly: false`, no `secure`,
  `sameSite: 'lax'` and `maxAge` 400 days. **Version quirk:** `cookies.js:202-206` merges
  `cookieOptions` but then forces `maxAge: DEFAULT_COOKIE_OPTIONS.maxAge` when setting a session
  cookie. A `maxAge` passed in `cookieOptions` is therefore ignored, and the lifetime has to be
  clamped inside the `setAll` callbacks. The app has no browser Supabase client and nothing calls
  `document.cookie` (checked with grep), so `httpOnly` breaks nothing. Realtime goes through the
  server relay. GoTrue's own session inactivity timeout is not set.
- **Confirm route (M3)**: `src/app/auth/confirm/route.ts:18,25` does
  `NextResponse.redirect(new URL(next, siteUrl))` with `next` taken straight from the query.
  `safeRedirectPath` exists but is private to `src/utils/actions/login.ts:10-15`, a `'use server'`
  file, so it can't be exported as a sync helper. It doesn't reject control characters: the URL
  parser strips `\t`/`\n`, so `/\t/evil.com` becomes `//evil.com`. The email templates in
  `public/emails/*.html` only ever send `next=/`, `/settings` or `/reset-password`.
- **Web vitals (M4)**: `src/app/web-vitals-reporter.tsx` is mounted in the root layout
  (`src/app/layout.tsx:120`) for every page, including `/share/[token]` and the legacy
  `/share/album/[token]`. It sends `path: window.location.pathname`.
  `src/app/api/vitals/route.ts:21` logs the whole client object (`contextLogger.info(metric, ...)`).
- **Bug report button (M4-adjacent, review item 7)**: `src/app/layout.tsx:121` renders
  `{user && <BugReportButton />}` on every page, including `/share/<token>` for a signed-in
  visitor. `src/components/bug_report_button.tsx:70` sends `window.location.href`, so a share
  token can be stored in `bug_reports.page_url`.
- **Invitations (M7)**:
  - Table `invitations (id uuid PK = the token, created_at, baby_id, expires_at)` in
    `supabase/migrations/20260721132707_baseline.sql:128`, with no RLS (B3).
  - `src/utils/invitations.ts` (`server-only`, service role) has `findValidInvitation`, which only
    checks expiry, and `grantViewerAccess`, which inserts `baby_access`.
  - Callers: `src/utils/actions/signup.ts` (ignores the `grantViewerAccess` error and the
    `createUserProfile` result), `src/utils/actions/join-baby.ts` and
    `src/app/(auth)/invite/page.tsx:38`.
  - Creation is in `src/utils/actions/invite.ts`:
    - `sendInvite` always uses 24h.
    - `generateShortLivedLink(babyId, hoursValid = 24)` accepts any number.
    - `getInvitations` does `select('*')`.
  - UI:
    - `src/app/baby/[babyId]/admin/_components/create_invite.tsx` calls
      `generateShortLivedLink(babyId)` with no duration. Its title is already "One-time invite
      link" (`admin.createInvite.title`), so single-use matches what admins are told today.
    - `display_invitations.tsx` lists active and expired links with a copy button and no revoke.
  - There is no revoke action.
- **Passwords and throttling (L2)**:
  - Signup form (`src/components/signup-form.tsx:79-84`) has no `minLength`.
  - `src/components/reset-password-form.tsx:40,44` and
    `src/app/settings/_components/account_card.tsx:116,120` use `minLength={6}`.
  - Server: `signup` and `updatePassword` (`src/utils/actions/reset-password.ts`) don't check
    length.
  - `supabase/config.toml:182` has `minimum_password_length = 6`. The real GoTrue settings live in
    the self-hosted stack's `docker/.env`, which isn't in the repo.
  - `login()` and `requestPasswordReset()` aren't throttled.
  - `src/utils/client-ip.ts` (`getClientIp`, trusts only `cf-connecting-ip`) already exists from
    the share-links work. Until `security-deps-and-ci.md` Step 8 (L9) is deployed, a request that
    reaches the app port directly can set `cf-connecting-ip` to anything.
- **Password change from settings (review)**: `account_card.tsx:111` posts to `updatePassword`
  (`reset-password.ts:30`), the same action as the recovery page. It needs only a session; the
  current password is never asked for. GoTrue's
  `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION` is not set.
- **Emails (L4)**: `src/utils/email.ts:34-36` replaces `{{FIRST_NAME}}` with the raw value.
  `sendInviteEmail` (`email.ts:56-59`) inserts `{{BABY_NAME}}` and `{{INVITE_URL}}` raw too.
  `escapeHtml` already exists in the same file (line 63, not exported).
- **Reset redirect (L15)**: `src/utils/actions/reset-password.ts:15-19` builds `redirectTo` from
  the `Origin` header. `invite.ts`, `email.ts` and `auth/confirm` already use
  `process.env.SITE_URL`.

Drift from CLAUDE.md:
- Server Actions are in `src/utils/actions/`.
- There is no `@/utils/supabase/client`.
- The middleware file is `src/utils/supabase/middleware.ts`, called from `src/proxy.ts`
  (Next 16 `proxy`).
- `CLAUDE.md` says `createClient` for the client exists; it doesn't.

## Approach
Small, independent fixes, one commit each, mostly in existing files:
- **Shared pure helpers** (no `'use server'`):
  - `safe-redirect.ts` (M3; also exports `isSafeRelativePath`, reused by
    `security-hardening.md` Step 8)
  - `vitals-path.ts` (M4)
  - `password-policy.ts` (L2)
  - `rate-limit.ts` (L2, `server-only`, in-memory and bounded)
  - `cookie-options.ts` (M2)
- **M7: single-use invitations.** Add `used_at`, `used_by` and `revoked_at` columns. Consume with
  one conditional UPDATE (`... WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`),
  the same pattern `album-share.ts` uses for `opened_at` on single-use shares. Add an admin revoke
  action and clamp `hoursValid` to a fixed list.
- **Settings password change:** a separate `changePassword` action that checks the current
  password, plus GoTrue's update-password reauthentication flag.
- **Alternatives not chosen:**
  - `max_uses`/`use_count` would need an RPC to increment atomically through PostgREST, and the
    UI already promises "one-time".
  - A Redis or GoTrue-only rate limit would add a service. GoTrue's per-IP limits see only the app
    server's IP.
  - GoTrue's nonce flow (`reauthenticate()` emails an OTP) for password changes: more UI and an
    email round-trip. The current-password check is enough here.

## Data and migrations
- New migration `supabase/migrations/<yyyymmddhhmmss>_invitations_single_use.sql`. The timestamp
  must be after `20261023100000`. Follow the repo conventions: quoted identifiers and a comment
  block explaining why.
  - `ALTER TABLE "public"."invitations"`:
    - `ADD COLUMN "used_at" timestamp with time zone`
    - `ADD COLUMN "used_by" "uuid"` with
      `CONSTRAINT "invitations_used_by_fkey" REFERENCES "public"."users"("id") ON DELETE SET NULL`.
      It points at `public.users`, not `auth.users`, so `getInvitations` can embed
      `users(first_name, last_name)`. Signup creates the profile before consuming (step 6), so the
      FK always holds.
    - `ADD COLUMN "revoked_at" timestamp with time zone`
  - All three are nullable with no backfill. The few existing unexpired invitations (24h max)
    remain usable once.
  - No grant or RLS change: `invitations` keeps its current grants until B3. Add a line to
    `rls.md`'s `invitations` row noting the new columns, since B3's admin UPDATE policy must allow
    `revoked_at`. Consumption runs on the service role, so it isn't affected.
  - Purely additive. `:prod` shares the database and runs old code, which ignores the columns and
    keeps working.
- Regenerate `src/utils/supabase/database.types.ts` with the same `mise exec -- supabase gen types ...`
  command used for the previous migration (`20261023100000_create_care_events.sql`).
- **Applying**: the builder creates the file but does not apply it. After the reviewer's green flag,
  apply it with `mise exec -- supabase db push` (CLAUDE.md: raw `supabase db push` drops the
  `[env]` block and fails with a misleading TLS error). Apply it **before** deploying the code from
  step 6, which selects the new columns.
- No other schema, storage or bucket changes.

## Access and security
- **Cookies (M2)**:
  - New `src/utils/supabase/cookie-options.ts` exporting:
    - `SUPABASE_COOKIE_OPTIONS = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }`
    - `SESSION_MAX_AGE_SECONDS = 30 * 24 * 3600`
    - `clampCookieMaxAge(options)`, which returns options with
      `maxAge = Math.min(options.maxAge, SESSION_MAX_AGE_SECONDS)` when `maxAge > 0`. It leaves
      `0` alone (sign-out deletes).
  - Pass `cookieOptions: SUPABASE_COOKIE_OPTIONS` to both `createServerClient` calls.
  - Wrap `options` with `clampCookieMaxAge` in both `setAll` callbacks.
  - Add a comment explaining the @supabase/ssr 0.12 quirk (`cookieOptions.maxAge` is overridden).
  - Because tokens refresh on activity and rewrite the cookie, 30 days is an idle timeout, not a
    hard one, and only on the cookie side. A stolen refresh token stays valid server-side until
    GoTrue expires it, so also set `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT` (e.g. `720h`, matching
    the 30 days) on GoTrue (manual, see Step 10).
  - `secure` is tied to production so `pnpm dev` on `http://localhost` keeps working. In the Docker
    image `NODE_ENV=production`, so plain-HTTP LAN access (`http://<ip>:3000`) can no longer keep a
    session. That's intended (see L9).
- **Confirm redirect (M3)**:
  - New `src/utils/safe-redirect.ts` (pure).
    - `isSafeRelativePath(value: unknown): value is string` returns true only if `value` meets
      all of these:
      - is a string,
      - starts with `/`,
      - does not start with `//`,
      - contains no `\` anywhere,
      - contains no character in `\u0000-\u001F` or `\u007F`.
    - `safeRedirectPath(path: unknown): string` returns `path` if `isSafeRelativePath(path)`,
      otherwise `'/'`.
    - `toSiteUrl(path, siteUrl)` builds `new URL(safeRedirectPath(path), siteUrl)` and falls back
      to `new URL('/', siteUrl)` if the resulting `origin` differs from `new URL(siteUrl).origin`
      (belt and braces).
  - `auth/confirm` uses `toSiteUrl(next, siteUrl)`.
  - `login.ts` imports `safeRedirectPath` and drops its local copy, so it also gets the
    control-character fix.
  - `security-hardening.md` Step 8 (L5) imports `isSafeRelativePath` instead of writing a second
    helper (review item 10).
- **Web vitals (M4)**:
  - New `src/utils/vitals-path.ts` (pure) with `toRouteTemplate(pathname: unknown): string | null`:
    - not a string → `null`
    - `/share` or `/share/...` → `'/share/[token]'`
    - every UUID segment → `[id]`
    - any other segment longer than 40 chars → `[param]`
    - truncate to 200 chars
  - Client: in the `useReportWebVitals` callback, return early when the pathname is `/share` or
    starts with `/share/`. Otherwise send `path: toRouteTemplate(window.location.pathname)`.
  - Server (`/api/vitals`): never trust the client, since old cached bundles still send raw paths.
    Build the log object from picked fields only (review item 14; `security-hardening.md` Step 2
    keeps these exactly):
    - `name`: one of `TTFB|LCP|INP|CLS|FCP|FID`; anything else → drop the request
    - `value`: finite number; otherwise drop the request
    - `rating`: optional, one of `good|needs-improvement|poor`; any other value is omitted
    - `id`: optional string, ≤ 64 chars
    - `path`: `toRouteTemplate(metric.path)`

    Drop the request if a `/share` path is reported. This is the minimum needed so no token can
    reach the log. The env gate, size cap and 413 remain M5.
  - The endpoint stays unauthenticated, as today.
- **Bug report button on share pages (review item 7)**: `BugReportButton` renders nothing when
  `usePathname()` is `/share` or starts with `/share/`. It is already a client component, so no
  layout change is needed. The server-side redaction of stored `page_url` values is
  `security-hardening.md` Step 8.
- **Invitations (M7)**: the token stays the uuid `id`. Changing the token format is out of scope.
  - `findValidInvitation`: also select `used_at, revoked_at` and return `null` if either is set.
    Log the reason with `babyId`, never the token. Add `invitationId` to the branded
    `ValidInvitation`.
  - `grantViewerAccess(invitation, userId)` (service role, callers pass a verified user id, as
    today):
    1. Consume atomically:
       `update({ used_at: now, used_by: userId }).eq('id', invitation.invitationId).is('used_at', null).is('revoked_at', null).gt('expires_at', now).select('id')`.
       **Any error from this UPDATE, or zero rows, is a failure** (review item 12): return
       `{ error: 'invitationUnavailable' }` for zero rows and `{ error: 'consumeFailed' }` for an
       error, and never insert `baby_access` in either case.
    2. Insert `baby_access`. On failure, release the token with
       `update({ used_at: null, used_by: null }).eq('id', ...).eq('used_by', userId)` and return
       the error.

    Return a discriminated result so callers can show "invalid link" vs "error".
  - `signup`:
    - Keep the `findValidInvitation` pre-check, so already-used or revoked links fail before an
      account is created.
    - Check the result of `createUserProfile` **before** consuming (review item 12). On error,
      redirect with the existing profile/signup error and do not call `grantViewerAccess`.
    - Then check the result of `grantViewerAccess`. On error, redirect to
      `/invite?message=invalidOrExpiredLink` (unavailable) or `addAccessError`.
    - Don't send the welcome email or notify admins in either failure case.
    - Known gap: in a race between two people redeeming the same link, the loser has an auth
      account with no baby. That's acceptable at this scale. They can be re-invited and use the
      "join" path.
  - `joinBabyWithInvitation`:
    - The existing-member check stays first, so a member re-clicking their own link doesn't burn
      it.
    - Map the `invitationUnavailable` result to `invalidOrExpiredLink`, and `consumeFailed` to
      `addAccessError`.
  - New `revokeInvitation(babyId: string, invitationId: string)` in `src/utils/actions/invite.ts`
    (`'use server'`, user client):
    - `assertIsAdmin(supabase, babyId)` first (it calls `getUser()`).
    - UUID-check `invitationId`.
    - `update({ revoked_at: now }).eq('id', invitationId).eq('baby_id', babyId).is('revoked_at', null).select('id')`.
      Zero rows → `actionError('invitationNotFound')`.
    - `logger.child({ function: revokeInvitation.name, babyId, invitationId })`.
    - `revalidatePath('/baby/${babyId}/admin')`.
    - Admin of baby A can't revoke B's invitations because of the `baby_id` filter.
  - Clamp the duration:
    - Add `INVITE_DURATIONS_HOURS = [24, 72, 168] as const` to a new `src/utils/invite-limits.ts`.
    - `generateShortLivedLink` throws `actionError('invalidInviteDuration')` unless
      `typeof hoursValid === 'number'` and the value is in the list. The default stays 24.
    - `sendInvite` stays fixed at 24.
  - `getInvitations`: explicit columns
    `id, created_at, expires_at, used_at, revoked_at, used_by, users:used_by(first_name, last_name)`,
    still filtered by `baby_id` after `assertIsAdmin`.
- **Passwords (L2)**:
  - New `src/utils/password-policy.ts` (pure, importable from client and server):
    `PASSWORD_MIN_LENGTH = 10` and `PASSWORD_MAX_LENGTH = 72` (bcrypt limit; GoTrue rejects
    longer).
  - Forms use `minLength`/`maxLength` from it: signup, reset-password and the settings account
    card.
  - Server checks the length (as a string) in `signup` (before `auth.signUp`), in
    `updatePassword` and in `changePassword` (Step 11), redirecting with the new
    `auth.passwordTooShort` message. Existing users with shorter passwords can still log in; the
    check applies only when a password is set.
  - GoTrue (manual, outside the repo): set `GOTRUE_PASSWORD_MIN_LENGTH=10` on the auth service in
    the self-hosted stack's env and restart auth. Also set `minimum_password_length = 10` in
    `supabase/config.toml` so the local stack matches.
- **Throttling (L2)**:
  - New `src/utils/rate-limit.ts` (`server-only`):
    `createRateLimiter({ windowMs, max, maxKeys = 10_000 })` returns
    `{ hit(key): boolean /* true = allowed */, reset(key) }`.
    - Backed by a `Map<string, { count, resetAt }>` with fixed windows.
    - Expired entries are swept on `hit` when the map exceeds `maxKeys / 2`, and the oldest entries
      are dropped past `maxKeys`, so it can't grow without bound (unlike L1).
  - In-process is enough: one container per stack. A restart resets counters, which is acceptable.
  - `login()` uses three limiters (review item 8), all 15-minute windows. A request is blocked if
    any of them is exhausted:
    - **strict**, keyed `${email}|${ip}`: 5 attempts. Reset on success.
    - **per email**, keyed `email`: 20 attempts. Not reset on success. Looser so that a stranger
      can't lock a family member out by guessing from one IP; it still caps distributed guessing.
    - **per IP**, keyed `ip`: 30 attempts.
    - `email` is `email.trim().toLowerCase()`; `ip` is `getClientIp(await headers()) ?? 'unknown'`.
    - When blocked, skip GoTrue and redirect to `/login` with `auth.tooManyAttempts`, keeping
      `redirectTo`.
    - Log a warning with `{ reason: 'email_ip' | 'email' | 'ip' }` only. No email and no IP in
      logs (L14 spirit).
  - `requestPasswordReset()`:
    - Per email: 3 per hour. Per IP: 10 per hour.
    - When blocked, skip GoTrue but show the **same** "link sent" message (no enumeration), and
      log a warning without the email.
  - **Caveat (review item 9):** until `security-deps-and-ci.md` Step 8 (L9) is deployed, a request
    that reaches the app port without going through Cloudflare can send any `cf-connecting-ip`.
    The per-IP limits and the IP half of the strict key are then bypassable. Meanwhile, the
    per-email limits (20 / 15 min for login, 3 / hour for reset) are the guarantee. The per-IP
    limit only counts as protection once deps-and-ci Step 8 is deployed; don't mark L2 throttling
    fully fixed in `security-findings.md` before then. Requests with no header share the
    `'unknown'` bucket.
- **Settings password change (review)**: new `changePassword(formData)` in
  `src/utils/actions/reset-password.ts`, used only by `account_card.tsx`:
  - `getUser()` first; redirect to `/login` if there is no user.
  - Read `currentPassword`, `password`, `confirmPassword`. Length check (L2) and mismatch check
    as in `updatePassword`.
  - Throttle with the login limiters (Step 9), keyed on the user's email, so the form can't be
    used to brute-force the current password.
  - Verify the current password with a **separate, non-persisting** client
    (`createClient` from `@supabase/supabase-js` with `auth: { persistSession: false,
    autoRefreshToken: false }`, the same URL and publishable key as the server client), calling
    `signInWithPassword({ email: user.email, password: currentPassword })`. The caller's cookies
    are not touched. Wrong password → redirect to `/settings` with
    `auth.currentPasswordWrong`, and count a failed attempt.
  - Call `updateUser({ password })` on that fresh client session, then sign it out. Because the
    session is seconds old, GoTrue's reauthentication rule (below) does not ask for a nonce.
  - Then sign out the caller's session (as `updatePassword` does today) and redirect to `/login`
    with `auth.passwordUpdatedMessage`.
  - `updatePassword` stays for the recovery page (`/reset-password`), whose recovery session is
    fresh.
  - GoTrue (manual): set `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true`. GoTrue
    then refuses a password change from a session older than 24h without a reauthentication
    nonce, so a stolen old session can't call `updatePassword` directly.
- **Emails (L4, review item 11)**: apply `escapeHtml` to **every** `.replaceAll` value in
  `src/utils/email.ts`: `{{FIRST_NAME}}` and `{{SITE_URL}}` in `sendWelcomeEmail`;
  `{{BABY_NAME}}`, `{{INVITE_URL}}` and `{{SITE_URL}}` in `sendInviteEmail` (`email.ts:56-59`);
  and any other template function in the file. `escapeHtml` is a hoisted function declaration in
  the same module, so no export is needed. Escaping `&` in `INVITE_URL` is correct inside an
  `href` attribute.
- **Reset redirect (L15)**: `redirectTo: \`${process.env.SITE_URL}/auth/confirm?next=/reset-password\``
  and remove the `headers()` import. The confirm route's new guard (M3) also covers `next`.
- **Service role**: no new uses. The existing service-role client in `src/utils/invitations.ts`
  now also performs the consume and release UPDATEs, scoped to one invitation id and a verified
  user id. The `changePassword` verification client uses the publishable key, not the service
  role.
- **No new public endpoints.** No auth model change besides cookie flags (all users get new
  cookie attributes on their next token refresh), the password minimum and the current-password
  requirement in settings.

## Steps
Each step is one Conventional Commit, followed by its `docs: update CHANGELOG.md for <subject>`
commit. Run `pnpm typecheck` and `pnpm lint` before each commit. Every step leaves the app working.

### Sequencing
From the review's recommended order:
- Step 1 lands before `security-hardening.md` Step 8 (L5 imports `isSafeRelativePath`).
- Step 4 lands before `security-hardening.md` Step 2 (both rewrite `src/app/api/vitals/route.ts`;
  Step 4 owns the field whitelist, hardening Step 2 adds only the env gate, 413 and byte cap).
- Step 9's per-IP limit is only relied on once `security-deps-and-ci.md` Step 8 (L9) is deployed.

1. `fix(auth): restrict auth/confirm redirects to same-site paths` (M3).
   - Files: `src/utils/safe-redirect.ts` (new, exports `isSafeRelativePath`, `safeRedirectPath`,
     `toSiteUrl`), `src/app/auth/confirm/route.ts`, `src/utils/actions/login.ts`.
2. `fix(auth): build password reset redirect from SITE_URL` (L15).
   - Files: `src/utils/actions/reset-password.ts`.
3. `fix(email): escape all template values in emails` (L4).
   - Files: `src/utils/email.ts`. Every `.replaceAll` value goes through `escapeHtml`, including
     `BABY_NAME` and `INVITE_URL` in `sendInviteEmail`.
4. `fix(vitals): never send or log share tokens in web vitals or bug reports` (M4).
   - Files: `src/utils/vitals-path.ts` (new), `src/app/web-vitals-reporter.tsx`,
     `src/app/api/vitals/route.ts`, `src/components/bug_report_button.tsx`.
   - The vitals route picks fields with the enums above (`name` in `TTFB|LCP|INP|CLS|FCP|FID`,
     `rating` in `good|needs-improvement|poor`).
   - `BugReportButton` returns `null` on `/share` and `/share/*` (`usePathname()`).
   - Lands before `security-hardening.md` Step 2.
5. `feat(db): track invitation use and revocation` (M7 schema).
   - Migration + regenerated types. Old code is unaffected.
   - Files: `supabase/migrations/<ts>_invitations_single_use.sql`,
     `src/utils/supabase/database.types.ts`, `.claude/plans/rls.md` (B3 note).
6. `fix(invite): make invitation links single-use and clamp their lifetime` (M7 server).
   - `findValidInvitation` and `grantViewerAccess` consume/release, plus callers' error handling.
     Any consume error is a failure; `signup` checks `createUserProfile` before consuming.
   - Add `INVITE_DURATIONS_HOURS`, `revokeInvitation`, and explicit columns in `getInvitations`.
   - Files: `src/utils/invitations.ts`, `src/utils/actions/signup.ts`,
     `src/utils/actions/join-baby.ts`, `src/utils/actions/invite.ts`,
     `src/utils/invite-limits.ts` (new), `messages/en.json`, `messages/fr.json`
     (`serverErrors` keys).
   - Needs the step 5 migration applied wherever this code runs.
7. `feat(admin): show invitation status and allow revoking` (M7 UI, **after design**).
   - Statuses: Active / Used (by name) / Expired / Revoked.
   - Revoke button (with `useConfirm`) on active ones. Copy only on active ones.
   - Files: `src/app/baby/[babyId]/admin/_components/display_invitations.tsx`, messages.
8. `fix(auth): require 10-character passwords` (L2 policy).
   - Files: `src/utils/password-policy.ts` (new), `src/components/signup-form.tsx`,
     `src/components/reset-password-form.tsx`, `src/app/settings/_components/account_card.tsx`,
     `src/utils/actions/signup.ts`, `src/utils/actions/reset-password.ts`, `supabase/config.toml`,
     messages.
   - Any hint text under the field follows the design.
9. `feat(auth): throttle login and password reset attempts` (L2 throttling).
   - Files: `src/utils/rate-limit.ts` (new), `src/utils/actions/login.ts`,
     `src/utils/actions/reset-password.ts`, messages.
   - Login: strict `email|ip` 5 / 15 min, per email 20 / 15 min, per IP 30 / 15 min.
   - Per-IP protection depends on `security-deps-and-ci.md` Step 8 being deployed (see Caveat).
10. `fix(auth): make session cookies HttpOnly, Secure and 30-day` (M2).
    - Files: `src/utils/supabase/cookie-options.ts` (new), `src/utils/supabase/server.ts`,
      `src/utils/supabase/middleware.ts`.
    - Ships alone on purpose: it's the change most likely to log people out if it goes wrong, so
      it is easy to revert on its own. Step 11 does not touch cookie handling.
    - Manual (user, Supabase stack): set `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT=720h` (or the value
      chosen in open question 2) on the auth service and restart auth.
11. `fix(auth): require the current password to change it from settings` (review).
    - Files: `src/utils/actions/reset-password.ts` (new `changePassword`),
      `src/app/settings/_components/account_card.tsx` (form posts to `changePassword`, new
      current-password field, **after design**), `messages/en.json`, `messages/fr.json`.
    - Reuses the Step 9 login limiters and the Step 8 length check.
    - Manual (user, Supabase stack): set
      `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true` and restart auth.
12. Docs:
    - Mark M2, M3, M4, M7, L2, L4 and L15 as fixed in `.claude/plans/security-findings.md`, plus
      the settings password-change item. Mark L2 throttling's per-IP part as "effective once L9
      is deployed" if deps-and-ci Step 8 hasn't shipped.
    - Add `## Status: implemented` to this plan and move it to `.claude/plans/done/`.

After the reviewer's green flag:
1. Apply the step 5 migration with `mise exec -- supabase db push`.
2. Push `main`, wait for CI, then run `mise run portainer_redeploy`.
3. The user sets on the Supabase stack by hand, then restarts auth:
   - `GOTRUE_PASSWORD_MIN_LENGTH=10`
   - `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT=720h`
   - `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true`
4. The user handles bug reports that already captured share tokens (manual step in
   `security-hardening.md` Step 8).

## Translations
Add keys to both `messages/en.json` and `messages/fr.json`. Final wording comes from the design.
- `auth.passwordTooShort`: "Password must be at least {min} characters." / "Le mot de passe doit
  contenir au moins {min} caractères."
- `auth.tooManyAttempts`: "Too many attempts. Please wait a few minutes and try again." / "Trop de
  tentatives. Patientez quelques minutes avant de réessayer."
- `auth.signup.passwordHint` (and the reset/settings equivalents if the designer wants a hint):
  "At least {min} characters" / "Au moins {min} caractères".
- `auth.currentPasswordWrong`: "Your current password is incorrect." / "Votre mot de passe actuel
  est incorrect."
- Settings: `currentPasswordLabel` in the account card's namespace: "Current password" / "Mot de
  passe actuel".
- `serverErrors.invalidInviteDuration`, `serverErrors.invitationNotFound`.
- `admin.invitations`: `used` ("Used"), `usedBy` ("Used by {name}"), `revoked` ("Revoked"),
  `revoke`, `revokeConfirm`, `revokeSuccess`, `revokeError`.
- Optional: change `auth.invalidOrExpiredLink` to also say "or already used" (designer/user call).

## Design

Scope: Step 7 (invitation list) and Step 11 (settings password form). Decisions applied: links are
single-use (email and generated); password rule is 10 characters, no character-class rule. No new
components and no new z-index: the confirm dialog is the existing `Dialog` (`z-[60]`), toasts are
Sonner (unmanaged).

### User flow
1. Admin opens the admin page → list shows each link with a status badge.
2. Admin taps "Revoke" on an Active row → destructive confirm dialog (`useConfirm`).
3. Confirms → row flips to Revoked at once (optimistic) and a success toast shows. On error the row
   rolls back and an error toast shows.
4. Member opens Settings > Account > Password and fills current, new and confirm → submits.
5. Wrong current password → inline error under the current field, other fields kept.
6. Success → signed out, `/login` with the existing "Password updated" banner.

### Screens
#### Invitations list (`display_invitations.tsx`)
Wireframe (mobile, 375px):
```
| [link] ID: 3f9a2c1d...  [Active]      |
|        Expires on 25/10/2026 14:00    |
|        [ Copy ]  [ Revoke ]           |
|---------------------------------------|
| [link] ID: 81c0aa42...  [Used]        |
|        Used by Marie Dupont           |
|---------------------------------------|
| [link] ID: b27e90d3...  [Revoked]     |
|        Expires on 24/10/2026 09:00    |
```
- Layout: keep the row (`py-3.5 px-6`, `divide-y divide-landing-border`, icon tile). Row is `flex-col`
  below `sm` and `sm:flex-row sm:items-center sm:justify-between`, so actions get their own line on
  phones and long FR labels never squeeze the ID. ID + badge line uses `flex-wrap gap-x-2 gap-y-1`.
  Actions: `flex gap-2 shrink-0`. Non-active rows have no actions and `opacity-80`.
- Components: `Badge` (`@/components/ui/badge`) with the same variants as
  `albums/_components/share_links_modal.tsx`: Active `default`, Revoked `destructive`, Used and
  Expired `secondary`. This replaces the hand-rolled emerald pill. `Button`, `useConfirm`
  (`@/components/confirm_provider`), `toast` (sonner), lucide `Copy`, `Check`, `Loader2`.
- Status: Revoked > Used > Expired > Active, with a single `now` per render.
- Second line: Active, Expired and Revoked show `expiresOn`. Used shows `usedBy` (fallback
  `usedByUnknown` when `used_by` is null).
- Copy (active only): icon plus visible text, `variant="outline" h-11 rounded-2xl cursor-pointer`.
  Label swaps to "Copied" for 2s; clipboard failure shows `toast.error(copyError)` (today it is
  silent).
- Revoke (active only): `variant="ghost" h-11 rounded-2xl text-destructive hover:bg-destructive/10
  hover:text-destructive cursor-pointer`, text only (same as share links).
- Interactions: `confirmAction({ title: t('revokeConfirmTitle'), description: t('revokeConfirm'),
  confirmLabel: t('revoke') })`. On confirm: mark the row revoked locally, call
  `revokeInvitation(babyId, id)`, then `router.refresh()`. The component needs a new `babyId` prop
  and local state seeded from props (resync on prop change).

#### Settings password form (`account_card.tsx`)
Wireframe (mobile):
```
Password
Current password
[ ************************ (eye) ]
New password
[ ************************ (eye) ]
At least 10 characters
Confirm password
[ ************************ (eye) ]
[ Change password ]
```
- Layout: same `<form>` + `FieldGroup`. New `Field` above "New password": id `currentPassword`,
  `PasswordInput`, `autoComplete="current-password"`, `required`, `maxLength={PASSWORD_MAX_LENGTH}`,
  and no `minLength` (old passwords may be shorter than 10).
- Hint: `passwordHint` as `<p className="text-xs text-landing-muted">` (or `FieldDescription` if
  `components/ui/field` has it) under New password, linked with `aria-describedby`. Same hint under
  the password field in the signup and reset forms (Step 8).
- Submit: switch the form to `useTransition` like the profile and email forms. Button
  `size="sm" variant="outline"`, disabled with `Loader2` while pending.
- Errors: wrong current password shows inline under the current field (`text-destructive text-xs`,
  `role="alert"`, `aria-invalid="true"` on the input, `aria-describedby` to the message); the
  current field is cleared and refocused. Other failures (mismatch, too short, too many attempts,
  generic) use `toast.error`, as in the sibling forms. Never clear the new-password fields on error.
- Success: server redirect to `/login`; no toast needed.

### States
- Loading: list is server-rendered, no skeleton. Revoke swaps its text for `Loader2`
  (`motion-reduce:animate-none`), disabled, `aria-busy`. Password submit disabled and spinning.
- Empty: unchanged `admin.invitations.empty`.
- Error: revoke failure → rollback + `toast.error(revokeError)`. Wrong password inline; throttled →
  toast with `auth.tooManyAttempts`.
- Success: revoke → `toast.success(revokeSuccess)` + Revoked badge. Password → `/login` banner.
- Offline / slow: a failed server action lands in the error paths above; buttons re-enable so the
  user can retry. No extra UI.

### Copy
Existing keys stay (`admin.invitations.expired|active|expiresOn|empty|copyTitle`,
`settingsPage.account.*`, `auth.passwordTooShort`, `auth.tooManyAttempts`; the last two exist in
`en.json`, check `fr.json`).

| Key | English | French |
|-----|---------|--------|
| admin.invitations.used | Used | Utilisé |
| admin.invitations.revoked | Revoked | Révoqué |
| admin.invitations.usedBy | Used by {name} | Utilisé par {name} |
| admin.invitations.usedByUnknown | Used by a former member | Utilisé par un ancien membre |
| admin.invitations.copy | Copy | Copier |
| admin.invitations.copied | Copied | Copié |
| admin.invitations.copyError | Couldn't copy the link. | Impossible de copier le lien. |
| admin.invitations.copyAria | Copy invite link {id} | Copier le lien d'invitation {id} |
| admin.invitations.revoke | Revoke | Révoquer |
| admin.invitations.revokeAria | Revoke invite link {id} | Révoquer le lien d'invitation {id} |
| admin.invitations.revokeConfirmTitle | Revoke this link? | Révoquer ce lien ? |
| admin.invitations.revokeConfirm | Nobody will be able to join with it anymore. People who already joined keep their access. | Plus personne ne pourra rejoindre avec ce lien. Les personnes déjà inscrites gardent leur accès. |
| admin.invitations.revokeSuccess | Link revoked | Lien révoqué |
| admin.invitations.revokeError | Couldn't revoke the link. Please try again. | Impossible de révoquer le lien. Réessayez. |
| settingsPage.account.currentPasswordLabel | Current password | Mot de passe actuel |
| settingsPage.account.passwordHint | At least {min} characters | Au moins {min} caractères |
| settingsPage.account.changePasswordError | Something went wrong while changing the password. | Une erreur est survenue lors du changement de mot de passe. |
| auth.currentPasswordWrong | Your current password is incorrect. | Votre mot de passe actuel est incorrect. |
| auth.signup.passwordHint, auth.resetPassword.passwordHint | At least {min} characters | Au moins {min} caractères |
| serverErrors.invitationNotFound, serverErrors.invalidInviteDuration | per Step 6 | per Step 6 |

Recommended: also reword `auth.invalidOrExpiredLink` to "This invitation link is invalid, has expired
or was already used." / "Ce lien d'invitation est invalide, a expiré ou a déjà été utilisé.", since
used links now land on it. Confirm the exact key path in `messages/*.json`.

### Accessibility
- Status badges: the status is text, never colour alone; it sits right after the ID so a screen reader
  reads "ID 3f9a2c1d, Used". Using `Badge` variants gives token contrast in light and dark (the old
  emerald text pill is dropped).
- Revoke button: visible text plus `aria-label={t('revokeAria', { id })}` starting with the visible
  word (label-in-name), so rows are distinguishable in a controls list. Same for Copy. `disabled`
  and `aria-busy` while pending. 44px tall.
- Focus: after a revoke the button disappears, so move focus to the row (`tabIndex={-1}` on the row
  element). The toast (Sonner live region) announces the result.
- Confirm dialog is the existing `Dialog`: focus trap, Escape cancels, focus returns to the Revoke
  button. Confirm button says "Revoke", not "OK".
- Password form: each field has a `<label>`; check that `PasswordInput`'s show/hide toggle has an
  `aria-label`. Wrong-password message is `role="alert"`. `autoComplete` values `current-password` and
  `new-password` keep password managers working.
- Reduced motion: only spinners and `transition-colors`; keep `motion-reduce:animate-none`.

### Questions
- Settings has no `?message=` banner, so the planned "redirect to `/settings` with
  `auth.currentPasswordWrong`" would show nothing. Recommend `changePassword` returns
  `{ error: 'currentPasswordWrong' | 'passwordTooShort' | 'passwordMismatch' | 'tooManyAttempts' |
  'generic' }` for failures and redirects only on success. This changes Step 11's action contract,
  so the planner should confirm.
- Used links show the user's name to every admin (`users.first_name/last_name`, already visible to
  admins elsewhere). Assumed fine.
- The list will grow with used, revoked and expired rows. A "show older" cutoff is not designed.

Behavior and data the screens need:
- **Invitations list** (`display_invitations.tsx`, admin page). Each row has `expires_at`,
  `used_at`, `revoked_at` and the user's first/last name for used links.
  - Status priority: Revoked > Used > Expired > Active.
  - Active rows: copy + revoke. Other rows: no actions.
  - Revoke asks for confirmation, then the row shows Revoked. Use a toast on success or error.
- **Create invite card**: no behavior change (still 24h, still "one-time").
- **Password fields** (signup, reset, settings): min 10 chars, enforced by the browser and the
  server. The designer decides whether to show a hint and where.
- **Settings password form**: a new required "current password" field above the new password
  fields. A wrong current password shows an error message; success signs the user out to
  `/login` as today.
- **Login**: a new "too many attempts" message, shown through the existing `?message=` banner.
- **Invite page**: an already-used or revoked link shows the existing invalid-link message.
- **Share pages**: the bug report button no longer appears on `/share/*`.

## Risks and open questions
- **Cookies (M2)**:
  - After deploy, existing cookies keep their old attributes until the next refresh (≤1h of
    activity). Nobody should be logged out.
  - If step 10 does log people out, revert it alone.
  - With `secure` in production, `http://<LAN-IP>:3000` can no longer hold a session.
  - The `:latest` and `:prod` stacks are on different domains, so cookies don't collide.
  - `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT` applies to both stacks (shared GoTrue). Anyone idle
    longer than the timeout must log in again.
- **Shared database**: `:prod` still runs old code until promoted. On the prod domain,
  invitations stay reusable and revocation isn't enforced until the user promotes `:latest` to
  `:prod`.
- **Existing logs and bug reports (M4)**: container logs from before the fix may already hold
  live share tokens, and so may `bug_reports.page_url`. Recommend revoking active share links
  created before the deploy, or confirming the logs were rotated by a container recreate. The
  bug report rows are handled by the manual step in `security-hardening.md` Step 8.
- **Throttling** is per container and resets on restart. It limits brute force; it doesn't stop a
  distributed attack. Check the GoTrue limits too (manual check 6 in the findings). The per-IP
  limit is spoofable until L9 is deployed (see Caveat).
- **Reauthentication flag**: with `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true`,
  `:prod` (still on old code until promoted) can't change a password from settings for sessions
  older than 24h; GoTrue returns an error and the old action shows `updatePasswordError`. Set the
  flag after promoting to `:prod`, or accept the gap. The recovery flow is unaffected (fresh
  session).
- **Signup race (M7)**: two simultaneous redemptions of one link can leave the loser with an
  account and no baby. Accepted at this scale.
- Open questions for the user:
  1. Is single-use right for both email invites and generated links? The UI already says
     "One-time invite link". Or should generated links allow several uses (for example, a family
     group chat)? That would need `max_uses` and an RPC.
  2. Is a 30-day idle session lifetime OK, or do you want longer or shorter (for example, 90 days
     for the family's phones)? The same value is used for `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT`.
  3. Should the welcome email be sent only after email confirmation (L4 follow-up)? This depends
     on whether GoTrue autoconfirm is on in `docker/.env`.
  4. Password rule: 10 characters with no character-class requirement (the default here), or also
     `password_requirements = letters_digits`?

## How to verify
1. **M3**: open `/auth/confirm?token_hash=<valid>&type=magiclink&next=//evil.example`, then the
   same with `next=https://evil.example` and `next=/%09/evil.example`. Each lands on `SITE_URL/`.
   A normal recovery link still lands on `/reset-password`. Login with
   `redirectTo=/%09/evil.example` lands on `/`.
2. **L15**: request a password reset with a forged `Origin` header (curl the action). The email
   link and GoTrue's `redirect_to` use `SITE_URL`.
3. **L4**: sign up through an invite with the name `<b>Bob</b><a href="https://x">y</a>`. The
   welcome email shows the literal text. Create a baby named `<i>X</i>` on dev and send an
   invite: the invite email shows the literal name, and the invite link still works.
4. **M4**:
   - Open `/share/<token>` signed out and signed in. `docker logs lepetitmonde | grep '"/share/'`
     shows no token and no vitals line for share pages.
   - Signed in on `/share/<token>`: no bug report button.
   - `curl -X POST /api/vitals -d '{"name":"LCP","value":1,"path":"/share/abc","level":99,"x":"y"}'`
     logs nothing with the token and none of the extra keys.
   - `{"name":"EVIL","value":1}` and `{"name":"LCP","value":1,"rating":"<script>"}` log no
     `name: "EVIL"` and no `rating` respectively.
   - A normal page logs `path: "/baby/[id]/feed"`.
5. **M7**:
   - Generate a link and sign up with it. Opening it again (other browser) shows the invalid-link
     page. Signing in as an existing user and redeeming it also fails.
   - The admin list shows "Used by <name>".
   - Revoke an unused link: the invite page shows invalid.
   - **Replay signup with a revoked token** (copy the signup POST, revoke the link, replay):
     the action fails and **no auth user is created** (check `auth.users` for the email).
   - **Two parallel `joinBabyWithInvitation` calls** for one token from two different signed-in
     accounts (fire both replays at once): exactly one `baby_access` row is created for that
     baby, and the other call gets the invalid-link message.
   - Call `generateShortLivedLink(babyId, 100000)` from devtools: the action errors.
   - **User without access**: as admin of baby B (not admin of A), call
     `revokeInvitation(<babyA>, <A's invitationId>)` and `revokeInvitation(<babyB>, <A's invitationId>)`.
     Both fail and A's invitation is unchanged. As a viewer of A, the call fails with unauthorized.
   - A member re-opening their own baby's unused link is redirected to the baby without consuming
     it.
6. **L2**:
   - Signup, reset and settings refuse a 9-char password in the browser and on the server (submit
     with devtools `minLength` removed).
   - With GoTrue set, a direct API signup with 9 chars fails.
   - Six wrong logins for one email from one IP in 15 min show "too many attempts" and stop
     reaching GoTrue (check the GoTrue logs). A correct password from that IP is also blocked
     until the window ends.
   - **No lockout from a stranger:** after the six wrong logins above from IP X, the real user
     logs in successfully from IP Y (different `cf-connecting-ip` through Cloudflare, e.g. phone
     on mobile data).
   - 21 wrong logins for one email spread across several IPs: the 21st is blocked.
   - Four reset requests in an hour still show "link sent", but only three emails arrive.
7. **M2**: in devtools on the deployed site, the `sb-*` cookies are `HttpOnly`, `Secure`,
   `SameSite=Lax`, and expire in about 30 days. In the console, `document.cookie` shows no `sb-`
   cookie. Login, logout, recovery, the realtime feed and uploads still work. `pnpm dev` on
   localhost still logs in. GoTrue's env shows `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT` set.
8. **Settings password change**:
   - With a wrong current password: error, password unchanged (old password still logs in).
   - With the right current password: signed out, new password works.
   - Replaying `updatePassword` (the recovery action) with a session older than 24h, without
     going through recovery, fails once the GoTrue flag is set.
   - Six wrong current-password attempts trigger "too many attempts".
9. `pnpm typecheck` and `pnpm lint` are clean after every step.
