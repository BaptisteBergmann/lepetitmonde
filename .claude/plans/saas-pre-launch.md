# SaaS Pre-Launch — Blockers & Hardening

Status: planning

## Context

Review of `saas-roadmap.md` + full security audit (2026-11-04) identified items
that must be resolved before opening the app to paying users. Grouped by priority.

**Scope:** this plan owns security and operations blockers. Product work
(feature flags, signup, social login, billing, onboarding, landing/pricing,
legal, UX polish) lives in `saas-polish.md`, which references the items here as
blockers. The RLS rollout itself lives in `rls.md` (owned by someone else).

---

## P0 — Critical (block launch)

### 1. Complete the RLS rollout

Tracked in `.claude/plans/rls.md` (on hold since 2026-10-23, 12 batches).
Without RLS, anyone with the Supabase anon key has full read/write on ~30
unprotected tables. The anon key is server-only today (no `NEXT_PUBLIC_*`), but
Supabase considers it public by design — one leak = full DB.

**Immediate stopgap (before full rollout):** use `rls.md` B1 as written,
agreed with its owner. Corrections to the earlier draft here:
- Do **not** re-grant anon on the 9 RLS tables: all 9 already revoke anon and
  their policies are `TO authenticated`; anon needs nothing.
- Only 6 of the 9 have policies; `api_tokens`, `oauth_clients`, `oauth_grants`
  are deliberately service-role only.
- Also revoke default privileges on SEQUENCES and FUNCTIONS — the baseline
  grants anon EXECUTE on new functions.
- Verify: `role_table_grants` and `routine_privileges` show 0 anon rows in
  `public`.

**The stopgap does not make open signup safe.** `authenticated` still has
`GRANT ALL` on ~30 tables without RLS; any signed-up stranger can read and write
every family's data via PostgREST. Open signup and social login
(`saas-polish.md` #4, #5) are blocked by the **full** rollout + test matrix.

**Then:** resume the 12-batch RLS rollout per `rls.md`.

### 2. Rate limiting & abuse prevention

Free tier invites bot signups and storage abuse. Needed before any public-facing
signup form.

- [ ] Email verification before any write — implemented as "GoTrue
      confirmations on" plus verified checks in auth helpers and token
      resolvers; details in `saas-polish.md` #4
- [ ] Check prod GoTrue `enable_signup`: invite-only is enforced only in the app
      today, so `POST /auth/v1/signup` with the publishable key may already
      self-register anyone. Don't expose `/auth/v1/signup` or `/rest/v1` at the
      reverse proxy
- [ ] Unpublish host port 3000: `cf-connecting-ip` (used for per-IP keys in
      `src/utils/client-ip.ts`) is spoofable when the app is reachable
      directly
- [ ] All GoTrue calls come from the app container's IP, so GoTrue's per-IP
      limits are shared by every user (one abuser blocks signup/reset for
      all). Use GoTrue captcha with the token forwarded, or raise GoTrue
      limits and enforce per-user/per-IP limits in the app
- [ ] Rate limit on Server Actions (push notifications, photo uploads) and a
      per-user daily cap on invite emails (spam relay today — see
      `saas-polish.md` #6 `invite_email`)
- [ ] Rate limit on signup and password reset (login is already limited in
      `src/utils/actions/login.ts`)
- [ ] Account flagging/banning mechanism — a ban must also be rejected by
      the API/OAuth token resolvers (`src/utils/api-token.ts`), not just
      sessions
- [ ] Honeypot or captcha on signup

### 3. Backup & disaster recovery

SaaS = responsible for baby photos. Non-negotiable.

- [ ] Daily automated DB backups (Supabase Pro includes this — verify config)
- [ ] R2 versioning or cross-region replication for photo storage — document
      retention and purge old versions on account deletion (GDPR)
- [ ] Documented restore procedure (DB + storage)
- [ ] Test the restore procedure once before launch

---

## P1 — High (fix before launch)

### 4. Replace `console.error` with pino logger

Files: `src/utils/actions/baby.ts:19`,
`src/utils/actions/guesses_questions.ts:41,370,411`.

`console.error` bypasses pino's redaction config (`token`, `email`,
`subscription`). Supabase error objects could contain sensitive data.

- [x] Replace with `contextLogger.error(...)` using a child logger from
      `@/utils/logger` — done in `c894b27`

### 5. Revoke anon EXECUTE on SECURITY DEFINER helpers

Hygiene, not an oracle: all four helpers answer only about the caller's own
`auth.uid()`, so anon always gets false. The revoke is already part of `rls.md`
(helpers migration + grants) — tracked there, nothing separate to do here.

### 6. CSP: replace `unsafe-inline` with nonce

`next.config.ts` CSP has `'unsafe-inline'` for `script-src`. The theme init
script in `src/app/layout.tsx:92` and Next's own inline bootstrap scripts are
the drivers (see the comment in `next.config.ts`). No current XSS vector, but
this removes CSP as defense-in-depth.

**Trade-off:** a nonce-based CSP forces every page to render dynamically (no
static/ISR output) and the CSP header moves from `next.config.ts` into
`src/proxy.ts`. Measure the impact before committing.

- [ ] Generate a per-request nonce in `src/proxy.ts` (Next 16's middleware),
      setting the CSP header **before** the early returns for `/share` and
      `/auth` in `updateSession`, or the public share page gets no CSP
- [ ] Keep the `next.config.ts` baseline for `/api` and other paths the proxy
      matcher excludes
- [ ] If `form-action 'self'` blocks Stripe/OAuth redirects, add exact hosts,
      no wildcards
- [ ] Apply nonce to the theme init script
- [ ] Remove `'unsafe-inline'` from `script-src`

### 7. Uptime monitoring & alerting

Parents logging a 3am feed and hitting a 500 is a churn event.

- [ ] UptimeRobot (free tier) or equivalent for uptime checks
- [ ] Alert channel (email or push) for downtime
- [ ] Sentry alert rules for error spikes

---

## P2 — Medium (fix early, not blocking)

### 8. Move i18n to Phase 0

- [x] `next-intl` complete, EN/FR keys in sync — new pages in `saas-polish.md`
      must ship both locales

### 9. Split Phase 0 timeline

Superseded: product sequencing (Stripe, onboarding, social auth) now lives in
`saas-polish.md` → Sequencing.

### 10. Decide R2 migration timing

`saas-roadmap.md` says "replace Supabase Storage once costs warrant it" but
Phase 1.2 lists R2 as the storage layer. Decide now:

- **Option A:** Launch on R2 from day one (simpler, no migration later)
- **Option B:** Launch on Supabase Storage, migrate to R2 when cost > $X/mo

### 11. Defer demo/sandbox mode

Pre-populated fake baby (Phase 0.3) requires careful isolation so test data
doesn't leak into real data or count against limits. Consider:

- [x] Deferred post-launch; landing uses screenshots (decided in `saas-polish.md`)

### 12. Verify `NODE_ENV=production` in production containers

`src/utils/supabase/cookie-options.ts` sets `secure: process.env.NODE_ENV ===
'production'`. If the Docker container runs without this, session cookies will
be sent over plain HTTP.

- [x] `Dockerfile:35` sets `ENV NODE_ENV=production` in the runtime stage and
      no compose file overrides it
- [ ] Confirm once on the running container (`docker exec … printenv NODE_ENV`), then close

### 13. Apple IAP budget

The DMA web-checkout loophole is real but Apple's interpretation is narrow.

- [ ] Budget for Apple IAP (15-30% cut) as the baseline
- [ ] Treat web checkout redirect as upside, not the primary plan

---

## P3 — Low (track, no rush)

### 14. Transitive zod vulnerability

`zod@4.4.3` via `@modelcontextprotocol/server` has a memory exhaustion CVE.
Not exploitable with current schemas (simple types only). MCP endpoint is
authed + rate-limited — but under open signup any stranger can create a baby,
become admin and mint a token, so re-check before enabling open signup.

- [ ] Update `@modelcontextprotocol/server` when a version shipping zod >=4.6.6
      is available

### 15. Build-time dependency vulns

`browserslist` (2 high: OOM, prototype write) and `source-map-js` (event-loop
DoS). All build-time only, no runtime impact.

- [ ] No action — resolved by future Next.js upgrades

---

## Sequencing

```
Week 1-2:  P0.1 stopgap (rls.md B1)
Week 2-4:  P0.1 full RLS rollout (resume rls.md batches, incl. helper revokes)
Week 3-4:  P1.6 (CSP nonce)
Week 4-5:  P0.2 (rate limiting) + P1.7 (monitoring)
Week 5-6:  P0.3 (backup/DR) + P2.12 (NODE_ENV check)
```

Product work runs in parallel per `saas-polish.md`. Public signup
(`ENABLE_OPEN_SIGNUP`), social login (`ENABLE_SOCIAL_LOGIN`) and billing
(`ENABLE_BILLING`) must not be enabled on a public stack until the **full** RLS
rollout (P0.1) and P0.2 rate limiting are done.
