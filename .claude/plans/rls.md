# Row Level Security (RLS) backstop

Status: approved
Approved by: Baptiste (2026-10-07)

## User decisions (2026-10-07)
- Plan approved as written.
- Rollout: apply each batch automatically once the reviewer approves it (CLAUDE.md default). Stop only at the :prod promotion gates (G1, G2): the user must explicitly promote `:latest` to `:prod` (`mise run docker_tag_prod`) before the dependent DB batches run.
- Self-update on access rows: replace old decision 2 — the self-update policy requires `access_level` to stay at its stored value.
- Test data: OK to create 2 test babies and 3 test accounts (`+rls` aliases) via the real invite flow on the shared DB, kept for later batches.
- SQL access: use `supabase db query --db-url …` via `mise exec --` (already works here) instead of a psql container; no `db_sql` docker task.
- System admins: the user only, seeded by hand.

## Goal
Turn on Row Level Security for every `public` table so the database enforces the same
baby membership, admin and circle visibility rules the Server Actions already apply
(`src/utils/feed-access.ts`, `assertIsAdmin`, `getUserAccess`). Today a leaked user JWT, a
reachable Kong/PostgREST endpoint, or a future browser-side client gives full read and write
access to every baby's data. After this plan, those cases fail with "denied" or return empty.
No legitimate user should notice any change in the app.

## Out of scope
- Redesigning the permission model. Policies mirror current app behavior. The only deliberate
  tightenings are listed in "Behavior changes" below.
- Column-level rules beyond the `baby_access.access_level` guard (for example, members can
  technically edit `title`/`body` on their own `notifications` rows). These stay app-only.
- Text limits and the emoji whitelist as DB `CHECK` constraints. They stay in `feed-validation.ts`.
- Storage policies for a browser-side upload client. No such client exists, and storage stays
  service-role only (see "Storage").
- Removing `"use server"` from `src/utils/supabase/server.ts` (listed as a follow-up in
  `done/feed-followups.md`).
- `FORCE ROW LEVEL SECURITY`. The table owner (`postgres`) is only used by migrations, never by the app.

## Current state
Checked against `main` at `d43a7ad` (2026-10-07).

**Schema**
- 39 `public` tables. None has RLS enabled or any policy.
- Every table was created with `GRANT ALL ... TO anon, authenticated, service_role`.
- `20260721132707_baseline.sql:365-388` also sets `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON
  TABLES/SEQUENCES/FUNCTIONS TO anon, authenticated`, so every future table is open to `anon`
  unless this changes.
- Helper functions already shipped in `20260727013047_baby_access_helper_functions.sql`:
  `is_baby_member`, `is_baby_admin`, `is_circle_visible`, `shares_baby_with`. They are all
  `SECURITY DEFINER`, `STABLE` and `SET search_path = ''`, and `EXECUTE` is granted to `anon` too.
- RPC: `adjust_inventory_owned(item_id, target_baby_id, delta, actor_id)` is `SECURITY INVOKER`.
  It trusts the caller-supplied `actor_id`, and members (not only admins) call it from the buy list.
- No triggers in `public`. The Realtime publication is not managed in migrations; the preflight
  script reads it from the database.

**Clients**
- User client: `@/utils/supabase/server` → `createClient()`, which uses the publishable key plus
  the user's cookies. It runs as `authenticated`, or as `anon` when there is no session.
  There is **no** `@/utils/supabase/client` and no browser-side Supabase usage. This is known
  drift from CLAUDE.md.
- Service role: `src/utils/supabase/admin.ts` → `createAdminClient()`, which bypasses RLS. Used by:
  - `notify.ts`, which is no longer a server action file. It reads `notification_preferences`
    and `notification_settings`, inserts `notifications`, and reads and deletes `push_subscriptions`.
  - `notifications.ts` `getMembersDevices` (after `assertIsAdmin`)
  - `access.ts` `getEmailsForUserIds`
  - `storage.ts`, which is no longer a server action file
  - `bug_reports.ts` (screenshot upload only)
  - the routes `/api/upload`, `/api/storage/[babyId]/[...path]`, `/api/share/[token]/[photoId]`
    and `/api/bug-reports/[...path]`, all for storage
  - `realtime-relay.ts`
- Old plan's step 1 is done: commit `e5e49fd` moved `notifyUsers` and `getMembersDevices` to the service role.

**Paths that would break under naive RLS** (each needs a code change or a specific policy):
1. **Signup and join (`signup.ts`, `join-baby.ts`, `(auth)/invite/page.tsx`)**
   - These read `invitations` as `anon` (before `auth.signUp`) or as a non-member. The invite
     page also embeds `babies(baby_surname)`.
   - They self-insert `users` and `baby_access` with the user client.
   - The old plan's answer was a `SELECT USING (true)` on `invitations` for anon, plus a
     `baby_access INSERT WITH CHECK (user_id = auth.uid())` policy. That answer is unsafe:
     anyone holding the publishable key could list every invitation token, and any
     authenticated user could insert themselves into **any** baby. Both holes defeat the backstop.
2. **Public share page (`/share/album/[token]`, `/api/share/[token]/[photoId]`)**
   - `albums.ts` `getValidShare`, `getSharedAlbum` and `resolveSharedPhoto` read
     `album_shares`, `albums` and `album_photos` with the user client, usually as `anon`.
   - They are also exported from a `'use server'` file.
3. **Cross-user `push_subscriptions` reads on the user client**
   - `notifications.ts` `sendNotification`, when an admin sends a test push to a member
     (lines ~301-340)
   - `bug_reports.ts` `notifyBugReportFixed` (~line 120)
4. **`pruneExpiredStories` (`stories.ts:205`)**
   - It runs for every viewer, including non-admins, before any access check, and deletes
     expired `stories` rows with the user client.
   - It removes storage objects (service role) **before** the row delete. Under an admin-only
     DELETE policy, a viewer would remove the media while the rows survive.
5. **`adjust_inventory_owned`**: members update `inventory_items` through an invoker function,
   but every other write to that table is admin-only.
6. **Bug reports**
   - `getBugReports` and `updateBugReportStatus` gate on "admin of *some* baby" and read the
     whole table, with a `users(...)` join across babies.
   - `/api/bug-reports` checks the same thing with a `baby_access` query.
   - Old decision 3 (system admins) still applies.
7. **`baby_access` self-update** (`onboarding.ts`, `users.ts updateBabyAccessSettings`): a
   row-level "self" UPDATE policy would also let a viewer set their own `access_level = 'admin'`
   through the API (old decision 2, option a).

**Paths that already work under the planned policies**
- `access.ts`: `getVisibleUserIds`, `getAllBabyMemberIds` and `getBabyAdminIds` read
  `baby_access`/`circles_access` of a baby the caller belongs to.
- Feed batch loaders (`feed-loaders.ts`) only receive ids that are already visible.
- PostgREST embeds (`posts_circles`, `users(...)`, `posts!inner`) get filtered by the embedded
  table's policy. That matches the app's own filtering.
- Realtime relay: it uses the service-role client, so its `postgres_changes` delivery is not
  filtered by RLS. `/api/realtime/[babyId]` already checks membership. Still verified in the test matrix.

**Storage**
- Buckets: one private bucket per baby (named `babyId`) plus `bug-reports`.
- Every read, write, copy and delete goes through the service role, behind app routes that
  check the session and access.
- The old plan claimed `storage.objects` has RLS on with zero policies. This is unverified;
  the preflight script checks it.

**Docs drift to fix at the end:**
- `feed-access.ts` header says "feed tables have no RLS yet".
- `docs/PROJECT_OVERVIEW.md:33,115,120`
- The "no RLS" notes in other plans can stay as history.

## Approach
Use a backstop that mirrors the app, rolled out in small batches on the shared database:

1. **Code first, no DB change.** Move the few legitimate cross-user and anonymous paths to the
   service role, in non-action modules (same pattern as `notify.ts` / `albums-internal.ts`):
   - invitations
   - the album share link
   - cross-user push reads

   Ship these to `:latest`, then **the user promotes to `:prod`**. Both stacks share one
   database, so prod must not run code that depends on access a later batch removes.
2. **Additive migration.** Add helper functions, policy indexes and `system_admins`, and switch
   the bug reports gate. This changes no behavior.
3. **One migration per batch**, from lowest to highest blast radius:
   1. anon lockdown
   2. self-only tables
   3. small baby-scoped tables
   4. circle content
   5. feed
   6. stories
   7. membership core
   8. bug reports

   Each migration does `ENABLE ROW LEVEL SECURITY` and adds `TO authenticated` policies for
   its tables. Each batch has:
   - a rehearsal script that runs the migration inside `BEGIN … ROLLBACK` on the real database
     with fixtures and impersonated roles
   - a tested rollback script
   - a manual check with real sessions before the next batch

Alternative considered: a single "enable everything" migration rehearsed locally. Rejected.
There is no local Supabase stack in use, both app stacks share one database, and one bad
policy on `baby_access` would take prod down with no way to tell which table caused it.

Alternative considered for invitations: `SECURITY DEFINER` RPCs `get_invitation(token)` and
`redeem_invitation(token)`. Equally safe at the DB layer, since neither option leaves a
self-insert policy. Not chosen because the service-role helper is a smaller change and matches
`notify.ts`.

### Behavior changes (deliberate, small)
- Bug reports: only users in `system_admins` can list them, change their status or view
  screenshots. Today any admin of any baby can. This is old decision 3. The admin page's bug
  report section returns empty for other admins.
- `users`: a profile is readable only by yourself or by someone you share a baby with. Today it
  is readable by anyone. No screen shows users from unrelated babies, except bug report
  reporters (see Risks).
- `baby_access`: a non-admin can no longer change their own `access_level`. The app never
  allowed this; this revises old decision 2.
- `stories`: any member can delete **expired** stories they can see. This keeps lazy pruning
  working; today anyone can delete any story.

## Data and migrations
All migrations are created with `mise run db_migration_new <name>` and applied with
`mise run db_push`. One-off SQL runs through a new `mise run db_sql <file>` task (Step 0).
Every migration:
- starts with `SET lock_timeout = '5s';`, so `ALTER TABLE … ENABLE ROW LEVEL SECURITY` (which
  takes a brief ACCESS EXCLUSIVE lock) fails fast instead of queueing behind app traffic
- ends with `RESET lock_timeout;`
- has no `BEGIN`/`COMMIT`, because the rehearsal script `\i`-includes it inside its own transaction

### Helper functions (migration `rls_helpers_and_indexes`, additive)
- All helpers are `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''`, owned by
  `postgres`, with fully qualified names. `SECURITY DEFINER` is what prevents policy recursion:
  for example, the `posts_circles` policy calls `can_see_post`, which reads `posts` without RLS.
- Grants: `REVOKE EXECUTE … FROM PUBLIC, anon`, then `GRANT EXECUTE … TO authenticated, service_role`.
- Apply the same revoke and grant to the four existing helpers. They keep their bodies.

| Function | Returns | Rule |
|---|---|---|
| `my_baby_ids()` | `setof uuid` | `baby_id` from `baby_access` where `user_id = auth.uid()` |
| `my_admin_baby_ids()` | `setof uuid` | same, `access_level = 'admin'` |
| `my_circle_ids()` | `setof uuid` | `circle_id` from `circles_access` where `user_id = auth.uid()` |
| `is_user_in_baby(p_user uuid, p_baby uuid)` | bool | a `baby_access` row exists for that user and baby (not caller-based; used to validate `circles_access` inserts) |
| `my_access_level(p_baby uuid)` | `role` | caller's current `access_level`, or null |
| `circle_baby_id(uuid)`, `post_baby_id(uuid)`, `story_baby_id(uuid)`, `event_baby_id(uuid)`, `album_baby_id(uuid)`, `anecdote_baby_id(uuid)`, `poll_baby_id(uuid)` (via `posts`), `highlight_baby_id(uuid)` | uuid | parent's `baby_id` |
| `can_see_post(p_post uuid)` | bool | post exists AND (caller is admin of its baby OR a `posts_circles` circle of that post is in the caller's `circles_access` **for the same baby**). Same rule as `canSee` in `feed-access.ts`; no circle means admin-only. |
| `can_see_story`, `can_see_event`, `can_see_album`, `can_see_anecdote` | bool | same rule via `stories_circles`, `events_circles`, `albums_circles`, `anecdotes_circles` |
| `can_see_poll(p_poll uuid)` | bool | `can_see_post(polls.post_id)` |
| `can_see_comment(p_comment uuid)` | bool | `can_see_post(post_id)` AND (admin of the post's baby OR `user_id = auth.uid()` OR `circle_ids && array(my circles in that baby)`). Same as `assertCommentVisible`. |
| `is_system_admin()` | bool | `auth.uid()` is in `system_admins` |

Example (all the others follow the same shape):
```sql
CREATE OR REPLACE FUNCTION public.can_see_post(p_post uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = p_post
      AND (
        EXISTS (SELECT 1 FROM public.baby_access ba
                WHERE ba.baby_id = p.baby_id AND ba.user_id = auth.uid() AND ba.access_level = 'admin')
        OR EXISTS (SELECT 1 FROM public.posts_circles pc
                   JOIN public.circles_access ca ON ca.circle_id = pc.circle_id AND ca.baby_id = p.baby_id
                   WHERE pc.post_id = p.id AND ca.user_id = auth.uid())
      )
  );
$$;
```

### New table (same migration)
- `system_admins (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz default now())`
- RLS enabled, no policies, and only `service_role` gets grants. Nobody reads the table
  directly; `is_system_admin()` reads it as definer.
- It is seeded **by hand** with one `INSERT` run through `mise run db_sql`, not in the
  migration, so no email or uuid ends up in git.

### Indexes for policy predicates (same migration, `CREATE INDEX IF NOT EXISTS`)
Tables are small, so plain, non-concurrent `CREATE INDEX` is fine.
- `baby_access (user_id)`. The PK `(baby_id, user_id)` already covers the per-baby checks.
- `circles_access (user_id, baby_id)`
- `circles (baby_id)`
- `posts (baby_id)`, `stories (baby_id)`, `events (baby_id)`, `albums (baby_id)`,
  `anecdotes (baby_id)`, `story_highlights (baby_id)`, `invitations (baby_id)`
- `album_photos (baby_id)`, `album_photos (album_id)`, `album_shares (album_id)`
- `post_photos (post_id)`, `post_comments (post_id)`, `poll_options (poll_id)`
- `guesses (question_id)`, `push_subscriptions (user_id)`
- Already covered by a PK or UNIQUE constraint:
  - `posts_circles`, `stories_circles`, `events_circles`, `albums_circles` and
    `anecdotes_circles` (leading id)
  - `post_reactions`, `comment_reactions`, `story_reactions`, `post_views`, `story_views`
    and `poll_votes` (leading parent id)
  - `notifications`, `notification_preferences`

### Policies per table
Conventions:
- Every policy is `TO authenticated`. `anon` gets nothing after the anon lockdown batch.
- Policy names follow `<table>_<cmd>_<who>`.
- `uid` means `(SELECT auth.uid())`. Wrapping it in `SELECT` makes Postgres evaluate it once
  per statement instead of once per row.
- `MEMBER(b)` means `b IN (SELECT public.my_baby_ids())` and `ADMIN(b)` means
  `b IN (SELECT public.my_admin_baby_ids())`. These run as initplans, evaluated once per query.
- "admin" in a cell means `ADMIN(baby_id)` on `USING` and `WITH CHECK` alike. For child tables
  the baby comes from `*_baby_id(parent_id)`.
- Every `*_circles` INSERT also checks `circle_baby_id(circle_id) = <parent>_baby_id(<parent>_id)`.
  That moves `assertCirclesInBaby` into the database.
- "—" means no policy, so the action is denied (it is unused, or done by the service role).
- Upserts that do `ON CONFLICT DO UPDATE` (`post_reactions`, `comment_reactions`,
  `story_reactions`, `poll_votes`, `page_settings`, `notification_*`, `push_subscriptions`)
  need INSERT, UPDATE **and** SELECT on the row. `ignoreDuplicates` upserts (`post_views`,
  `story_views`) only need INSERT.

| Table | SELECT | INSERT | UPDATE | DELETE | Batch |
|---|---|---|---|---|---|
| `notifications` | `user_id = uid` | — (service role, `notify.ts`) | `user_id = uid` | — | B2 |
| `notification_preferences` | `user_id = uid` | `user_id = uid AND MEMBER(baby_id)` | `user_id = uid` | `user_id = uid` | B2 |
| `notification_settings` | `user_id = uid` | `user_id = uid` | `user_id = uid` | — | B2 |
| `push_subscriptions` | `user_id = uid` | `user_id = uid` | `user_id = uid` | `user_id = uid` | B2 |
| `babies` | `MEMBER(id)` | — | — | — | B3 |
| `page_settings` | `MEMBER(baby_id)` | admin | admin | — | B3 |
| `todo_items` | admin | admin | admin | admin | B3 |
| `inventory_items` | `MEMBER(baby_id)` (buy list) | admin | admin (members go through the RPC below) | admin | B3 |
| `invitations` | admin | admin | — | — | B3 |
| `guess_questions` | `MEMBER(baby_id) AND (status = 'approved' OR created_by = uid OR ADMIN(baby_id))` | `MEMBER(baby_id) AND created_by = uid AND resolved_at IS NULL AND correct_answer IS NULL AND (status = 'pending' OR ADMIN(baby_id))` | admin | admin | B4 |
| `guesses` | `user_id = uid OR ADMIN(baby_id) OR (MEMBER(baby_id) AND question resolved)`¹ | `user_id = uid AND MEMBER(baby_id) AND is_correct IS NULL AND is_funny = false AND question approved and open`¹ | admin | admin | B4 |
| `events` | `can_see_event(id)` | admin | admin | admin | B5 |
| `events_circles` | `can_see_event(event_id)` | admin + same-baby circle | — | admin | B5 |
| `anecdotes` / `anecdotes_circles` | same pattern via `can_see_anecdote` | admin (+ circle check) | admin (anecdotes) | admin | B5 |
| `albums` / `albums_circles` | same pattern via `can_see_album` | admin (+ circle check) | admin (albums) | admin | B6 |
| `album_photos` | `ADMIN(baby_id) OR (album_id IS NOT NULL AND can_see_album(album_id))` (unsorted = admin-only, same as `getAllAlbumPhotos`) | `ADMIN(baby_id) AND (album_id IS NULL OR album_baby_id(album_id) = baby_id)` | same as INSERT | admin | B6 |
| `album_shares` | `ADMIN(album_baby_id(album_id))` | same | same | — | B6 |
| `posts` | `can_see_post(id)` | admin | admin | admin | B7 |
| `posts_circles` | `can_see_post(post_id)` | admin + same-baby circle | — | admin | B7 |
| `post_photos` | `can_see_post(post_id)` | admin | — | admin | B7 |
| `post_comments` | `can_see_comment(id)` | `user_id = uid AND can_see_post(post_id)` | `user_id = uid` / check `user_id = uid AND can_see_post(post_id)` | `user_id = uid OR ADMIN(post_baby_id(post_id))` | B8 |
| `comment_reactions` | `can_see_comment(comment_id)` | `user_id = uid AND can_see_comment(comment_id)` | same | `user_id = uid` | B8 |
| `post_reactions` | `can_see_post(post_id)` | `user_id = uid AND can_see_post(post_id)` | same | `user_id = uid` | B8 |
| `post_views` | `user_id = uid OR ADMIN(post_baby_id(post_id))` | `user_id = uid AND can_see_post(post_id)` | — | — | B8 |
| `polls` | `can_see_post(post_id)` | `ADMIN(post_baby_id(post_id))` | same | same | B9 |
| `poll_options` | `can_see_poll(poll_id)` | `ADMIN(poll_baby_id(poll_id))` | same | same | B9 |
| `poll_votes` | `can_see_poll(poll_id)` | `user_id = uid AND can_see_poll(poll_id)` (composite FK already ties the option to the poll) | same | `user_id = uid` | B9 |
| `stories` | `can_see_story(id)` | admin | admin (also `clearStoryExpiry`) | `ADMIN(baby_id) OR (expires_at IS NOT NULL AND expires_at <= now() AND can_see_story(id))` | B10 |
| `stories_circles` | `can_see_story(story_id)` | admin + same-baby circle | — | admin | B10 |
| `story_views` | `user_id = uid OR ADMIN(story_baby_id(story_id))` | `user_id = uid AND can_see_story(story_id)` | — | — | B10 |
| `story_reactions` | `can_see_story(story_id)` | `user_id = uid AND can_see_story(story_id)` | same | `user_id = uid` | B10 |
| `story_highlights` | `MEMBER(baby_id)` (stories inside are filtered by `stories` RLS, same as `getHighlights`) | admin | admin | admin | B10 |
| `story_highlight_items` | `MEMBER(highlight_baby_id(highlight_id))` | `ADMIN(highlight_baby_id(highlight_id)) AND story_baby_id(story_id) = highlight_baby_id(highlight_id)` | — | `ADMIN(highlight_baby_id(highlight_id))` | B10 |
| `circles` | `MEMBER(baby_id)` | admin | admin | admin | B11 |
| `circles_access` | `MEMBER(baby_id)` (`getCircleMemberCounts`, `getAllCirclesAccess`) | `ADMIN(baby_id) AND circle_baby_id(circle_id) = baby_id AND is_user_in_baby(user_id, baby_id)` | — | admin | B11 |
| `baby_access` | `user_id = uid OR MEMBER(baby_id)` | — (service role, Step 1) | (a) `baby_access_update_admin`: admin; (b) `baby_access_update_self`: `USING user_id = uid` / `WITH CHECK user_id = uid AND access_level = my_access_level(baby_id)`² | — (no code path; add with a remove-member feature) | B11 |
| `users` | `id = uid OR shares_baby_with(id)` | — (service role, Step 1) | `id = uid` | — | B11 |
| `bug_reports` | `is_system_admin()` | `created_by = uid` | `is_system_admin()` | — | B12 |
| `system_admins` | — | — | — | — | B0 |

¹ The `guesses` policies use `EXISTS (SELECT 1 FROM public.guess_questions q WHERE q.id = question_id AND q.baby_id = guesses.baby_id AND …)`.
The subquery runs under `guess_questions` RLS, which does not reference `guesses`, so there is no recursion.

² `my_access_level` returns the **stored** level, so a self-update must keep `access_level`
unchanged. An admin editing their own row matches policy (a), so self-demotion stays possible.
The "last admin" guard stays app-only (`updateUserAccessLevel`).

**RPC change (B3):** recreate `adjust_inventory_owned` as `SECURITY DEFINER SET search_path = ''`.
- Same signature, so there is no code change and no types change.
- Add `AND public.is_baby_member(target_baby_id) AND actor_id = auth.uid()` to the `WHERE`.
  A forged `actor_id` or a non-member then updates 0 rows. The action already treats an empty
  result as a no-op; confirm during the build.
- `REVOKE EXECUTE … FROM PUBLIC, anon`.

### Grants (B1 `rls_revoke_anon`)
```sql
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
REVOKE EXECUTE ON FUNCTION public.adjust_inventory_owned(uuid, uuid, integer, uuid) FROM PUBLIC, anon;
```
- Steps 1-2 make `anon` need **no** table access at all. The logged-out flows (invite signup,
  share link) go through the service role, and login, reset and confirm only use Auth.
- `authenticated` keeps its table grants. RLS does the row filtering.
- The `pg_trgm` functions (`show_limit`, `show_trgm`) are left alone.

### Storage
No policy changes. The design stays "service role only, deny everyone else".
- **Preflight** checks all of the following and records them in the plan before B1:
  - `storage.objects` and `storage.buckets` have `relrowsecurity = true`
  - `pg_policies WHERE schemaname = 'storage'` has no policy granting `anon` or `authenticated`
  - every row in `storage.buckets` has `public = false`
- If any of these fail, B1 also drops the permissive storage policies and sets
  `public = false`. The builder adds this to B1 only if the preflight found something.
- Every storage route keeps its own app check:
  - `/api/storage`: session + `getUserAccess`
  - `/api/upload`: `assertIsAdmin`
  - `/api/share`: token
  - `/api/bug-reports`: `is_system_admin()` after Step 4
- Per-baby storage policies (`bucket_id::uuid IN (SELECT my_baby_ids())`) are only needed if a
  browser-side storage client is added. That is out of scope.

### Types
Regenerate `src/utils/supabase/database.types.ts` with `mise run update_types` after B0, which
adds functions and `system_admins`. Policies and grants do not change the types, so B1-B12 need
no regeneration.

## Access and security
- **New service-role use (Steps 1-3)** is limited to paths that are inherently cross-user or
  logged-out. Each one validates before using the admin client:
  - `src/utils/invitations.ts` (new, no `'use server'`):
    - `findValidInvitation(token)` checks expiry and returns `{ babyId, babySurname }`.
    - `grantViewerAccess(babyId, userId)` inserts `baby_access` with the default `viewer` level.
    - `createUserProfile(userId, firstName, lastName)`.
    - Callers: `signup` passes the id returned by `auth.signUp`. `joinBabyWithInvitation` and
      the invite page pass the verified `getUser()` id. Each caller re-checks the token.
  - `src/utils/album-share.ts` (new, no `'use server'`): `getValidShare`, `getSharedAlbum` and
    `resolveSharedPhoto` move here unchanged except for the client. The token, `revoked_at` and
    `expires_at` checks, plus the photo-in-album check, stay exactly as they are. The functions
    are removed from `albums.ts`, so they stop being callable server actions.
  - `sendNotification`: after its existing "self, or admin of a shared baby" check, it reads
    `push_subscriptions` with the admin client. `notifyBugReportFixed` does the same; its caller
    is now gated by `is_system_admin()`.
- **Bug reports (Step 4)**:
  - New `assertSystemAdmin()` in `access.ts` calls `supabase.rpc('is_system_admin')` and throws
    `unauthorized`.
  - It replaces `assertIsAdmin` in `getBugReports` and `updateBugReportStatus`, and the
    `baby_access` query in `/api/bug-reports/[...path]`.
  - The admin page renders the bug report list only when `getBugReports` succeeds. Check how
    the page handles the thrown error today and make it render nothing instead.
- **No new public endpoints.** Two exported server actions are removed (`getSharedAlbum` and
  `resolveSharedPhoto` move to a non-action module).
- **What stays enforced only in Server Actions** (RLS is row-level and cannot express these
  cleanly):
  - the "cannot remove the last admin" guard
  - who gets notified (`getVisibleUserIds`), and quiet hours
  - text length limits, the emoji whitelist, and trimming
  - invitation and share-link expiry and revocation (service-role paths)
  - the `post_comments.circle_ids` snapshot being the commenter's real circles (a forged value
    can only widen visibility inside a baby the commenter already belongs to)
  - "one guess, never changed" beyond the PK
  - page-level gating (`page_settings.required_role` and `assertPageAccess` are UI gates; table
    policies are the real data gate)
  - not leaking `is_correct`/`is_funny` of open questions to members (column-level; members only
    see their own guess rows for open questions anyway)
  - story expiry hiding (`getActiveStories` filters, while the policy still shows expired
    stories to people who could see them)
- **What must be in policies** (this plan):
  - tenant isolation by `baby_id` on every table
  - circle visibility, with no circle meaning admin-only
  - admin-only writes
  - self-only rows (notifications, devices, preferences, reactions, votes, views, comments)
  - circles tagged on content must belong to the same baby
  - `circles_access` only for members of that baby
  - no self-join to a baby
  - no self-promotion to admin
  - bug reports limited to system admins
- `feed-access.ts` and the other app checks **stay** as the first layer. Do not remove any of them.

## Steps
Each step is one Conventional Commit, followed by its own `CHANGELOG.md` commit. Run
`pnpm typecheck && pnpm lint` before every commit.

**Procedure for every DB batch (B0-B12):**
1. `mise run db_migration_new rls_<name>` and write the SQL.
2. Write `supabase/rls/rehearse/rls_<name>.sql` and `supabase/rls/rollback/rls_<name>.sql`.
3. Commit, then send to the reviewer.
4. Run `mise run db_sql rls/preflight.sql` and check its output against the expected
   pre-batch state.
5. Run `mise run db_sql rls/rehearse/rls_<name>.sql`. It must end in `REHEARSAL PASS`.
6. At a quiet time, run `mise run db_push`, then immediately run that batch's rows of the
   test matrix on the dev domain, plus a smoke test (load feed, open a post) on the prod domain.
7. If anything is wrong, run `mise run db_sql rls/rollback/rls_<name>.sql` right away. Then
   commit the same SQL as a forward migration `revert_rls_<name>` and `mise run db_push` it.
   The rollback SQL is idempotent, so applying it twice is safe.
8. Write the `CHANGELOG.md` commit.
9. **Wait for the user's go** before the next batch (see open question 3).

---

0. **`chore(db): add RLS preflight and rehearsal tooling`**
   - Files:
     - `mise.toml.example` (and the user's local `mise.toml`)
     - new `supabase/rls/preflight.sql`
     - new `supabase/rls/fixtures.sql`
     - new `supabase/rls/api-probe.sh`
     - new `supabase/rls/README.md`
   - The `db_sql` task runs `psql` from a throwaway container (no local psql is installed):
     ```
     docker run --rm -i --network host -v "$PWD/supabase:/supabase:ro" postgres:17-alpine \
       psql "postgres://postgres.${POOLER_TENANT_ID}:${POSTGRES_PASSWORD}@${SUPABASE_DB_HOST}:${POSTGRES_PORT}/postgres?sslmode=disable" \
       -v ON_ERROR_STOP=1 -v admin_id="$RLS_REAL_ADMIN_ID" -v viewer_id="$RLS_REAL_VIEWER_ID" -f "/supabase/$1"
     ```
     It runs through `mise run`, so `[env]` is injected. `RLS_REAL_*` are new **local-only**
     `[env]` entries.
   - `preflight.sql` is read-only and prints:
     - per `public` table: `relrowsecurity`, the number of policies, and the grants for `anon`
       and `authenticated` (`information_schema.role_table_grants`)
     - `pg_publication_tables WHERE pubname = 'supabase_realtime'`
     - the storage checks from "Storage"
     - data-integrity counts that the policies assume are 0:
       - `circles_access` whose circle belongs to a different baby than `circles_access.baby_id`
       - `posts_circles`, `stories_circles`, `events_circles`, `albums_circles` and
         `anecdotes_circles` tagging a circle of another baby
       - `album_photos` whose album belongs to another baby
       - `story_highlight_items` whose story belongs to another baby
       - `circles_access` users without `baby_access`
       - `baby_access` rows without a `users` row
       - babies with 0 admins
     - the list of applied migrations (`supabase_migrations.schema_migrations`)
   - `fixtures.sql` is only included inside rehearsal transactions:
     - two babies, T and U
     - four `auth.users` and `public.users` rows: T-admin, T-in-circle, T-no-circle, U-admin
       (the outsider)
     - one circle "C1" in T, with T-in-circle in it
     - one row of every content type in T with circle C1, and one with no circle, plus
       comments, reactions, a poll, a story, a highlight, an album with a share, an expired
       story, a guess on an open question and one on a resolved question, inventory, todo,
       notifications and devices
     - `pg_temp` helpers:
       - `as_user(uuid)`: `set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)` + `SET LOCAL ROLE authenticated`
       - `as_anon()`
       - `as_owner()`: `RESET ROLE`
       - `expect(label, actual, expected)`, which raises an exception on mismatch
   - Rehearsal file shape:
     1. `BEGIN; SET LOCAL lock_timeout = '3s';`
     2. `\i fixtures`, then `\i` the migration
     3. assertions per persona
     4. a real-data parity check: for `:admin_id` and `:viewer_id`, the count of visible rows of
        each table as that user equals the count computed as owner with the app rule
     5. `\i` the rollback, then assert that the policies are gone and RLS is off
     6. `RAISE NOTICE 'REHEARSAL PASS'; ROLLBACK;`
   - Keep each rehearsal under about 2 seconds. It holds locks on real tables until `ROLLBACK`.
   - `api-probe.sh`:
     - signs in a test account through `/auth/v1/token?grant_type=password`, using emails and
       passwords from local env vars that are never committed
     - runs a fixed list of PostgREST requests with that JWT and with the publishable key alone
       (anon)
     - prints the HTTP status and row counts
   - `README.md` explains the procedure above.
1. **`refactor(auth): read and redeem invitations with the service role`**
   - Files:
     - new `src/utils/invitations.ts`
     - `src/utils/actions/signup.ts`
     - `src/utils/actions/join-baby.ts`
     - `src/app/(auth)/invite/page.tsx`
   - Use the helpers described in "Access and security".
   - `signup`: replace the `invitations` select and the `users`/`baby_access` inserts.
     `getBabyAdminIds` and `notifyUsers` are unchanged.
   - `joinBabyWithInvitation`: replace the invitation select and the `baby_access` insert. The
     `existingAccess` check stays on the user client (own row).
   - Invite page: replace the `invitations` + `babies` embed.
   - Pino child logger in each helper.
2. **`refactor(albums): resolve share links with the service role`**
   - Files:
     - new `src/utils/album-share.ts`
     - `src/utils/actions/albums.ts` (remove the three functions)
     - `src/app/share/album/[token]/page.tsx`
     - `src/app/api/share/[token]/[photoId]/route.ts`
   - Update the comment that refers to `rls.md §2.2`.
3. **`refactor(notifications): read other users' devices with the service role`**
   - Files: `src/utils/actions/notifications.ts` (`sendNotification`), `src/utils/actions/bug_reports.ts` (`notifyBugReportFixed`)
   - **Gate G1:** deploy Steps 1-3 to `:latest`, check signup, join, share link and test push
     on dev, then **the user promotes to `:prod`** (`mise run docker_tag_prod`, then redeploy
     the prod stack). Confirm the prod footer SHA includes Step 3 before running B1.
4. **`feat(db): add RLS helper functions, policy indexes and system_admins`** (B0, migration `rls_helpers_and_indexes`)
   - Contents: everything in "Helper functions", "New table" and "Indexes", plus the
     `EXECUTE` revoke and grant on the old helpers.
   - Additive only, so the rehearsal checks the helpers' results against the fixtures.
   - Regenerate types (`mise run update_types`).
   - Then the user seeds `system_admins` by hand:
     `INSERT INTO public.system_admins (user_id) SELECT id FROM auth.users WHERE email = '<owner email>';`
     through a scratch file run with `mise run db_sql`, never committed.
   - Commit the regenerated types in the same commit as the migration.
5. **`feat(admin): restrict bug reports to system admins`**
   - Files:
     - `src/utils/actions/access.ts` (`assertSystemAdmin`)
     - `src/utils/actions/bug_reports.ts`
     - `src/app/api/bug-reports/[...path]/route.ts`
     - the admin page component that lists bug reports (find it via `getBugReports`)
   - **Gate G2:** promote to `:prod` before B12.
6. **`feat(db): revoke anon access to public tables`** (B1, `rls_revoke_anon`)
   - Rehearsal: as anon, `SELECT` on every table fails with `42501` (loop over
     `pg_tables`), and a fixture-based `as_user` read still works.
   - Matrix rows: logged-out invite signup, logged-out share link, login, password reset.
   - Rollback: `GRANT ALL ON ALL TABLES/SEQUENCES IN SCHEMA public TO anon`, restore the default
     privileges, and re-grant `EXECUTE` on `adjust_inventory_owned` to anon.
7. **`feat(db): enable RLS on per-user notification tables`** (B2, `rls_self_tables`)
   - Tables: `notifications`, `notification_preferences`, `notification_settings`, `push_subscriptions`.
   - Matrix rows: bell and mark read, settings notification preferences, quiet hours, devices
     list, rename and remove, admin test push to a member, a post triggering a push to members.
8. **`feat(db): enable RLS on baby settings, todo, inventory and invitations`** (B3, `rls_baby_settings`)
   - Tables: `babies`, `page_settings`, `todo_items`, `inventory_items` (+ RPC), `invitations`.
   - Matrix rows: baby list and header, page settings toggle, todo CRUD, inventory CRUD, buy
     list "bought" as a viewer, invite link creation, invitation list.
9. **`feat(db): enable RLS on pronostics`** (B4, `rls_guesses`)
   - Tables: `guess_questions`, `guesses`.
   - Matrix rows: viewer proposes, admin approves, viewer answers, admin resolves and sets
     funny, leaderboard as viewer.
10. **`feat(db): enable RLS on events and anecdotes`** (B5, `rls_events_anecdotes`)
11. **`feat(db): enable RLS on albums`** (B6, `rls_albums`)
    - Matrix rows include: unsorted photos, the share link while logged in as the outsider
      (service role path), and revoking a share.
12. **`feat(db): enable RLS on posts`** (B7, `rls_posts`)
    - Tables: `posts`, `posts_circles`, `post_photos`.
13. **`feat(db): enable RLS on post comments, reactions and views`** (B8, `rls_post_interactions`)
    - Tables: `post_comments`, `comment_reactions`, `post_reactions`, `post_views`.
14. **`feat(db): enable RLS on polls`** (B9, `rls_polls`)
15. **`feat(db): enable RLS on stories and highlights`** (B10, `rls_stories`)
    - Rehearsal: the T-no-circle persona can delete the expired fixture story it can see, but
      not a non-expired story.
16. **`feat(db): enable RLS on membership tables`** (B11, `rls_membership`)
    - Tables: `baby_access`, `circles`, `circles_access`, `users`.
    - This is the highest-risk batch: every page calls `getUserAccess`. Do it last among the
      app tables, when everything else is proven.
    - Rehearsal:
      - a viewer's `UPDATE baby_access SET access_level = 'admin'` changes 0 rows or errors
      - the viewer's nickname update works
      - the admin promotes the viewer
      - `circles_access` insert for a circle of baby U into baby T is rejected
      - the outsider can't read T's `users` rows
17. **`feat(db): enable RLS on bug reports`** (B12, `rls_bug_reports`)
    - Requires G2.
18. **`docs: record RLS rollout`**
    - Files:
      - `src/utils/feed-access.ts` (header comment)
      - `docs/PROJECT_OVERVIEW.md`
      - `src/utils/supabase/admin.ts` (comment)
      - this plan: `## Status: implemented`, then move it to `done/`
    - Then the final preflight: every `public` table has `relrowsecurity = true` and `anon` has
      no table grants.
    - **Proposed, only if the user approves:** a CLAUDE.md rule along the lines of: "Every new
      table migration must `ENABLE ROW LEVEL SECURITY`, add `TO authenticated` policies using
      the `rls_helpers` functions, and must not grant to `anon`."

## Translations
- None. Errors reuse `serverErrors.unauthorized`.

## Design
No UI changes. The only visible effect is that the bug report list disappears for admins who
are not system admins.

## Risks and open questions
**Risks**
- **One shared database for dev and prod.**
  - Every batch hits prod immediately.
  - Gates G1 and G2 depend on the user promoting `:prod`. If prod still runs pre-Step-1 code
    when B1 or B11 lands, signup and join break on prod.
  - Mitigations:
    - rehearsal on real data inside a rolled-back transaction
    - small batches
    - `lock_timeout`
    - an instant rollback script
- **Silent failures.** RLS turns forbidden `SELECT`s into empty results, and forbidden
  `UPDATE`/`DELETE`s into "0 rows, no error". A wrong policy can therefore look like
  missing data instead of an error. The matrix checks **effects** (the row really
  changed or disappeared), not just "no error toast". `INSERT … WITH CHECK` failures do raise
  `42501`, so watch the Pino logs for `new row violates row-level security policy` after each batch.
- **Rehearsal locks.** `ENABLE ROW LEVEL SECURITY` inside the rehearsal transaction blocks app
  queries on those tables until `ROLLBACK`. Keep scripts fast and run them at a quiet time.
- **Performance.**
  - `SECURITY DEFINER` functions are never inlined, so `can_see_*` runs once per row.
  - At this scale (hundreds of posts, about 20 users) that should cost a few milliseconds.
    `MEMBER`/`ADMIN` use `IN (SELECT my_*_ids())` initplans and `(SELECT auth.uid())`, so they
    are evaluated once per query.
  - Each feed and stories rehearsal (B7, B10) runs `EXPLAIN (ANALYZE, BUFFERS)` as T-no-circle
    and as the real admin on the `getPosts` page query and the `getActiveStories` query, before
    and after. Budget: under +20 ms or under 2x. If it is over, swap `posts` SELECT for an
    inline `ADMIN(baby_id) OR id IN (SELECT pc.post_id FROM posts_circles pc WHERE pc.circle_id IN (SELECT my_circle_ids()))`.
- **Invisible data that was visible before.** If the preflight finds cross-baby circle tags or
  orphan rows, the policies will hide them. Decide per row before B5-B11; don't silently "fix" data.
- **Bug report reporter names.** The `users(...)` join returns null for reporters in babies the
  system admin doesn't belong to. Today the owner is admin of every baby, so this does not happen yet.
- **Realtime.** The relay uses the service role, so delivery should not change. This is still
  verified explicitly after B3 (inventory), B10 (stories) and B11 (`baby_access`, `circles`,
  `circles_access`, `users`).
- **Default privileges.** After B1, new tables get no `anon` grant, but they still get
  `authenticated` grants **without** RLS until someone enables it. That is why the CLAUDE.md
  rule is proposed.

**Open questions for the user**
1. **Decision 2 revision.** Old decision 2 (option a) let a viewer self-promote to admin through
   the API. This plan instead uses a self-update policy that keeps `access_level` unchanged.
   That needs no trigger and changes no app behavior. OK to replace decision 2?
2. **Test accounts and babies on the shared database.** OK to create two test babies (T and U)
   and three test accounts through the real invite flow, using `+rls` email aliases? That also
   creates two private storage buckets. The SQL fixtures are rolled back, but the manual
   real-session matrix needs real accounts.
3. **Pause between batches.** CLAUDE.md says to apply migrations once the reviewer approves. For
   this plan, should the builder stop after each batch and wait for your "go" (proposed), or
   continue through the batches on its own when the rehearsal and matrix rows pass?
4. **psql through Docker.** Is a throwaway `postgres:17-alpine` container acceptable for
   `mise run db_sql`? It is not a build. The alternative is installing psql through mise.
5. **System admin seed.** Confirm the system admins are you only, seeded by hand.

## How to verify
**Personas** (real sessions, separate browser profiles):
- **P1**: admin of T
- **P2**: viewer of T, in circle C1
- **P3**: viewer of T, no circle
- **P4**: outsider, admin of U only
- **P5**: logged out
- **SA**: system admin (you)

Content in T:
- one post, story, event, anecdote and album restricted to C1
- one of each with no circle
- a poll on the C1 post

| # | Check | Expected |
|---|---|---|
| 1 | Feed as P1 / P2 / P3 | P1 sees both posts. P2 sees the C1 post. P3 sees neither. Comments, reactions and poll results match. |
| 2 | P2 comments, reacts, votes, changes vote, removes reaction, edits and deletes own comment | All persist after reload. P1 sees them. P1 can delete P2's comment. |
| 3 | Admin stats and views modal (P1) | Shows P2's view. Not reachable as P2 (empty). |
| 4 | Stories: P1 posts a C1 story → P2's tray updates **live**, P3's doesn't. P2 reacts and views. P1 adds it to a highlight, removes it. | Matches today. An expired story disappears after P3 loads the feed (pruning). |
| 5 | Calendar, anecdotes, albums (including unsorted photos as P2 → hidden) | Same visibility rule as #1 |
| 6 | P1 uploads photos to a post and an album; P2 opens them (`/api/storage`) | Upload OK, images load |
| 7 | Share link: P5 opens the album link; P4 (logged in) opens it; P1 revokes; P5 reloads | Works, works, then "invalid" |
| 8 | Invite: P5 signs up through a new link; P4 joins T through a link while logged in; an expired link | New member lands on onboarding with nickname saved. P4 becomes a viewer of T. Expired link shows the error. (Afterwards remove P4 from T with `db_sql`.) |
| 9 | Admin page as P1: members list, change P3 to admin and back, last-admin guard, add and remove P3 from C1 (P3 gets a push, the admin page updates live), create a circle, page settings | All work |
| 10 | Settings as P2: profile name, nickname, notification preferences, quiet hours, devices, self test push; P1 sends a test push to P2 | All work |
| 11 | Buy list as P2 ("bought" ±1); inventory and todo as P1; inventory updates live on P1 when P2 taps | Works. P2 can't open inventory or todo (unchanged). |
| 12 | Pronostics: P2 proposes, P1 approves, P2 answers, P1 resolves and marks funny, leaderboard as P3 | Works. P3 sees P2's answer only after resolution. |
| 13 | Bug report: P2 submits with a screenshot; SA lists it, opens the screenshot, marks it fixed (P2 gets a push); P1 (not SA) opens the admin page | SA: works. P1: no bug report list, and the screenshot URL returns 403. |
| 14 | **Direct API probe** (`supabase/rls/api-probe.sh`) | P4's JWT: `GET /rest/v1/posts?baby_id=eq.<T>` returns `[]`. `POST /rest/v1/baby_access {baby_id:T,user_id:P4}` returns 403. P3's JWT: `PATCH /rest/v1/baby_access?baby_id=eq.T&user_id=eq.P3 {access_level:'admin'}` changes nothing. P3 `GET posts` returns `[]`. P2 `POST posts_circles` returns 403. Anon key only: every table returns 401/403 (permission denied). |
| 15 | Prod domain smoke test after each batch | Feed, one post and the admin page load for your real account |

Run only the rows for the tables in each batch, plus #15. Run the full matrix after B11 and again after B12.
