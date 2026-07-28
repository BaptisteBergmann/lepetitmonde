# Gazette monetization — Stripe gating, donations, license note

*(Blocked on `.claude/plans/gazette.md` shipping and being verified — this plan assumes the Gazette already works for everyone and adds payment gating on top, plus two independent small additions: donation links and a license clarification. Do not start until the Gazette plan is implemented.)*

## Context

Per-baby gating, not per-user — matches the existing `is_baby_admin`/`is_baby_member` RLS helpers (all keyed on `baby_id`), and the fact that `baby_access` has no single "owner," just possibly-multiple admins. Enforceability is honor-system by design: this is source-available self-hosted software, so a technically capable self-hoster can always strip a same-codebase check. Not worth fighting with DRM — same trade-off Portainer CE/BE and GitLab CE/EE accept. The gate makes paying the easy default path; it doesn't need to make free self-hosting-and-patching impossible.

Research corrections from planning discussion, relevant here:
- **`mise.toml` is not committed to git** (gitignored, confirmed via `git ls-files`/`git log --all`) — new Stripe secrets follow the same already-safe pattern.
- **RLS is not enabled anywhere in the DB yet** — existing `is_baby_admin`-style helpers were added ahead of the policy rollout tracked in `.claude/plans/rls.md`. This plan adds `has_gazette_access` in that same "ready for later" style without scope-creeping into that separate effort.
- **License**: PolyForm Noncommercial restricts *licensees*, not the copyright holder — the copyright holder can already sell hosted/gated features on their own code. The "license update" below is a clarifying `NOTICE.md`, not a relicense.

## Phase 1 — DB schema

New table `baby_subscriptions` (1:1 with `babies`):
- `baby_id uuid PRIMARY KEY REFERENCES babies(id) ON DELETE CASCADE`
- `stripe_customer_id text NOT NULL`
- `stripe_subscription_id text UNIQUE NOT NULL`
- `status text NOT NULL CHECK (status IN ('trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired','paused'))` — plain checked `text`, not a Postgres enum, since these are Stripe's own status strings and Stripe adds new ones over time.
- `current_period_end timestamptz NOT NULL`
- `cancel_at_period_end boolean NOT NULL DEFAULT false`
- `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`

Plus `has_gazette_access(target_baby_id uuid) RETURNS boolean SECURITY DEFINER STABLE SET search_path=''`, mirroring `supabase/migrations/20260727013047_baby_access_helper_functions.sql` (checks `status IN ('active','trialing') AND current_period_end > now()`).

If the Gazette plan's cron job reads `babies.last_gazette_sent_at`, either leave it there or move it onto `baby_subscriptions.last_sent_at` in this migration — decide once that plan is actually implemented.

## Phase 2 — Stripe integration

- Add `stripe` npm dependency.
- `src/utils/stripe.ts` — lazy Stripe client singleton.
- `src/utils/actions/subscriptions.ts` (new file, matching the existing pattern of feature-specific action files rather than piling onto `access.ts`):
  - `hasGazetteAccess(babyId)` — reads `baby_subscriptions`, cached with the existing `createTtlCache` pattern (5s), read on every nav render.
  - `createGazetteCheckoutSession(babyId)` — `'use server'`, `assertIsAdmin(supabase, babyId)` first, then `stripe.checkout.sessions.create({ mode: 'subscription', ..., client_reference_id: babyId, subscription_data: { metadata: { baby_id: babyId } }, success_url, cancel_url })`. Setting `metadata.baby_id` on `subscription_data` (not just `client_reference_id` on the Checkout Session) means every later subscription event carries `baby_id` directly, since `client_reference_id` doesn't exist on the Subscription object the webhook receives for updates/cancellations.
  - `createGazetteBillingPortalSession(babyId)` — same admin check, `stripe.billingPortal.sessions.create(...)`.
- `src/app/api/webhooks/stripe/route.ts` — **must be a Route Handler**, not a Server Action (signature verification needs the raw body: `await request.text()`, never `.json()`). Handles `checkout.session.completed` (upsert row, fetch subscription once for real status/period-end), `customer.subscription.updated`/`.deleted` (look up `baby_id` from `event.data.object.metadata.baby_id`, update). Uses the service-role admin client (no session in a webhook request, same reasoning as `notify.ts`). No separate idempotency table — every branch is an upsert/update keyed on stable IDs, so Stripe's retries are naturally idempotent.
- New server-only runtime env vars (never `NEXT_PUBLIC_*`, never a Docker build-arg): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_GAZETTE` — added to `mise.toml [env]`, `.env.docker.example`, both compose files, same wiring as `RESEND_API_KEY`/`EMAIL_FROM` today.

## Phase 3 — Gating UI

- `header.tsx`: the `"gazette"` nav entry becomes per-baby-conditional on `hasGazetteAccess(babyId)`, while the other entries stay unconditional — the `accesses = allUserAccess.map(...)` shape already computes `allowedPages` per baby-access row, so this is a filter-condition change, not a restructure.
- `src/app/baby/[babyId]/gazette/page.tsx` independently re-checks `hasGazetteAccess(babyId)` (nav hiding is UX only, the route is the real gate):
  - Not gated → `_components/gazette_upsell.tsx`: admins get a "Subscribe" CTA (`createGazetteCheckoutSession`); non-admin viewers get a passive "ask a journal admin" message.
  - Gated → the settings page from the Gazette plan, plus a "manage billing" link (`createGazetteBillingPortalSession`, admin-only).
- Cron job gets one added filter: only process babies where `has_gazette_access` / `status IN ('active','trialing')`.

## Phase 4 — Donation links

- `.github/FUNDING.yml` (repo root's `.github/` — GitHub renders the "Sponsor" button automatically):
  ```yaml
  github: [<your-github-username>]
  custom: ["https://www.buymeacoffee.com/<your-bmc-handle>"]
  ```
- `src/components/support_links.tsx` — plain Server Component, two outbound links, no backend. Wired into the existing global `<footer>` in `src/app/layout.tsx` next to `<VersionFooter>`.

## Phase 5 — License note

- `LICENSE` stays unmodified (hand-editing PolyForm Noncommercial risks tooling flagging it as an unrecognized custom license).
- New `NOTICE.md` at repo root, plain-language:
  > This project is licensed under PolyForm Noncommercial 1.0.0 (see `LICENSE`). That license restricts what *you*, as a licensee, may do — it does not restrict the copyright holder. Concretely: (1) self-hosting for noncommercial purposes remains free, unchanged; (2) the copyright holder may operate a hosted version and/or offer optional paid features (like the Gazette) without changing your rights as a licensee; (3) reselling this software, or a modified version, as a competing commercial hosted service remains prohibited — already true under "noncommercial," not a new restriction.
- One added line in `README.md`'s `## 📄 License` section linking to it.

## Critical files
- `supabase/migrations/20260727013047_baby_access_helper_functions.sql` — pattern to mirror for `has_gazette_access`
- `src/app/_header/header.tsx`, `src/utils/actions/access.ts` (`assertIsAdmin`)
- `README.md` (License section), new `NOTICE.md`, new `.github/FUNDING.yml`

## Verification
- Stripe webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`; real test-mode Checkout (not just `stripe trigger`, which lacks real metadata) confirms `baby_subscriptions` upserts; `stripe trigger customer.subscription.updated`/`.deleted` confirms status transitions propagate and `hasGazetteAccess` flips.
- Gating: admin of an unpaid baby sees the upsell, not the nav item; after a test Checkout, both flip to settings view; non-admin viewer never sees the Checkout CTA.
- Cross-baby isolation: user who's a member of two babies (one paid, one not) sees the Gazette nav item for only the paid one.
- Authorization: non-admin viewer calling either Stripe action gets "Non autorisé" from `assertIsAdmin`.
