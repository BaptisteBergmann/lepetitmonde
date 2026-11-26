# SaaS Pricing & Infrastructure Cost Analysis

Status: planning

## Pricing Tiers

| | Free | Pro | Family |
|---|---|---|---|
| Price | $0 | **$5/mo** or **$49/yr** | **$8/mo** or **$79/yr** |
| EUR pricing | — | **4.99€/mo** or **49€/yr** | **7.99€/mo** or **79€/yr** |
| Babies | 1 | 3 | Unlimited |
| Storage | 500 MB (~200 photos) | 10 GB | 50 GB |
| Circle members | 3 | 10 | Unlimited |
| AI features (MCP, digests) | — | Yes | Yes |
| Priority support | — | — | Yes |
| Data export | JSON only | JSON + PDF | JSON + PDF + photobook |

### Rationale

- **$5 not $7:** competitors (Huckleberry, Baby Tracker) charge $5-6/mo. $7 is upper end with no brand recognition.
- **$49/yr (~$4.08/mo):** 2 months free nudges annual adoption; locks in retention through sleep-deprived months.
- **$8 Family tier:** captures "both grandparents want full access" households; anchors $5 as the obvious deal.
- **Free tier is marketing, not revenue:** 500 MB ≈ 2-3 months of photos, enough to hook but limited enough to convert.
- **Apple IAP tax:** net ~$4.25/mo on $5 tier through iOS (15% small business program). Push web signups.

---

## Infrastructure Costs by Scale

Assumptions: 10% free→paid conversion, ~2 GB storage/paid user, ~300 MB/free user, ~10 emails/user/mo.

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

---

## Revenue & Margins

| | 50 paid | 200 paid | 500 paid | 1K paid | 5K paid |
|---|---|---|---|---|---|
| Gross MRR | $250 | $1,000 | $2,500 | $5,000 | $25,000 |
| Stripe fees (~3.2%) | -$48 | -$192 | -$480 | -$960 | -$4,800 |
| Apple IAP 15% (est. 40% iOS) | -$15 | -$60 | -$150 | -$300 | -$1,500 |
| **Net revenue** | **$187** | **$748** | **$1,870** | **$3,740** | **$18,700** |
| **Profit/mo** | **$144** | **$674** | **$1,702** | **$3,407** | **$17,563** |
| **Margin %** | **77%** | **90%** | **91%** | **91%** | **94%** |
| Cost per paid user | $0.86 | $0.37 | $0.34 | $0.33 | $0.23 |

Break-even at ~5 paid users ($43 infra / ~$7.50 net per user).

---

## Storage Provider Comparison

### Storage cost (per GB/month)

| Provider | Standard | Infrequent | Archive | Free tier |
|---|---|---|---|---|
| **Cloudflare R2** | $0.015 | $0.010 | — | 10 GB |
| **OVH Object Storage** | ~€0.007 ($0.008) | ~€0.005 | €0.0013 | None (CA$270 credit 1 mo) |
| **AWS S3** | $0.023 | $0.0125 | $0.004 (Glacier) | 100 GB free credit |
| **GCP Cloud Storage** | $0.020-0.026 | $0.010 (Nearline) | $0.004 | 5 GB always-free |

### Egress cost (per GB)

| Provider | Free allowance | After free tier | 1 TB/mo | 5 TB/mo |
|---|---|---|---|---|
| **Cloudflare R2** | **Unlimited** | **$0** | **$0** | **$0** |
| **OVH Object Storage** | ~75 GB/mo | €0.01/GB | ~€9 | ~€49 |
| **AWS S3** | 100 GB/mo | $0.09/GB | ~$81 | ~$441 |
| **GCP Cloud Storage** | 1-100 GB/mo | $0.12/GB | ~$108 | ~$576 |

### Total cost (storage + egress) for the app

Assuming 50% of stored data egressed monthly (photos written once, viewed many times by family).

| Paid users | Stored | R2 | OVH | S3 | GCP |
|---|---|---|---|---|---|
| 50 | 235 GB | **$3** | **€2** | **$7** | **$8** |
| 200 | 940 GB | **$14** | **€11** | **$55** | **$68** |
| 500 | 2.35 TB | **$35** | **€29** | **$151** | **$190** |
| 1,000 | 4.7 TB | **$71** | **€59** | **$311** | **$392** |
| 5,000 | 23.5 TB | **$353** | **€297** | **$1,590** | **$2,009** |

### EU / GDPR data residency

| | Data in EU? | Data in France? | Sovereign entity? |
|---|---|---|---|
| **R2 (EU jurisdiction)** | Yes (guaranteed) | Maybe | No (US company) |
| **OVH Object Storage** | Yes | Yes (Gravelines/Strasbourg) | Yes (French company) |

R2 supports EU data residency via `--jurisdiction eu` (endpoint: `<accountId>.eu.r2.cloudflarestorage.com`). No France-specific pin — could be Paris, Amsterdam, Frankfurt. GDPR doesn't require data in France, just adequate protection. "Hébergé en France" marketing requires OVH.

---

## Decision

**Cloudflare R2 with EU jurisdiction for photos.** Zero egress is worth the ~2× storage premium over OVH for a read-heavy photo app. Both are S3-compatible, so migrating to OVH later is straightforward if "100% French hosting" becomes a differentiator.

**OVH VPS for compute** (French datacenter, GDPR angle, cheapest option).

**Avoid S3 and GCP** — egress tax is brutal for a photo app. At 1K paid users, S3 egress alone ($203/mo) exceeds R2's entire bill ($71/mo).
