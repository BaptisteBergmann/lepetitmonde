# SaaS Pre-Launch — Blockers & Hardening

Status: planning

## Context

Review of `saas-roadmap.md` + full security audit (2026-11-04) identified items
that must be resolved before opening the app to paying users. Grouped by priority.

---

## P0 — Critical (block launch)

### 1. Complete the RLS rollout

Tracked in `.claude/plans/rls.md` (on hold since 2026-10-23, 12 batches).
Without RLS, anyone with the Supabase anon key has full read/write on ~30
unprotected tables. The anon key is server-only today (no `NEXT_PUBLIC_*`), but
Supabase considers it public by design — one leak = full DB.

**Immediate stopgap (before full rollout):**
- [ ] `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon"`
- [ ] `REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon"`
- [ ] Re-grant only on the 9 tables that already have RLS + policies

**Then:** resume the 12-batch RLS rollout per `rls.md`.

### 2. Rate limiting & abuse prevention

Free tier invites bot signups and storage abuse. Needed before any public-facing
signup form.

- [ ] Email verification required before any write operations
- [ ] Rate limit on Server Actions (especially push notifications, email
      invitations, photo uploads)
- [ ] Rate limit on auth endpoints (login, signup, password reset)
- [ ] Account flagging/banning mechanism
- [ ] Honeypot or captcha on signup

### 3. Backup & disaster recovery

SaaS = responsible for baby photos. Non-negotiable.

- [ ] Daily automated DB backups (Supabase Pro includes this — verify config)
- [ ] R2 versioning or cross-region replication for photo storage
- [ ] Documented restore procedure (DB + storage)
- [ ] Test the restore procedure once before launch

---

## P1 — High (fix before launch)

### 4. Replace `console.error` with pino logger

Files: `src/utils/actions/baby.ts:19`,
`src/utils/actions/guesses_questions.ts:41,370,411`.

`console.error` bypasses pino's redaction config (`token`, `email`,
`subscription`). Supabase error objects could contain sensitive data.

- [ ] Replace with `contextLogger.error(...)` using a child logger from
      `@/utils/logger`

### 5. Revoke anon EXECUTE on SECURITY DEFINER helpers

After RLS is deployed, `is_baby_member`, `is_baby_admin`, `is_circle_visible`,
`shares_baby_with` become oracles — an attacker could brute-force UUID pairs to
enumerate user-to-baby membership.

- [ ] Revoke EXECUTE from `"anon"` on all four functions
- [ ] Grant EXECUTE only to `"authenticated"` and `"service_role"`

### 6. CSP: replace `unsafe-inline` with nonce

`next.config.ts` CSP has `'unsafe-inline'` for `script-src`. The theme init
script in `src/app/layout.tsx:92` is the driver. No current XSS vector, but
this removes CSP as defense-in-depth.

- [ ] Generate a per-request nonce in middleware
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

French is the native market. Retrofitting i18n after marketing pages exist is
painful. `next-intl` is already partially set up.

- [ ] Complete `next-intl` integration before marketing/landing pages
- [ ] Ship bilingual (FR/EN) from day one

### 9. Split Phase 0 timeline

The original plan scopes RLS + Stripe + onboarding + social auth in 4 weeks.
Recommended split:

- **Phase 0A (3 weeks):** RLS rollout + plans table + auth improvements
- **Phase 0B (3 weeks):** Stripe integration + onboarding flow

Stripe webhooks alone can eat a week.

### 10. Decide R2 migration timing

`saas-roadmap.md` says "replace Supabase Storage once costs warrant it" but
Phase 1.2 lists R2 as the storage layer. Decide now:

- **Option A:** Launch on R2 from day one (simpler, no migration later)
- **Option B:** Launch on Supabase Storage, migrate to R2 when cost > $X/mo

### 11. Defer demo/sandbox mode

Pre-populated fake baby (Phase 0.3) requires careful isolation so test data
doesn't leak into real data or count against limits. Consider:

- [ ] Defer to Phase 1
- [ ] Use screenshots/video on landing page instead for launch

### 12. Verify `NODE_ENV=production` in production containers

`src/utils/supabase/cookie-options.ts` sets `secure: process.env.NODE_ENV ===
'production'`. If the Docker container runs without this, session cookies will
be sent over plain HTTP.

- [ ] Verify production Docker Compose / Portainer stack sets `NODE_ENV=production`

### 13. Apple IAP budget

The DMA web-checkout loophole is real but Apple's interpretation is narrow.

- [ ] Budget for Apple IAP (15-30% cut) as the baseline
- [ ] Treat web checkout redirect as upside, not the primary plan

---

## P3 — Low (track, no rush)

### 14. Transitive zod vulnerability

`zod@4.4.3` via `@modelcontextprotocol/server` has a memory exhaustion CVE.
Not exploitable with current schemas (simple types only). MCP endpoint is
authed + rate-limited.

- [ ] Update `@modelcontextprotocol/server` when a version shipping zod >=4.6.6
      is available

### 15. Build-time dependency vulns

`browserslist` (2 high: OOM, prototype write) and `source-map-js` (event-loop
DoS). All build-time only, no runtime impact.

- [ ] No action — resolved by future Next.js upgrades

---

## Sequencing

```
Week 1-2:  P0.1 stopgap (revoke anon grants) + P1.4 (console.error fix)
Week 2-4:  P0.1 full RLS rollout (resume rls.md batches)
Week 3-4:  P1.5 (revoke anon EXECUTE) + P1.6 (CSP nonce)
Week 4-5:  P0.2 (rate limiting) + P1.7 (monitoring)
Week 5-6:  P0.3 (backup/DR) + P2.8 (i18n)
Week 6-9:  Stripe integration (Phase 0B)
Week 9-10: Onboarding flow + auth improvements
```

This replaces the original 4-week Phase 0 with a more realistic ~10-week
timeline that front-loads security.
