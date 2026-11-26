# SaaS Roadmap — Le Petit Monde

## Strategy

Open-source the self-hosted version (marketing engine + community) while running a
hosted SaaS for non-technical parents. Native iOS and Android apps built as separate
codebases (SwiftUI / Jetpack Compose) sharing the same Supabase backend.

Revenue model: freemium with three tiers:

| | Free | Pro | Family |
|---|---|---|---|
| Price | $0 | $5/mo or $49/yr | $8/mo or $79/yr |
| EUR | — | 4.99€/mo or 49€/yr | 7.99€/mo or 79€/yr |
| Babies | 1 | 3 | Unlimited |
| Storage | 500 MB (~200 photos) | 10 GB | 50 GB |
| Circle members | 3 | 10 | Unlimited |
| AI (MCP, digests) | — | Yes | Yes |
| Priority support | — | — | Yes |
| Data export | JSON only | JSON + PDF | JSON + PDF + photobook |

**Why $5/mo:** competitors (Huckleberry, Baby Tracker) charge $5-6/mo. $49/yr (~$4.08/mo)
gives 2 months free and locks in retention. $8 Family tier captures multi-generational
households and anchors $5 as the obvious deal. Free tier (500 MB ≈ 2-3 months of photos)
hooks users, limits drive conversion.

---

## Phase 0 — Foundation (pre-launch, ~4 weeks)

**Goal:** make the codebase SaaS-ready without breaking the self-hosted story.

### 0.1 Multi-tenancy hardening
- [ ] Complete the RLS rollout (`.claude/plans/rls.md`) — every table must have RLS
      policies. This is the #1 blocker: without it, one leaked key = full DB.
- [ ] Audit all server actions for `getUser()` checks (some already done per
      security plans).
- [ ] Add a `plans` table (`user_id`, `plan`, `limits`, `trial_ends_at`) to gate
      features server-side.

### 0.2 Billing (Stripe)
- [ ] Stripe integration: Checkout for signup, Customer Portal for self-service,
      webhooks for plan changes.
- [ ] Tables: `subscriptions` (mirrors Stripe state), `usage` (storage bytes, photo
      count, baby count).
- [ ] Server-side plan enforcement: middleware or helper that checks limits before
      mutations (photo upload, baby creation, circle invites).
- [ ] Enforce tier limits per the pricing table in Strategy (Free: 1 baby / 500 MB /
      3 circles / no AI; Pro: 3 babies / 10 GB / 10 circles / AI; Family: unlimited).

### 0.3 Onboarding & empty states
- [ ] Guided onboarding flow: add baby → upload first photo → invite partner →
      done. Progressive disclosure, not a wall of features.
- [ ] Every page needs a meaningful empty state (illustration + CTA), not a blank
      screen.
- [ ] Demo/sandbox mode: pre-populated fake baby so prospects can explore before
      signing up.

### 0.4 Auth improvements
- [ ] Social login (Google, Apple) — table stakes for consumer apps.
- [ ] Email verification flow polish.
- [ ] "Magic link" option for less technical users.

---

## Phase 1 — Web SaaS Launch (~4 weeks after Phase 0)

**Goal:** paying customers on the web app.

### 1.1 Landing page & marketing site
- [ ] Marketing site (can be a separate Next.js app or pages in the same app under
      `/` for logged-out users).
- [ ] Hero: screenshot + "The baby journal your family will actually use."
- [ ] Feature grid, pricing table, testimonials (recruit beta families).
- [ ] SEO pages: "best baby tracker app", "baby journal for parents", localized
      for FR/EN.

### 1.2 Hosted infrastructure
- [ ] **App hosting**: OVHcloud VPS (France, Gravelines/Strasbourg), ~€7/mo for
      2 GB RAM. Full root, Docker, GDPR-compliant French datacenter. Deploy via
      the existing CI pipeline (GitHub Actions → GHCR → docker pull on VPS).
      Install Coolify or keep the current Portainer setup for deploy management.
- [ ] **Database + Auth**: Supabase Cloud Pro ($25/mo). Migrate from self-hosted
      Supabase — export DB + auth.users, re-point env vars. Keeps RLS, generated
      types, and native SDKs for iOS/Android.
- [ ] **Photo/video storage**: Cloudflare R2 (free up to 10 GB, then $0.015/GB/mo,
      zero egress). Replace Supabase Storage for user uploads. Serve via Cloudflare
      CDN with on-the-fly image resizing (Cloudflare Images, $5/mo) for thumbnails.
- [ ] **CDN + DNS**: Cloudflare free tier in front of the OVH VPS. Unlimited
      bandwidth, DDoS protection, caching.
- [ ] **Transactional email**: Resend (already integrated — free tier: 3K emails/mo,
      100/day; upgrade to $20/mo at ~50+ families for digest/billing templates).
- [ ] **Error tracking**: Sentry free tier (5K errors/mo — plenty until hundreds of
      active users).
- [ ] **Analytics**: PostHog free tier (1M events/mo, 5K session replays — supports
      ~400-500 families). Privacy-first, fits the brand.

### 1.3 PWA improvements
- [ ] Service worker for offline read access (cached feed, recent photos).
- [ ] Background sync for tracker entries logged offline.
- [ ] Install prompt / add-to-homescreen nudge after 3rd visit.

### 1.4 GDPR / Legal
- [ ] Privacy policy (children's data — strict in EU, COPPA in US).
- [ ] Terms of service.
- [ ] Data export (full JSON + photos zip).
- [ ] Account deletion (hard delete, not soft).
- [ ] Cookie consent (if adding analytics).
- [ ] DPA with Supabase if using their cloud.

### 1.5 Open-source release
- [ ] Execute the existing `public-release.md` plan.
- [ ] License: AGPL (like Immich/Plausible — forces SaaS competitors to open-source
      their changes, protects your hosted offering).
- [ ] GitHub README with screenshots, one-click Docker Compose deploy.
- [ ] Submit to Awesome-Selfhosted, post on r/selfhosted, HN "Show HN".

---

## Phase 2 — iOS App (~6-8 weeks)

**Goal:** native iOS app in the App Store.

### 2.1 Architecture
- [ ] SwiftUI app talking directly to Supabase via `supabase-swift`.
- [ ] Same auth (Supabase Auth), same RLS, same storage buckets.
- [ ] Shared nothing with the web codebase except the database schema.
- [ ] Offline-first for tracker: Core Data or SwiftData local cache, background
      sync to Supabase.

### 2.2 Core screens (MVP — ship fast)
- [ ] Login / signup (social + email).
- [ ] Baby dashboard (today's tracker summary, recent feed).
- [ ] Tracker: bottle / breast / sleep / diaper — tap-to-log, < 500ms.
- [ ] Timer mode for breastfeeding / sleep.
- [ ] Photo capture → upload → album.
- [ ] Feed (posts, stories — read-only is fine for v1).
- [ ] Push notifications via APNs (already have web-push infra; wire APNs).

### 2.3 Ship & iterate
- [ ] TestFlight beta with 10-20 families.
- [ ] App Store submission ($99/yr developer account).
- [ ] In-app purchase or Stripe for subscriptions (Apple takes 15-30% via IAP;
      consider linking to web checkout to avoid the cut — allowed if not
      prompted in-app, per EU DMA).

---

## Phase 3 — Android App (~4-6 weeks after iOS)

**Goal:** native Android app on Google Play.

### 3.1 Architecture
- [ ] Kotlin + Jetpack Compose, same pattern as iOS.
- [ ] `supabase-kt` client.
- [ ] Room DB for offline cache.

### 3.2 Core screens
- [ ] Same MVP scope as iOS.
- [ ] Material You design language.
- [ ] FCM push notifications.

### 3.3 Ship
- [ ] Closed beta on Google Play ($25 one-time developer fee).
- [ ] Google Play billing or Stripe (same IAP consideration as iOS).

---

## Phase 4 — Growth & Differentiation (~ongoing)

### 4.1 AI features (the moat)
- [ ] "Ask about your baby" — in-app chat powered by Claude via MCP.
      "When was the last bottle?" / "Show me sleep trends this week."
- [ ] AI-generated weekly digest: "This week, baby slept 2h more than last week,
      started solids on Tuesday, and grandma visited twice."
- [ ] Smart notifications: "Baby hasn't eaten in 4 hours" (learned from patterns).
- [ ] Photo auto-tagging: milestones, people, locations.

### 4.2 Viral features
- [ ] Shareable milestone cards (Instagram-story-sized, branded).
- [ ] Monthly recap video (auto-generated from photos + events).
- [ ] Family tree / circles improvements — grandparent-friendly read-only view.

### 4.3 Localization
- [ ] French (your native market — do this early, possibly Phase 1).
- [ ] Spanish, German, Portuguese (large parent populations).
- [ ] RTL support if Arabic/Hebrew demand appears.

### 4.4 Integrations
- [ ] Apple Health / Google Fit (growth data sync).
- [ ] Calendar sync (doctor appointments → Google/Apple Calendar).
- [ ] Pediatrician export (PDF growth chart + vaccination record).

---

## Revenue projections (conservative)

| Milestone | Timeline | Users (free) | Users (paid) | MRR |
|-----------|----------|-------------|-------------|-----|
| Web launch | Month 0 | 50 | 5 | $25 |
| Open-source buzz | Month 2 | 300 | 30 | $150 |
| iOS launch | Month 4 | 1,000 | 100 | $500 |
| Android launch | Month 7 | 2,500 | 250 | $1,250 |
| Word of mouth | Month 12 | 5,000 | 500 | $2,500 |
| Maturity | Month 18 | 10,000+ | 1,000+ | $5,000+ |

Assumptions: 10% free→paid conversion (industry avg for baby apps), $5/mo avg.

---

## Costs & margins by scale

Assumptions: ~2 GB storage/paid user, ~300 MB/free user, ~10 emails/user/mo.

### Infrastructure costs

| | 50 paid | 200 paid | 500 paid | 1K paid | 5K paid |
|---|---|---|---|---|---|
| **Total users** | 500 | 2,000 | 5,000 | 10,000 | 50,000 |
| OVH VPS | $8 | $8 | $15 | $30 | $75 |
| Supabase Pro | $25 | $25 | $35 | $50 | $100 |
| R2 storage | $3 | $14 | $35 | $70 | $350 |
| Cloudflare Images | $5 | $5 | $5 | $5 | $20 |
| Resend | $0 | $20 | $20 | $60 | $200 |
| Sentry | $0 | $0 | $26 | $26 | $80 |
| PostHog | $0 | $0 | $20 | $80 | $300 |
| Domain | $2 | $2 | $2 | $2 | $2 |
| App stores (annualized) | — | — | $10 | $10 | $10 |
| **Total infra** | **$43** | **$74** | **$168** | **$333** | **$1,137** |

### Revenue & margins

| | 50 paid | 200 paid | 500 paid | 1K paid | 5K paid |
|---|---|---|---|---|---|
| Gross MRR | $250 | $1,000 | $2,500 | $5,000 | $25,000 |
| Stripe fees (~3.2%) | -$48 | -$192 | -$480 | -$960 | -$4,800 |
| Apple IAP 15% (est. 40% iOS) | -$15 | -$60 | -$150 | -$300 | -$1,500 |
| **Net revenue** | **$187** | **$748** | **$1,870** | **$3,740** | **$18,700** |
| **Profit/mo** | **$144** | **$674** | **$1,702** | **$3,407** | **$17,563** |
| **Margin %** | **77%** | **90%** | **91%** | **91%** | **94%** |
| Cost per paid user | $0.86 | $0.37 | $0.34 | $0.33 | $0.23 |

Break-even at **~5 paid users** ($43 infra / ~$7.50 net per user).

### Bandwidth / egress

No bandwidth bills thanks to OVH + Cloudflare:

| Service | Bandwidth | Overage | Risk |
|---------|-----------|---------|------|
| OVHcloud VPS | Unmetered (port-speed capped) | Throttled, not billed | None |
| Cloudflare CDN | Unlimited | $0 | None |
| Cloudflare R2 | Zero egress, always | $0 | None |
| Supabase Cloud Pro | 250 GB/mo | $0.09/GB | Low — JSON only, not photos |

### Storage provider comparison

| Provider | Storage/GB/mo | Egress/GB | 1K paid users total |
|---|---|---|---|
| **Cloudflare R2** | $0.015 | **$0** | **$71** |
| **OVH Object Storage** | ~€0.007 | €0.01 | **€59** |
| **AWS S3** | $0.023 | $0.09 | **$311** |
| **GCP Cloud Storage** | $0.020-0.026 | $0.12 | **$392** |

R2 wins for read-heavy photo workloads. OVH is cheaper on storage but charges egress
(€0.01/GB). S3/GCP egress is prohibitive at scale. Both R2 and OVH are S3-compatible,
so migration between them is straightforward.

### R2 EU data residency

R2 supports `--jurisdiction eu` (endpoint: `<accountId>.eu.r2.cloudflarestorage.com`)
guaranteeing data stays in the EU. No France-specific pin. GDPR-compliant but not
"hébergé en France" — only OVH delivers that. For the "100% French" marketing angle,
OVH Object Storage can be added later without app changes (S3-compatible API).

---

## Decision log

- **Keep Supabase**: switching cost is enormous (auth, RLS, generated types, server
  actions, storage all wired in deep). Business logic lives in Next.js Server Actions
  with `getUser()` checks — RLS is defense-in-depth, not the application layer. This
  avoids the anti-patterns criticized by the community (client-side logic, Edge
  Functions as business layer). Auth lock-in exists but applies to any auth provider.
- **Keep Next.js**: right tool for SSR + server actions + PWA as a solo dev. Only
  alternative worth considering would be Remix/RR7, but rewriting is pure churn.
  Self-hosting on Docker avoids Vercel lock-in.
- **App hosting: OVHcloud VPS (France)**: ~€7/mo, GDPR-compliant French datacenter,
  full Docker control. Cheaper than Vercel Pro ($20/mo) and keeps the "hébergé en
  France" marketing angle. Hetzner (Germany, €5.50/mo) is a fallback. No self-hosting
  in the long run — managed VPS only.
- **Photo storage: Cloudflare R2 with EU jurisdiction**: zero egress fees, critical
  for a photo-heavy app at scale. At 1K paid users, R2 ($71/mo) vs S3 ($311/mo) vs
  GCP ($392/mo). EU jurisdiction guarantees data stays in the EU. OVH Object Storage
  (~€59/mo at 1K users) is slightly cheaper but charges egress (€0.01/GB); can migrate
  later if "hébergé en France" becomes a differentiator (both are S3-compatible).
- **Analytics: PostHog over Plausible**: generous free tier (1M events/mo vs. no free
  hosted tier for Plausible). Privacy-first, EU-friendly.
- **License**: AGPL recommended (Plausible/Immich model) — open source but SaaS
  competitors must also open-source. Alternatives: BSL (Business Source License,
  like Sentry), or PolyForm Noncommercial (current, but limits community adoption).
- **Naming**: keep "Le Petit Monde" for now; revisit if international traction
  happens and the name proves to be friction.
- **Native vs. Capacitor**: native (SwiftUI + Kotlin) — AI can maintain the
  codebases, and the UX ceiling is higher.
- **Pricing at $5/mo not $7:** baby tracker competitors charge $5-6/mo. $49/yr annual
  plan (~$4.08/mo) locks in retention through sleep-deprived months. $8 Family tier
  captures multi-generational households. Break-even at ~5 paid users.
- **Apple IAP budget:** 15% cut (small business program) on est. 40% of paid users
  coming through iOS. Push web signups and annual plans to reduce the IAP drag. DMA
  web-checkout loophole is upside, not the baseline plan.

## Status: planning
