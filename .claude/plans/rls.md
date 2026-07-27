# Row Level Security (RLS)

## Context

Confirmed in `security-review.md` finding 2 and re-verified here: none of the 17 migrations under `supabase/migrations/` contain `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY`. Every table is created with `GRANT ALL ... TO anon, authenticated, service_role`. All baby-membership, admin, and circle-visibility checks live exclusively in `src/utils/actions/*.ts` / `src/app/api/*`.

Mitigating factor: there is no browser-side Supabase client anywhere (`src/utils/supabase/client.ts` doesn't exist, nothing imports `@supabase/supabase-js` client-side), and `SUPABASE_URL` is a server-only LAN address, never `NEXT_PUBLIC_*`. So this isn't exploitable from the browser today. It becomes exploitable the moment: the app server is compromised, the internal Supabase/Kong endpoint becomes reachable from somewhere it shouldn't, or a future feature adds a client-side Supabase call. RLS turns those from "full read/write of every baby's data" into "denied." Inviting people outside the household (friends, not just family) raises the value of closing this before that happens, since it also means more accounts/devices with valid JWTs that could be compromised independently of the server.

Goal of this plan: enumerate the actual access rules the app already enforces in code, then encode the same rules as RLS policies — a backstop, not a redesign. Nothing here should change what any user can currently do through the app.

---

## Part 1 — Relations and permissions needed

### 1.1 Entity relations

```
babies (id)
 ├─ baby_access (baby_id, user_id, access_level: admin|viewer, nickname, relation_to_baby)  — the membership/role table
 ├─ circles (id, baby_id, parent_circle → circles.id)                                        — sub-audiences within a baby
 │   └─ circles_access (circle_id, user_id, baby_id)                                          — circle membership
 ├─ invitations (id, baby_id, expires_at)                                                     — bearer-token signup capability
 ├─ notification_preferences (user_id, baby_id, notification_type)                            — sparse opt-out
 ├─ notifications (id, user_id, baby_id, notification_type, ...)                               — in-app inbox
 ├─ guess_questions (baby_id, id, status: pending|approved|rejected, created_by)
 │   └─ guesses (user_id, question_id, baby_id)
 ├─ events (id, baby_id, created_by, kind, milestone_type)
 │   └─ events_circles (event_id, circle_id)                                                  — 0..N circles, none = admin-only
 └─ posts (id, baby_id, created_by)
     ├─ posts_circles (post_id, circle_id)                                                    — same "none = admin-only" rule
     ├─ post_photos (post_id)
     ├─ post_reactions (post_id, user_id)
     ├─ post_comments (post_id, user_id, circle_ids uuid[])                                   — denormalized, not a join table
     ├─ post_views (post_id, user_id)
     └─ polls (post_id)
         ├─ poll_options (poll_id)
         └─ poll_votes (poll_id, option_id, user_id)

users (id = auth.users.id, first_name, last_name)                — shared profile, not baby-scoped
 ├─ push_subscriptions (user_id, endpoint)                        — per-device, not baby-scoped
 └─ notification_settings (user_id, quiet_hours_*)                — per-user, not baby-scoped

bug_reports (id, created_by)                                      — standalone, NO baby_id at all
```

### 1.2 Role model

- `role` enum: `admin` | `viewer`, scoped per `(baby_id, user_id)` via `baby_access`. This is the only role concept in the schema — **no instance-wide superadmin exists**.
- `circles_access` is a finer-grained "audience" layer *within* a baby: posts/events tagged with 0 circles are admin-only; tagged with N circles are visible to admins + anyone in any of those circles.
- Nothing above `access_level = 'admin'` exists. Every admin of every baby is currently equally powerful instance-wide *only because RLS doesn't exist yet* — one goal of this migration is to make "admin of baby A" and "admin of baby B" actually mean different things at the database level.

### 1.3 Permission matrix (mirrors current app-code behavior, not a new policy)

Legend: **member** = has a `baby_access` row for that baby (any level) · **admin** = `baby_access.access_level = 'admin'` for that baby · **circle-visible** = post/event tagged with a circle the user belongs to, or admin.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `babies` | member | service_role only (no self-serve create today) | service_role only | service_role only |
| `baby_access` | member (own baby) | self, own row, at signup only — see §2.1 | admin (any column) **or** self (nickname/relation_to_baby only — see §2.4) | admin |
| `circles` | member | admin | — (unused) | admin |
| `circles_access` | member | admin | — (unused) | admin |
| `invitations` | admin (own baby) **+** anon/authenticated by `id` — see §2.2 | admin | — (unused) | — (unused, flag as gap: invites never expire from the table, only checked at signup) |
| `guess_questions` | member AND (`status='approved'` OR `created_by = auth.uid()` OR admin) | member (self, `created_by = auth.uid()`) | admin | admin |
| `guesses` | member (baby-wide, not just own — matches `getAllGuesses`) | self, member (`user_id = auth.uid()`) | — (unused) | — (unused) |
| `events` | circle-visible | admin | admin | admin |
| `events_circles` | circle-visible (via parent event) | admin | — (unused) | admin |
| `posts` | circle-visible | admin | admin | admin |
| `posts_circles` | circle-visible (via parent post) | admin | — (unused) | admin |
| `post_photos` | circle-visible (via parent post) | admin | — (unused) | admin (cascades) |
| `post_reactions` | circle-visible (via parent post) | self, member | — (unused, upsert) | self |
| `post_comments` | circle-visible OR own comment | member (self, `user_id = auth.uid()`) | self (own comment) | self OR admin |
| `post_views` | admin only (`getPostViewsForPosts` short-circuits for non-admins) | self, member | — (unused, upsert) | — (unused) |
| `polls` / `poll_options` | circle-visible (via parent post) | admin | admin | admin |
| `poll_votes` | circle-visible (via parent poll→post) | self, member | — (unused, upsert) | — (unused) |
| `notification_preferences` | self | self **+ system pipeline reading others — see §2.3** | — (delete+reinsert pattern) | self |
| `notification_settings` | self | self **+ system pipeline reading others — see §2.3** | self (upsert) | — (unused) |
| `notifications` | self | **system pipeline writing to other users — see §2.3** | self (`read_at`) | — (unused) |
| `push_subscriptions` | self **+ admin reading baby co-members' devices — see §2.3** | self | self | self **+ system pipeline deleting stale devices — see §2.3** |
| `users` | member-of-shared-baby (currently global — see §2.5) | self, at signup only (`id = auth.uid()`) | self | — (unused) |
| `bug_reports` | **no tenant scoping exists — see §2.6, open decision** | self (`created_by = auth.uid()`) | **no tenant scoping exists — see §2.6** | — (unused) |

---

## Part 2 — Special cases (where "just check baby_access" isn't enough)

### 2.1 Signup self-inserts into `users` and `baby_access`
`signup()` (`src/utils/actions/signup.ts:39-73`) calls `supabase.auth.signUp()`, then — using the *same* client, now carrying the new user's session — inserts into `users` (`id = user.user.id`) and `baby_access` (`user_id = user.user.id`, `access_level` defaults to `'viewer'` via column default). These must stay allowed for a freshly-authenticated user inserting **their own** row, or signup breaks. Policy: `INSERT ... WITH CHECK (id = auth.uid())` on `users`, and `WITH CHECK (user_id = auth.uid())` on `baby_access`. The `baby_id` itself isn't re-validated against the invitation at the DB layer (the app already checked `expires_at` before calling `auth.signUp()`) — acceptable, since a user can already only reach this insert by having a real invitation `id` to read in the first place.

### 2.2 `invitations` read by an unauthenticated (`anon`) role
`signup()` looks up the invitation *before* `auth.signUp()` runs, i.e. as `anon`. This is already a bearer-token model by design (whoever holds the link's token can use it) — RLS doesn't need to make this stricter, just needs to not accidentally break it. Policy: `SELECT` on `invitations` granted to `anon` **and** `authenticated`, unrestricted by row (matches today's behavior — the "auth" is the token itself, known only via the link).

### 2.3 `notify.ts` acts on behalf of other users — the biggest complication
`notifyUsers()` (`src/utils/actions/notify.ts`) runs inside whichever server action triggered it (e.g. `addComment`, called with the commenter's session) and, using that same session:
- reads `notification_preferences` and `notification_settings` for the **recipients**, not the caller
- inserts `notifications` rows with `user_id` = each **recipient**
- reads and deletes `push_subscriptions` rows belonging to **recipients** (delete happens on a 404/410 push failure, to prune stale devices)

None of this is `auth.uid() = user_id` — it's all cross-user, gated today only by the fact that `notifyUsers` is only ever called with a recipient list already computed from a legitimate baby-scoped query (`getVisibleUserIds`, `getBabyAdminIds`, `getAllBabyMemberIds`). Similarly, `getMembersDevices` (`src/utils/actions/notifications.ts:70-98`) lets a baby-admin read *other members'* `push_subscriptions` rows.

**Recommendation: move `notifyUsers` (and `getMembersDevices`) to `createAdminClient()` (service role) instead of writing cross-user RLS policies for `notifications`/`notification_preferences`/`notification_settings`/`push_subscriptions`.** These are internal system-pipeline operations, not something an end user directly drives — encoding "any baby member can write notification rows / delete push subscriptions for any other member of a shared baby" as an RLS policy would be broad, easy to get subtly wrong (e.g. must correctly re-derive the "shares a baby" condition to avoid letting user A spam-insert fake notifications for user B in a baby they don't actually share), and provides little real backstop value since the recipient list is already trusted by the time `notifyUsers` runs. Using the admin client here is exactly the pattern already used for storage (`storage.ts` documents the same reasoning). Keeping self-service reads/writes (`getMyDevices`, `subscribeUser`, `getQuietHours`, etc.) on the regular client with simple `user_id = auth.uid()` policies is unaffected.

This means a small code change alongside the migration, not just SQL — worth flagging now so it isn't a surprise mid-implementation.

### 2.4 `baby_access` has two different UPDATE rules on the same table
`updateUserAccessLevel` (admin changes someone's `access_level`, with a "can't remove the last admin" guard) and `updateBabyAccessSettings` (a user editing their own `nickname`/`relation_to_baby`) both `UPDATE baby_access`. Postgres RLS policies can't restrict *which columns* an UPDATE touches, only which *rows* — so a single `USING`/`WITH CHECK` can't say "admins can change anything, but self can only change nickname." Options:
- **(a)** Two permissive UPDATE policies (`USING (is_baby_admin(baby_id))` and `USING (user_id = auth.uid())`) and accept that, at the DB layer, a self-update *could* also change `access_level` — the "last admin" guard and the "only admin can promote" rule would then live in application code only, same as today. RLS still blocks cross-baby and cross-user writes, just not this one intra-row column distinction.
- **(b)** A `BEFORE UPDATE` trigger that raises if `access_level` changed and the caller isn't an admin, or if `nickname`/`relation_to_baby` changed and the caller isn't self-or-admin.
- Recommend **(a)** for the first pass — it's a strict improvement over today (currently *nothing* stops a cross-baby or cross-user write) and (b) can be added later if the "self-promotes to admin" edge case is judged worth closing at the DB layer too.

### 2.5 `users` is currently a global directory, not baby-scoped
Every `users` row (first_name/last_name) is readable by any authenticated user today via joins (`baby_access.select('*, users(*)')`, reactions/comments/polls resolving names, etc.), and there's no code path that filters `users` by shared baby. Scoping `SELECT` to "shares at least one baby with `auth.uid()`" is a strict tightening, not a like-for-like mirror of current behavior (a friend admin of their own baby currently *could* already read the names of every user on the instance, family or not — this is itself a small existing leak, not something new this migration introduces). Recommend adding the scoped policy anyway since it costs nothing and closes it as part of the same pass.

### 2.6 `bug_reports` has no `baby_id` and no owner concept — open decision
Already flagged in `security-review.md` and the earlier conversation: `getBugReports()`/`updateBugReportStatus()` gate on "admin of *some* baby" (piggybacking on whichever baby's admin page the request came from) but then read/write the **entire, unfiltered** table. There is no schema concept of an instance owner to restrict this to. RLS alone can't fix this without a design decision first:
- **Option A**: add a `system_admins (user_id uuid primary key)` table, seeded manually with just the instance owner's user id, and gate `bug_reports` SELECT/UPDATE on membership in it.
- **Option B**: add `baby_id uuid null` to `bug_reports`, capture it from the page the report was filed on, and scope RLS the same way as everything else (loses the "see every bug report across every baby" admin view unless the instance owner is also admin of every baby, which they are today but a friend-admin wouldn't be).
- This needs a decision before it can be implemented — flagging as **not blocking** the rest of this plan (this table can be RLS-enabled last, or left `service_role`-only in the meantime, i.e. simply revoke `anon`/`authenticated` grants on it and route all access through `getBugReports`/`submitBugReport` via the admin client instead — the cheapest interim fix).

---

## Part 3 — Implementation approach

### 3.1 Helper functions (avoid recursive-policy footguns)

A policy on `baby_access` that queries `baby_access` to check membership is self-referential and needs `SECURITY DEFINER` functions to avoid infinite recursion / performance cliffs:

```sql
create or replace function public.is_baby_member(target_baby_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.baby_access
    where baby_id = target_baby_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_baby_admin(target_baby_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.baby_access
    where baby_id = target_baby_id and user_id = auth.uid() and access_level = 'admin'
  );
$$;

create or replace function public.is_circle_visible(target_baby_id uuid, target_circle_ids uuid[])
returns boolean language sql security definer stable as $$
  select public.is_baby_admin(target_baby_id) or exists (
    select 1 from public.circles_access
    where baby_id = target_baby_id
      and user_id = auth.uid()
      and circle_id = any(target_circle_ids)
  );
$$;

create or replace function public.shares_baby_with(target_user_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.baby_access a
    join public.baby_access b on a.baby_id = b.baby_id
    where a.user_id = auth.uid() and b.user_id = target_user_id
  );
$$;
```

`is_circle_visible` needs the caller to pass the tagged circle ids, since `events`/`posts` don't carry them directly (they live in `events_circles`/`posts_circles`). Policies on `events`/`posts` themselves can inline the `circles_access` join directly rather than going through the join table twice; policies on `events_circles`/`posts_circles`/`post_photos`/etc. (which only have the parent id) will call `is_circle_visible` against a subquery for the parent's tagged circles.

### 3.2 Rollout order

1. **Code change first**: move `notifyUsers` and `getMembersDevices` onto `createAdminClient()` (§2.3), ship and verify independently of RLS — this removes the one class of legitimate cross-user write/read that would otherwise force much broader policies.
2. **Local Supabase only**: write the migration, run `mise run <local supabase task>` / `supabase db reset` against the local stack, never directly against the prod/self-hosted instance first.
3. Enable RLS and add policies **table by table**, cheapest/highest-confidence first: `guesses`, `guess_questions`, `post_comments`, `post_reactions`, `post_views`, `poll_votes` (all simple self-or-member patterns) → `posts`/`events`/their join tables (circle-visibility logic) → `baby_access`/`circles`/`circles_access`/`invitations`/`users` (the ones with the special-cased signup/anon flows from Part 2) → `notification_*`/`push_subscriptions` (now simplified since §3.2 step 1 already moved the cross-user path to service role) → `bug_reports` (blocked on the §2.6 decision — interim: revoke `anon`/`authenticated` grants entirely).
4. For each table: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, add policies, then manually exercise every server action that touches it (or better, run through the existing test suite if one covers these actions) before moving to the next table — a table with RLS enabled and zero matching policies fails closed (denies everything), so mistakes are safe but very visible (everything breaks, not silently over-permissive).
5. Also **revoke the blanket `GRANT ALL ... TO anon`** added in the baseline migration for every table except `invitations` (§2.2) — RLS policies only restrict rows, the underlying `GRANT` still needs narrowing or `anon` retains blanket table-level access that policies then filter, which is correct but worth being explicit that `anon`'s grant should shrink from `ALL` to `SELECT` (and only on `invitations`) once this is done.
6. Verify against the real threat model from the opening conversation: create a second `babies` row, add a second test user as its sole admin, confirm that user cannot read/write anything under the first baby's id via direct table queries (not just through the app's own gating, which was already correct).

### 3.3 Out of scope

- **Storage** (`storage.objects`): already documented in `storage.ts` as service-role-only by design, and Supabase's `storage.objects` table ships with RLS force-enabled with zero policies by default — meaning `anon`/`authenticated` already get denied by default even without this project defining any storage policies. No change needed here.
- Enum types (`role`, `event_kind`, `notification_type`, `milestone_type`, `bug_report_status`) — not tables, nothing to scope.

---

## Decisions

1. **§2.3** — Confirmed: move `notifyUsers` and `getMembersDevices` to `createAdminClient()`. Do this as a standalone code change (step 1 of §3.2) before any RLS migration lands.
2. **§2.4** — Confirmed: option (a), two independent row-level UPDATE policies on `baby_access` (admin: any row in their baby; self: own row only). App code remains the sole guard against a non-admin self-promoting to `access_level = 'admin'` — unchanged from today's behavior, RLS just adds the cross-baby/cross-user backstop it currently lacks entirely.
3. **§2.6** — Confirmed: Option A. Add a `system_admins (user_id uuid primary key references auth.users(id))` table, seeded manually (one `INSERT` in the migration, or a follow-up manual step) with the instance owner's user id. Gate `bug_reports` SELECT/UPDATE on membership in it — `getBugReports()`/`updateBugReportStatus()` keep their current "see every bug report across every baby" behavior, but only for whoever is actually in `system_admins`, not "admin of whichever baby the admin page happened to be opened from" as today.
