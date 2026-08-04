# Admin-configurable page access (no code changes needed)

## Goal

Let an admin, from the admin page, control per baby:
- which of the app's pages are **enabled** for their family
- what **role** is required to see each one (everyone, or admins only)

— without a code change or redeploy. Today this is hardcoded in three separate places (see
below), so it also drifts: `inventory` and `buy-list` were never added to the root baby landing
page's section list when those features shipped, even though they're in the nav. This plan fixes
that structurally by introducing a single source of truth, not just adding a settings screen on
top of the duplication.

Decisions confirmed with the user:
- **Real enforcement, not just nav visibility**: toggling a page off, or restricting it to admins,
  actually blocks direct URL access — it's not cosmetic. This is the reason this plan touches
  every existing page, not just the header.
- **All pages are manageable except Administration itself**, which is hard-excluded so an admin
  can never lock themselves out of the settings screen.

## The duplication today

The same page list, with the same `role` field, is currently hardcoded in three places that can
(and did) drift out of sync:
1. `src/app/_header/header.tsx` — the `pages` array feeding nav (`PageSelector`, `MobileMenu`).
2. `src/app/_header/mobile_menu.tsx` — a separate `page.id === '...' ? Icon : ...` ternary chain
   for icons.
3. `src/app/baby/[babyId]/page.tsx` — the `SECTIONS` array for the baby landing page's cards,
   which also carries `name`/`eyebrow`/`description`/`icon`, independently of #1.

`inventory` and `buy-list` are in #1 but missing from #3 — confirmed while researching this plan.
This plan replaces all three with reads from one shared registry + per-baby DB overrides, which
closes that class of bug for good (any future page only needs to be added once).

## Data model

### Code: the page registry (no DB row needed for defaults)

New file `src/utils/page_registry.ts` — the single canonical list of every real page, replacing
the header/mobile-menu/landing-page duplicates:

```ts
export type PageId = 'feed' | 'calendar' | 'guess' | 'inventory' | 'buy-list' | 'admin'

export const PAGE_REGISTRY: {
  id: PageId
  name: string
  eyebrow: string
  description: string
  icon: LucideIcon
  defaultRole: Enums<'role'>
  defaultEnabled: boolean
  manageable: boolean // false only for 'admin'
}[] = [
  { id: 'feed', name: 'Journal', ..., defaultRole: 'viewer', defaultEnabled: true, manageable: true },
  { id: 'calendar', name: 'Calendrier', ..., defaultRole: 'viewer', defaultEnabled: true, manageable: true },
  { id: 'guess', name: 'Pronostics', ..., defaultRole: 'viewer', defaultEnabled: true, manageable: true },
  { id: 'inventory', name: 'Inventaire', ..., defaultRole: 'admin', defaultEnabled: true, manageable: true },
  { id: 'buy-list', name: "Liste d'achats", ..., defaultRole: 'viewer', defaultEnabled: true, manageable: true },
  { id: 'admin', name: 'Administration', ..., defaultRole: 'admin', defaultEnabled: true, manageable: false },
]
```

`name`/`eyebrow`/`description`/`icon` are pulled from the existing `header.tsx` pages array and
`page.tsx` SECTIONS array (they already agree on name/icon; eyebrow/description only exist today
in SECTIONS, so `inventory`/`buy-list` get new ones written to match their existing page headers).

The unbuilt "Newsletter" placeholder (`enabled: false` in `header.tsx` today, absent from
`page.tsx` — another instance of the drift) is dropped rather than migrated in: there's no route
behind it, so it's inert either way, and adding it back once it's actually built is a one-line
registry entry.

### DB: sparse per-baby overrides

New table `page_settings`, migration `supabase/migrations/<timestamp>_create_page_settings.sql`,
same convention as every other table (plain `GRANT`, no RLS — see `.claude/plans/rls.md`):

```sql
CREATE TABLE "public"."page_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "baby_id" uuid NOT NULL REFERENCES "public"."babies"("id") ON DELETE CASCADE,
  "page_id" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "required_role" "public"."role" NOT NULL DEFAULT 'viewer',
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("baby_id", "page_id")
);
```

Reuses the existing `role` enum (`admin`/`viewer`) — no new enum needed. Sparse by design, same
idea as `notification_preferences`: a baby only gets a row here once an admin actually changes
something away from the registry default, not one row per page per baby up front. `page_id` isn't
FK'd to anything (it's a code-level id from the registry, not a DB entity) — the Server Action
validates it against `PAGE_REGISTRY`'s `manageable` ids, rejecting `'admin'` or unknown values.

## Server Actions — new `src/utils/actions/page_settings.ts`

- `getPageSettings(babyId)` — **any member** (needed to render nav for every role, not just
  admins). Merges `page_settings` rows over `PAGE_REGISTRY` defaults, returns the full resolved
  list (`{ id, name, eyebrow, description, icon, enabled, role, manageable }[]`) including
  `admin`, which is always `{ enabled: true, role: 'admin' }` regardless of any DB row (defense in
  depth even though the UI never offers to edit it).
  This is called on **every page load** (nav renders on every request, plus every protected page
  calls the assertion below) — TTL-cache it the same way `getUserAccess`/`getNicknamesByBaby` are
  cached (`createTtlCache`, ~5s), or it turns into a query per navigation.
- `updatePageSetting(babyId, pageId, { enabled, role })` — admin-only (`assertIsAdmin`); 400s if
  `pageId` isn't in the registry's manageable set; upserts into `page_settings`;
  `revalidatePath(`/baby/${babyId}`, 'layout')`.
- `assertPageAccess(babyId, pageId)` — the enforcement primitive every protected page calls.
  Looks up the resolved setting for `pageId`, checks the caller's `getUserAccess(babyId)` against
  it, and `redirect(`/baby/${babyId}`)` (with a `logger.warn`) if the page is disabled or the
  caller's role doesn't meet `required_role`. Redirecting to the baby's own landing page is safe
  from a loop perspective — that page never redirects further, it only filters which section
  cards it shows.

## Retrofitting existing pages

This is the bulk of the change, and the reason "real enforcement" costs more than a nav-only
toggle: every page that currently either has no role check at all, or a hardcoded one, switches to
calling `assertPageAccess`.

| Page | Today | After |
|---|---|---|
| `feed/page.tsx` | no gate — any member | `await assertPageAccess(babyId, 'feed')` |
| `calendar/page.tsx` | no gate — any member | `await assertPageAccess(babyId, 'calendar')` |
| `guess/page.tsx` | no gate — any member | `await assertPageAccess(babyId, 'guess')` |
| `guess/admin/page.tsx` | hardcoded redirect if not admin | `await assertPageAccess(babyId, 'guess')` first (feature-level gate), **then** keep its existing hardcoded admin check — that one is about who can manage pronostic questions within the feature, a different concern from "can you reach Pronostics at all" |
| `inventory/page.tsx` | hardcoded redirect if not admin | `await assertPageAccess(babyId, 'inventory')` replaces the hardcoded check entirely |
| `buy-list/page.tsx` | no gate — any member | `await assertPageAccess(babyId, 'buy-list')` |
| `admin/page.tsx` | not gated (renders less for non-admins, but reachable by any member) | unchanged — `admin` is the hard-excluded, always-on page; this plan doesn't touch its access model |

## Nav + landing page: read from the registry instead of hardcoding

- `src/app/_header/header.tsx` — `getAllUserAccess()` still gives the babies the user belongs to;
  for each one, `await getPageSettings(acc.baby_id)` replaces the local hardcoded `pages` array.
  The existing filter (`page.enabled && (access_level === "admin" || access_level === page.role)`)
  stays the same shape, just fed from the resolved list.
- `src/app/_header/mobile_menu.tsx` — the `page.id === 'guess' ? HelpCircle : ...` ternary chain
  goes away; the icon now travels with each resolved page object from the registry. (Passing a
  Lucide icon component reference from a Server Component to a Client Component as a prop is
  fine — it's a component reference, not a closure.)
- `src/app/baby/[babyId]/page.tsx` — `SECTIONS` is replaced by `getPageSettings(babyId)` too. This
  is what fixes `inventory`/`buy-list` being absent from the landing page, as a direct consequence
  of removing the duplicate list rather than a separate fix.

## Admin UI

New card on the existing `/baby/[babyId]/admin` page, "Pages & accès" — lists the five manageable
pages (Journal, Calendrier, Pronostics, Inventaire, Liste d'achats), each row:
- an enabled/disabled checkbox — same plain `<input type="checkbox">` pattern already used for the
  "Afficher uniquement ce qu'il reste à acheter" toggle in `inventory_list.tsx`, no new dependency
- a role `Select` ("Tout le monde" / "Administrateurs seulement"), reusing the existing shadcn
  `Select` component

Client Component, `useState` seeded from server props, optimistic update + rollback on error via
`toast`, same shape as `display_bug_reports.tsx`. Each change calls `updatePageSetting` directly
(no separate save button — matches the existing inline-edit pattern used for bug report statuses).

## Explicit non-goals

- No UI to add entirely new pages — only enable/disable and set the role for pages that already
  exist in code and are listed in `PAGE_REGISTRY`. A genuinely new feature still needs a route.
- No global/instance-wide default editor — defaults live in `PAGE_REGISTRY` (code); only per-baby
  overrides are DB-backed.
- No live push of settings changes to other members' already-open tabs — relies on the ~5s TTL
  cache plus normal navigation, not realtime like the buy-list stepper. A member mid-session on a
  page an admin just disabled won't be kicked out until their next navigation.
- `admin` itself is permanently excluded from being toggled (guardrail against admin lockout).

## Git workflow

Per CLAUDE.md: one commit per verified subtask, `CHANGELOG.md` updated in an immediate follow-up
commit each time. This plan has more moving parts than the inventory/buy-list ones, so more steps:

1. Migration (`page_settings` table) + regenerated `database.types.ts`
2. `src/utils/page_registry.ts` (pure data, no behavior change yet — safe standalone commit)
3. Server Actions (`page_settings.ts`): `getPageSettings`, `updatePageSetting`, `assertPageAccess`
4. Retrofit `header.tsx` + `mobile_menu.tsx` to read from `getPageSettings` instead of the
   hardcoded arrays
5. Retrofit `/baby/[babyId]/page.tsx` (`SECTIONS` → registry) — fixes the inventory/buy-list gap
6. Add `assertPageAccess` to each protected page (`feed`, `calendar`, `guess`, `guess/admin`,
   `inventory`, `buy-list`), removing the now-redundant hardcoded checks in `inventory`/`guess/admin`
7. Admin UI: new "Pages & accès" card + its client component
