# SaaS Launch Polish Plan

Status: draft — needs design

## Scope

This plan covers the **product** side of launching as a SaaS: feature flags,
signup/auth flows, billing, onboarding, landing/pricing, UX gaps and legal.

Security and operations items are owned elsewhere and are only referenced here:

| Item | Owner |
|---|---|
| RLS stopgap (revoke anon grants) | `saas-pre-launch.md` #1 |
| Full RLS rollout (12 batches) | `rls.md` (owned by someone else) |
| Revoke anon EXECUTE on RLS helpers | `saas-pre-launch.md` #5 |
| Rate limiting, abuse prevention, "verified email before writes" | `saas-pre-launch.md` #2 |
| Backup & disaster recovery | `saas-pre-launch.md` #3 |
| CSP nonce / moving CSP into `src/proxy.ts` | `saas-pre-launch.md` #6 |
| Uptime monitoring & alerting | `saas-pre-launch.md` #7 |
| Storage backend (Supabase Storage vs R2) | `saas-pre-launch.md` #10 |
| Pricing tiers & limits (source of truth) | `saas-pricing.md` |

Items in this plan that depend on those are marked **Blocked by**.

**Launch gate (security review 2026-11-06):** today ~30 tables have no RLS and
`authenticated` still has `GRANT ALL` on them. Open signup or social login hands
any stranger an `authenticated` JWT, which with the publishable key reads and
writes every family's data via PostgREST. So `ENABLE_OPEN_SIGNUP` **and**
`ENABLE_SOCIAL_LOGIN` are blocked by the **full** `rls.md` rollout (B1–B12 +
its test matrix), not just the anon stopgap. The anon stopgap only protects
against a leaked key without an account.

## Decisions

From planning conversation 2026-11-06:

- **Signup model**: Open signup (public registration from landing page)
- **Social login**: Google + Apple for launch
- **Landing page**: Freemium model — "Free to start" + separate /pricing page
- **Billing**: Stripe integration for launch, **no free trial**
- **Onboarding**: Guided wizard (create baby → photo → invite partner → choose plan)
- **Legal**: Full package (privacy policy, ToS, cookie consent, account deletion, data export)
- **UX gaps**: Comprehensive pass (error handling + auth flow + empty states)
- **Timeline**: Ship when ready, no fixed date
- **Dual mode**: Self-hosted + SaaS from the same image, gated by per-feature
  runtime env vars. Self-hosters can cherry-pick features.
- **SaaS-only by default**: Billing (Stripe), plan limits, upgrade prompts,
  /pricing page, landing page.
- **Baby owner = creator**: new `babies.owner_id`; all plan limits (babies,
  storage, members) count against the owner's subscription.
- **Account hard deletes are a manual admin task** at launch (no job runner).
- **Locale is per user/request** (cookie, then `Accept-Language`, then
  `DEFAULT_LOCALE`), not per deployment.

### Open questions (need Baptiste)

1. **"Circle members" limit (3 / 10 / unlimited)**: count `baby_access` rows per
   baby (people with app access) or `circle_members`? Default assumption:
   `baby_access` rows on the owner's babies, excluding the owner.
2. **MCP / API tokens**: `saas-pricing.md` lists "AI features (MCP, digests)" as
   Pro, but MCP is already shipped (`src/app/api/mcp`, tokens in settings).
   Gate API-token creation behind Pro when billing is on, or keep it free?
3. **Export tiers**: `saas-pricing.md` says Free = "JSON only". GDPR
   portability applies to everyone, so default: JSON + photos for all tiers;
   PDF/photobook is a separate post-launch paid feature. Confirm and update
   `saas-pricing.md`.
4. **Self-hosted baby creation**: may users of an invite-only (open signup off)
   install create babies via `/onboarding`? Default: yes for any logged-in user.

---

## Data and migrations

All new tables: RLS enabled + `REVOKE ALL ... FROM anon, authenticated`, then
re-grant the minimum (pattern: `20261023120000_harden_care_events_grants.sql`).
New functions: `REVOKE EXECUTE ... FROM anon, public`. Regenerate
`database.types.ts` after each migration.

- [ ] `babies.owner_id uuid references auth.users` — backfill from the oldest
      admin `baby_access` row per baby; `NOT NULL` after backfill; written only
      by the service role (no client UPDATE path)
- [ ] `invitations.role` (`admin | viewer`, default `viewer`) so the wizard can
      invite a partner as admin
- [ ] `subscriptions` table (`user_id` PK/FK — unique, `plan` enum, `stripe_customer_id`,
      `stripe_subscription_id`, `status`, `current_period_end`, timestamps).
      `SELECT` own row for `authenticated`; writes only via service role from
      the webhook
- [ ] `stripe_events` table (event ID PK) for webhook idempotency; service role only
- [ ] Usage function `get_owner_storage_bytes(owner uuid)` — `SECURITY DEFINER`,
      `SET search_path = ''`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated`,
      `GRANT EXECUTE` to `service_role` only (otherwise it is a usage oracle for
      any baby: the baseline default privileges grant anon EXECUTE on new
      functions). Sums object sizes across the owner's baby buckets. **Blocked by**
      `saas-pre-launch.md` #10 (only works on Supabase Storage; on R2 usage
      must be tracked on upload instead)
- [ ] `users.terms_accepted_at timestamptz`
- [ ] `users.deletion_requested_at timestamptz` (soft-delete flag)
- [ ] `users.last_export_at timestamptz` (export rate limit survives restarts;
      the in-memory limiter in `src/utils/rate-limit.ts` does not)
- [ ] Limit checks that count rows (`baby`, `member`) run as **check + insert
      in one locked SQL function** (service role only) so two concurrent
      creates can't both pass
- [ ] `users` profile row for every new user: DB trigger on `auth.users`
      insert (preferred over per-flow `createUserProfile`, which today only runs
      in the invite flow — `src/utils/invitations.ts`)

---

## Phase A — Plumbing

### 1. Feature flags (runtime, server-read)

**Constraint:** the image is built once in CI and deployed to every stack.
`NEXT_PUBLIC_*` values are inlined at build time, so flags are plain server env
vars read at request time.

| Env var | What it gates |
|---|---|
| `ENABLE_BILLING=true` | Stripe, /pricing, plan limits, upgrade prompts, usage + subscription in settings, onboarding plan step |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe API + webhook verification |
| `STRIPE_PRICE_{PRO,FAMILY}_{MONTHLY,ANNUAL}` | 4 price IDs, each with EUR + USD `currency_options` |
| `ENABLE_SOCIAL_LOGIN=true` | Google/Apple buttons on login, signup, invite |
| `ENABLE_ANALYTICS=true` | PostHog + cookie consent banner |
| `POSTHOG_KEY`, `POSTHOG_HOST` | PostHog (public by nature; passed to the client at runtime as props) |
| `ENABLE_LANDING=true` | Landing page for unauthenticated `/` |
| `ENABLE_OPEN_SIGNUP=true` | Public `/signup`; off = invite-only (current behavior) |

- [ ] `src/utils/features.ts` — `import 'server-only'`; `getFeatures()` reads
      `process.env` at call time and calls `await connection()` (`next/server`)
      so a gated page can never be prerendered with build-time env
- [ ] `billing` is on only if `ENABLE_BILLING=true` **and** both Stripe secrets
      are set; otherwise log a warning and treat as off
- [ ] Client components never read env: Server Components pass booleans (or
      the PostHog key) down as props
- [ ] Gated pages (`/pricing`, public `/signup`) call `notFound()` when off
- [ ] `src/proxy.ts` / `updateSession` reads the same flags (env is available
      there at runtime)
- [ ] Document every var in `.env.local.example` and add each by name to
      `docker-compose.portainer.yml` (it maps env vars explicitly)

| Flag | Off | On |
|---|---|---|
| billing | No limits, no billing UI, `/pricing` + webhook 404, onboarding skips plan step | Limits per `saas-pricing.md`, upgrade prompts, usage + subscription in settings |
| socialLogin | Email/password only | + Google/Apple buttons |
| analytics | No PostHog, no banner | PostHog loaded after consent |
| landing | Unauthenticated `/` → `/login` (current behavior) | Landing page |
| openSignup | `/signup` → `/invite` (current behavior) | Public registration form |

### 2. Auth routing in `src/utils/supabase/middleware.ts`

Already done today: session refresh, logged-in users bounced from `/login` and
`/forgot-password` (`AUTH_ONLY_PAGES`), safe redirects via
`src/utils/safe-redirect.ts`, `/auth/*` always public. Remaining:

- [ ] `PUBLIC_PAGES`: add `/privacy`, `/terms`, the "check your email" page,
      and `/pricing` (billing on only)
- [ ] When `landing` is on, let **exact** `pathname === '/'` through for
      signed-out users (never add `'/'` to the `startsWith` list — it would
      make every route public)
- [ ] When `openSignup` is on, `/signup` without `token` is public and
      auth-only; `/signup?token=` must keep reaching `/invite`
- [ ] Reuse `safeRedirectPath` / `toSiteUrl(next, SITE_URL)` in
      `/auth/callback` and the new signup action — never the request origin or
      `x-forwarded-host`
- [ ] Never put a protected page under `/auth*` (public by prefix in
      `ALWAYS_PUBLIC_PATHS`)

### 3. Per-request locale

Today `resolveLocale()` (`src/i18n/config.ts`) reads only `DEFAULT_LOCALE`.

- [ ] `src/i18n/request.ts`: locale from `NEXT_LOCALE` cookie → `Accept-Language`
      → `DEFAULT_LOCALE`
- [ ] Language switcher in settings (writes the cookie; optionally persisted on
      the user profile)
- [ ] Currency for pricing/Checkout derived from locale (FR → EUR, else USD)

---

## Phase B — Core SaaS

### 4. Open signup + email verification

**Blocked by:** full RLS rollout (`rls.md` B1–B12, see Launch gate) and rate
limiting (`saas-pre-launch.md` #2). Do not enable `ENABLE_OPEN_SIGNUP` on any
public stack before both ship.

**Email confirmation is the verification gate.** With confirmations off (today)
`email_confirmed_at` is set for everyone, so any "is verified" check is
meaningless. Confirmations on = no session until the email is verified, which
is the gate itself.

**Coupling:** email confirmation is a global GoTrue setting
(`enable_confirmations = false` in `supabase/config.toml` today); the app flag
cannot scope it. Turning it on also changes the **invite** signup flow:
`signUp` returns no session, and `signup.ts` currently redirects straight to
`/baby/.../onboarding`, which would bounce to `/login`.

- [ ] Enable confirmations on the SaaS Supabase stack (config + docs for
      self-hosters)
- [ ] Adapt invite signup to a no-session result: **do not** grant
      `baby_access` or notify admins at signup (today `signup.ts` does both
      before verification). Store the pending invite token with the user, show
      "check your email", and redeem the invite in `/auth/confirm` after
      verification, then route to the invitee onboarding page
- [ ] Defense in depth: reject unverified users in `getAuthUser` /
      `requireUserId`, in `resolveBearer` (API/OAuth tokens), and in
      `createApiToken` — the proxy matcher skips `/api`, so `/api/upload` and
      `/api/mcp` (service-role writes keyed by `userId`) are not covered by a
      proxy-only check
- [ ] `/auth/confirm`: replace verify-on-GET with an interstitial page and a
      POST button (stops login-CSRF into an attacker account and email
      scanners consuming single-use links)
- [ ] Public `/signup` form (full name, email, password with strength
      indicator, ToS + privacy checkbox → `terms_accepted_at`) when
      `openSignup` is on; `/signup?token=` still forwards to `/invite`
- [ ] Server Action `signUp` with `emailRedirectTo` → `/auth/confirm`
- [ ] Confirmation email template: keep `next=/`
      (`public/emails/confirmation.html`); verified users land on `/`, and
      the zero-babies rule (#7) sends them to `/onboarding`. (`{{ .RedirectTo }}`
      is absolute and `safeRedirectPath` rejects it — pass a relative `next` if
      deep-linking is ever needed)
- [ ] Even with billing **off**, open signup enforces a default quota
      (babies, storage, invites/day) — "no limits" is only safe for invite-only
      self-hosted installs
- [ ] Generic responses ("if this email is valid, check your inbox") — no
      account-existence leak; friendly localized errors mapped from Supabase
      error codes

### 5. Social login (Google + Apple)

Gated by `socialLogin`. **Blocked by** the same items as #4: Supabase creates a
user on first Google/Apple sign-in regardless of `ENABLE_OPEN_SIGNUP`, so social
login *is* open signup at the GoTrue level. Also blocked by confirmations being
on (#4), see account linking below.

- [ ] `/auth/callback`: when `openSignup` is off and the user is new (no
      `users` row, no `baby_access`, no pending invite token), sign out and
      delete the user (service role)
- [ ] Expose only `/auth/v1/authorize` and `/auth/v1/callback` publicly at the
      reverse proxy — never `/rest/v1` or `/auth/v1/signup`
- [ ] Configure Supabase Auth providers (Google GCP OAuth client, Apple
      Service ID + key); add redirect URLs to the allowlist — coordinate with
      `oauth-redirect-allowlist.md`
- [ ] `/auth/callback` route: `exchangeCodeForSession`, validated
      `redirectTo`, profile row ensured (trigger from Data and migrations)
- [ ] Carry an invite `token` through the OAuth round trip so "Continue with
      Google" works from `/invite`, then redeem it as `join-baby.ts` does
- [ ] **Account linking (takeover risk):** accounts created while
      confirmations were off count as "verified", so an attacker who
      pre-registered a victim's email via an invite link gets the victim's
      Google identity auto-linked. Before enabling social login: force a real
      re-verification of every autoconfirmed account before an OAuth identity
      can attach to it; allow linking an extra provider only manually from
      settings while logged in (`enable_manual_linking`)
- [ ] Supabase redirect allowlist: exact URLs, no `**`
- [ ] CSP: add exact-host `form-action` allowances for provider redirects (coordinate with
      `saas-pre-launch.md` #6)
- [ ] New social user with no babies → `/onboarding`

### 6. Stripe billing

Gated by `billing`. Tiers, prices and limits from `saas-pricing.md`. No trial.
New dependency: `stripe`.

**Stripe:**
- [ ] Checkout Session (Server Action): accepts a `plan` + `interval` key mapped
      server-side to the env price IDs (never a raw price ID from the client);
      `currency` from locale; `client_reference_id` = user id; customer created
      lazily with a Stripe idempotency key and stored in `subscriptions`
- [ ] Customer Portal link (cancel / change plan / payment method)
- [ ] `src/app/api/stripe/webhook/route.ts`: verify signature on
      `await request.text()` (default 5-min tolerance); insert event ID into
      `stripe_events` first (duplicate → 200 no-op); handles
      `checkout.session.completed`,
      `customer.subscription.{created,updated,deleted}`,
      `invoice.payment_failed`; 404 when billing off
- [ ] Out-of-order safe: on each event re-fetch the subscription from Stripe
      and upsert by `stripe_subscription_id`
- [ ] Map events to users only via stored `stripe_customer_id` /
      `client_reference_id`, never by email; ignore events for soft-deleted users
- [ ] The plan is decided only from webhook state, never from the checkout
      redirect query string

**Enforcement (billing on only):**
- [ ] `src/utils/plan-limits.ts`: `checkLimit(ownerId, kind)`; returns
      unlimited when billing is off. Kinds and call sites:
  - `baby` — in `createBaby` (#7)
  - `storage` — in `src/app/api/upload/route.ts` **before** streaming, using
    `Content-Length` plus the existing per-request cap (videos stream up to
    500 MB); returns 402 + `limit_reached` JSON. Also count generated
    thumbnails, and check in the copy helpers (`copyStorageObject` in
    `src/utils/actions/storage.ts` / `src/utils/albums-internal.ts`)
  - `member` — when sending invites (`src/utils/actions/invite.ts`) **and**
    when redeeming them (`grantViewerAccess` in `signup.ts`, `join-baby.ts`),
    since single-use links can be minted in advance
  - `invite_email` — cap invite emails per user per day, verified users only
    (today any user can make the app email any address with a baby name they
    choose — spam relay)
  - `api_token` — only if open question 2 is answered "gate it"
- [ ] Limits are evaluated against `babies.owner_id`'s subscription
- [ ] Downgrade: over-limit data stays readable; only new creates are blocked
- [ ] Upgrade prompt UI on `limit_reached`
- [ ] Settings: usage + subscription section

### 7. Guided onboarding wizard

The app has **no way to create a baby** today (`src/utils/actions/baby.ts`
only reads). The existing `src/app/baby/[babyId]/onboarding` page is the
**invitee** step (sets `nickname` / `relation_to_baby` via
`completeOnboarding`) and is used by `signup.ts` and `join-baby.ts` — keep it
unchanged.

- [ ] `createBaby` Server Action (`src/utils/actions/baby.ts`) — a **new
      privileged path** (`rls.md` gives `babies` INSERT no policy and makes
      `baby_access` INSERT service-role only; a self-insert policy is flagged
      unsafe there). User id only from `getUser()`, never a babyId or owner from
      the client. Service-role core, in one step: ensure `users` row, limit
      check + insert `babies` with `owner_id` (locked SQL function), admin
      `baby_access` for the creator (with `relation_to_baby`), upsert
      `baby_health_profiles` (birth date + sex live there),
      `ensureBabyBucket(babyId)`
- [ ] `/onboarding` route (not baby-scoped); `/` redirects there for users
      with zero babies
- [ ] Step 1: baby name + birthday + optional sex + creator's relation → `createBaby`
- [ ] Step 2: first photo (skippable) via `/api/upload`
- [ ] Step 3: invite partner/family by email with role (partner = admin,
      using `invitations.role`) (skippable)
- [ ] Step 4: choose plan → Stripe Checkout — skipped when billing is off
- [ ] Step state in the URL (`?step=`)
- [ ] Progress indicator, "skip to app" on every step after step 1, ends at the baby hub

---

## Phase C — Conversion & Legal

### 8. Landing page updates

`src/app/_home/landing.tsx`. Reachable only when `landing` is on (#2).

- [ ] Primary CTA "Commencer gratuitement" / "Start free" → `/signup` (only when
      `openSignup`; otherwise "log in")
- [ ] Secondary CTA "See pricing" → `/pricing` (billing only)
- [ ] "Free for 1 baby" mention (billing only)
- [ ] Social proof — only real content; skip at launch if none
- [ ] Footer: /pricing (billing), /privacy, /terms
- [ ] All copy in EN + FR

### 9. `/pricing` page

Gated by billing (`notFound()` when off).

- [ ] Free / Pro / Family comparison from `saas-pricing.md`
- [ ] Monthly / annual toggle ("2 months free")
- [ ] Currency from locale (#3)
- [ ] CTA per tier → signup or Checkout
- [ ] FAQ (data portability, cancel anytime, downgrade behavior)

### 10. Privacy policy (`/privacy`)

**Blocked by** `saas-pre-launch.md` #10 for the storage location/sub-processor list.

- [ ] Data collected, storage, access, retention, children's data, GDPR rights
- [ ] Processing locations (OVH France compute; storage per #10 decision)
- [ ] Sub-processors (Supabase, Cloudflare if R2, Stripe, Resend, PostHog if enabled)
- [ ] Contact for data requests
- [ ] Human/legal review before publishing — Claude drafts only

### 11. Terms of service (`/terms`)

- [ ] Acceptable use, responsibilities, availability, liability, termination,
      pricing changes
- [ ] Minimum age 18+ for account holders
- [ ] User-generated content policy (photos, posts)
- [ ] Legal review before publishing

### 12. Cookie consent + analytics

Only when `analytics` is on (session cookies are strictly necessary). New
dependency: `posthog-js`.

- [ ] Consent banner; PostHog not loaded until accepted
- [ ] Respect `DNT` / `Sec-GPC` as "decline"
- [ ] Consent in a first-party cookie; revocable from settings
- [ ] Never load PostHog on `/share`, `/invite`, `/auth`, `/reset-password`,
      `/oauth` (URLs carry bearer tokens); strip query strings from
      `$current_url` / `$referrer` everywhere
- [ ] Autocapture and session replay **off** (would record children's data);
      EU host
- [ ] CSP: add the exact PostHog host to `script-src` / `connect-src` only when
      analytics is on (coordinate with `saas-pre-launch.md` #6)

### 13. Account deletion

Hard delete is a **manual admin task** at launch.

- [ ] "Delete my account" in settings, confirmation dialog listing
      consequences. Re-auth: `reauthenticate()` nonce for password users;
      sign-in within the last 5 minutes for social-only users
- [ ] Request (soft delete) cuts **all** access immediately, not just the
      session:
  - revoke `api_tokens` and OAuth grants
  - global sign-out / ban the user in GoTrue
  - delete push subscriptions
  - revoke `album_shares` for babies that will be deleted
  - remove the user's `baby_access` rows (the existing trigger in
    `20261027090000_create_api_tokens.sql` then revokes tokens)
  - cancel the Stripe subscription (billing on)
  - set `deletion_requested_at`, confirmation email via Resend
- [ ] Token resolvers (`src/utils/api-token.ts`, OAuth) reject soft-deleted or
      banned users
- [ ] Cancellation within 30 days = admin restores on request (access was
      revoked, so "log in to cancel" doesn't work)
- [ ] Documented admin procedure / script (service role): for babies the user
      owns where they are the sole admin, delete baby rows and the baby's
      bucket; for others, remove their `baby_access` and transfer ownership to
      another admin; purge R2/object versions if versioning is on
      (`saas-pre-launch.md` #3); then `auth.admin.deleteUser`
- [ ] Admin list of pending deletion requests (existing admin page)

### 14. Data export

No job runner: export is generated on request and streamed.

- [ ] "Export my data" in settings
- [ ] JSON: profile, babies, posts, tracker entries, events, health
- [ ] Photos: zip streamed from a route handler, organized by baby/album
- [ ] Authorization: storage is service-role only by design, so the export
      reuses the **app-layer** access rules, not RLS: `getUserAccess`,
      feed `canSee` + circle rules, unsorted album photos admin-only,
      `page_settings` role rules. Then service role for storage reads (same as
      `/api/storage/[babyId]`)
- [ ] Leave other members' emails out
- [ ] Streamed to the authenticated user only — no emailed signed URL (it
      would be a bearer link to every photo of the child)
- [ ] Rate-limited via `users.last_export_at` (1 per day)

---

## Phase D — UX Polish

### 15. Error boundaries

Current `error.tsx`: root, `share/[token]`, `baby/[babyId]/{health,albums,tracker}`.

- [ ] Shared `baby/[babyId]/error.tsx` covering every baby page; keep the three
      specific ones only if they differ meaningfully
- [ ] `(auth)/error.tsx`, `profile`, `settings`, `share/album/[token]`, `onboarding`
- [ ] Consistent UI matching `src/app/error.tsx`; no error details in production

### 16. Loading states

Baby pages and `(auth)/oauth/authorize` are covered.

- [ ] Add to `settings`, `profile`, `baby/[babyId]/onboarding`, `share/album/[token]`
- [ ] Auth pages only where they await data (e.g. `invite` token lookup)
- [ ] Audit existing skeletons for visual consistency

### 17. Empty states

- [ ] Audit feed, albums, anecdotes, buy-list, calendar, health, inventory,
      todo, tracker, guess
- [ ] Each: icon + text + primary CTA ("Add your first…")
- [ ] Home with no babies → `/onboarding` (#7)

### 18. Profile page

- [ ] Redirect `/profile` → `/settings`

### 19. Auth flow polish

- [ ] Shared password strength component (signup + reset-password)
- [ ] Friendly, localized error messages on login / forgot / reset
- [ ] End-to-end check of `redirectTo` across login, signup, social, invite

---

## Sequencing

```
Phase A — Plumbing:   Data migrations (owner_id, profile trigger)
                      1. Feature flags   2. Auth routing   3. Per-request locale
Phase B — Core SaaS:  7. createBaby + onboarding (useful even self-hosted)
                      4. Signup (blocked by RLS stopgap + rate limiting)
                      5. Social login    6. Billing
Phase C — Conversion/Legal: 8-9 landing + pricing   10-12 legal/consent   13-14 deletion/export
Phase D — Polish:     15-19 (independent; can start any time)
```

Phase D can be done first as small commits. The full RLS rollout plus the
security/ops items in the Scope table must land before `ENABLE_OPEN_SIGNUP`,
`ENABLE_SOCIAL_LOGIN` or `ENABLE_BILLING` are turned on publicly. Email
confirmations (#4) must be on before social login.

**Self-hosted release:** Phase A + #7 + Phase D, plus the security items in
`saas-pre-launch.md`.

---

## Design

**Waiting on Baptiste's redesign direction.** Screens that overlap (landing,
onboarding, pricing, signup, settings) should be built in the new design rather
than polished in the old one. The designer agent fills this section per screen
once the direction is known.

---

## Out of scope (post-launch)

- Background job runner (scheduled hard deletes, async exports)
- Free trial
- PWA offline support
- Demo/sandbox mode (screenshots on landing instead)
- Native iOS/Android apps; Apple IAP (see `saas-pre-launch.md` #13)
- AI features beyond the shipped MCP (chat, digests)
- PDF / photobook export
- Open-source release
