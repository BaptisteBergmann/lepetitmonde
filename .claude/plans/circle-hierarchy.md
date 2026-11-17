# Circle hierarchy (nested sharing circles)

Status: approved
Approved by: user, 2026-11-17

## Decisions from review (2026-11-17) — these override anything below
1. Max depth **3**. 2. Deleting a circle **moves its children up**. 3. Looser comment visibility
(rule 4) is **accepted**. 4. Moving a circle sends **no notifications**.
5. **NEW RULE: one circle per tree.** A user can be a direct member of at most one circle in a given
   tree (all circles sharing the same root), but may be in circles of several different trees
   (e.g. "Grandparents" under Family *and* "Neighbours" under Friends is fine; "Family" *and*
   "Grandparents" is not). Implications, replacing the conflicting parts of the plan and Design:
   - **DB enforcement** (same migration): a trigger on `circles_access` INSERT/UPDATE of `circle_id`
     resolves the root of `NEW.circle_id` and raises `circle_membership_same_tree` if the user already
     has another row (different `id`) in a circle with the same root. Take the same per-baby
     advisory lock as the tree trigger so concurrent inserts/moves can't race. The circles tree
     trigger, on a `parent_circle` change, also raises `circle_membership_conflict` if the
     resulting tree would contain any user twice. Delete-moves-children-up can't create a
     conflict (the deleted circle's rows cascade away). Today every circle is a root, so existing
     data can't conflict; the migration still asserts it. Trigger functions: `SECURITY DEFINER`,
     pinned `search_path`, execute revoked from `anon`/`authenticated`.
   - **Every write path into `circles_access`** (admin add member, onboarding/invites, share links,
     admin console, anything found by grepping `circles_access` inserts) must map both new errors
     to `serverErrors.circleMembershipSameTree` / `circleMembershipConflict`.
   - **Moving a member within a tree**: new admin Server Action `moveCircleMember({ babyId,
     accessId, toCircleId })` that does a single `UPDATE circles_access SET circle_id = … WHERE id = …`
     (atomic, trigger-checked; verify admin via `getUser()` + baby admin check, and that both
     circles belong to `babyId`).
   - **Admin "Add a member" Select**: people with no circle in this tree are listed normally. People
     already in another circle of the same tree go in a second group "In another circle of this
     tree" with suffix " · in {circle}"; choosing one calls `moveCircleMember` and toasts
     "{name} moved from {from} to {to}." The old "Already included via a sub-circle" group and the
     `admin.circles.stillIncluded` toast are dropped (that situation can no longer happen).
   - **Inherited chips** ("Léo · via Grandparents") stay: they show who reaches a parent through a
     sub-circle. Legend copy unchanged.
   - **Move circle dialog**: after choosing a parent, compute (client-side) users who'd end up twice
     in the merged tree. If any, show under the Select, in destructive text: "Can't move: {names}
     would be in two circles of this group. Remove them from one first." and keep Continue
     disabled. The server error is the backstop.
   - **Risks section**: "removing a member from a parent doesn't revoke access" no longer applies.
   - New i18n keys (EN + FR): `serverErrors.circleMembershipSameTree` ("This person is already in
     another circle of this group." / "Cette personne est déjà dans un autre cercle de ce groupe."),
     `serverErrors.circleMembershipConflict` ("Someone would end up in two circles of the same
     group." / "Quelqu'un se retrouverait dans deux cercles du même groupe."),
     `admin.circles.otherCircleInTreeGroup` ("In another circle of this tree" / "Dans un autre cercle
     de cet arbre"), `admin.circles.inOtherCircle` ("{name} · in {circle}" / "{name} · dans {circle}"),
     `admin.circles.memberMoved` ("{name} moved from {from} to {to}." / "{name} a été déplacé·e de
     {from} vers {to}."), `admin.circles.moveMemberConflict` ("Can't move: {names} would be in two
     circles of this group. Remove them from one first." / "Déplacement impossible : {names} serai(en)t
     dans deux cercles de ce groupe. Retirez-les d'abord de l'un d'eux.").
   - **Verify** additionally: inserting a second row for the same user in the same tree fails;
     same user in two different trees succeeds; moving a tree under another where a user is in
     both fails with `circle_membership_conflict`; `moveCircleMember` works and is admin-only.

## Goal
Let a baby's admins nest circles into a tree (Family → Close family → Grandparents), so
content shared with a broad circle automatically reaches the more intimate circles inside it.
Admins stop having to add every grandparent to "Family", "Close family" and "Grandparents" by
hand, and audience pickers stop needing three ticks for one intent. This also resolves
`.claude/plans/quirks-and-issues.md` #10 (`circles.parent_circle` is dead schema).

## Out of scope
- Several parents per circle (a DAG). It is a tree: each circle has at most one parent.
- Trees spanning babies. Every parent and child belong to the same baby.
- "Exclude this sub-circle" audiences (share with Family except Grandparents).
- Notifying anyone when a circle is moved and existing content becomes visible to new people.
  See Risks.
- Turning on RLS for `circles`, `circles_access` or the content tables. That stays with
  `.claude/plans/rls.md`, which someone else owns. This plan only updates the SQL helper it will use.
- Per-photo visibility. Albums stay the unit, as today.
- Adding a test framework (quirks #13). Verification is manual plus SQL run inside a rolled-back transaction.

## Semantics (validated against the code)
Definitions, for a circle `C` and a user `u` in baby `B`:
- `ancestorsOrSelf(C)`: `C`, its parent, its grandparent, and so on.
- `descendantsOrSelf(C)`: `C` and every circle below it.
- **Direct circles** `D(u)`: the `circles_access` rows of `u` in `B` (unchanged storage).
- **Effective circles** `E(u) = ⋃ ancestorsOrSelf(d)` for `d ∈ D(u)`.

Rules:
1. **Seeing an item.** An item tagged with circles `T` is visible to `u` when `u` is admin, or
   `T ∩ E(u) ≠ ∅`. This is the same as "some direct circle of `u` lies in `descendantsOrSelf(t)` for a `t ∈ T`".
   No circle means admin-only, as today.
2. **Recipients of an item** (push, email, broadcast, "newly visible" on edit) are admins plus
   members of `descendantsOrSelf(T)`.
3. **Picking a parent in an audience picker implies its descendants.** Only what the user ticked is
   stored (the parent id). The descendants are not copied into the join tables, so moving a
   circle later updates the audience of existing content correctly.
4. **Comments** keep storing a `circle_ids` snapshot of the author's **direct** circles. At read
   time a comment is visible when `ancestorsOrSelf(comment.circle_ids) ∩ E(viewer) ≠ ∅` (or the
   viewer is admin or the author). This is today's "shares a circle with the author" rule
   applied to effective circles. Old comments keep working, and so do circle moves.

Points where the proposed semantics meet the code. The user should check these:
- **"A sub-circle is a subset of its parent" is implied, not stored.** A grandparent is only in
  `circles_access` for "Grandparents", but counts as a member of Close family and Family. So
  removing someone from "Family" while they are still in "Grandparents" does **not** take away
  their access to Family content. The admin UI has to show inherited membership, or this will surprise admins.
- **Member counts.** `getCircleMemberCounts` feeds the "this circle is empty" warning in the
  pickers and in `post_stats_modal.tsx`. It counts direct rows. A parent with no direct members
  but filled sub-circles would wrongly show as empty. It must count the audience instead
  (distinct users in `descendantsOrSelf`).
- **Comment rule 4 loosens comment privacy a little.** Two sibling sub-circles under one root
  can now read each other's comments on a post they can both see. That's because both
  effectively belong to the root.
  The stricter option ("direct ∩ direct") would hide a grandparent's comment on a Family post
  from other Family members, which seems wrong. See Open questions.
- **Moving a circle changes access to existing content in both directions, right away.**
  Moving "Friends" under "Family" gives every Friend all past Family content. Moving
  "Grandparents" out of "Family" takes it away. Today, access only changes when membership or
  an item's circles change.

## Current state
- **Schema.** `circles (id, created_at, baby_id NULL, name, parent_circle NULL)` comes from
  `20260721132707_baseline.sql`. `circles_parent_circle_fkey → circles(id)` has no ON DELETE
  clause (NO ACTION) and no index. `circles_access (circle_id, user_id, baby_id)` has PK
  `(circle_id, user_id)`. The join tables `posts_circles`, `stories_circles`, `events_circles`,
  `anecdotes_circles` and `albums_circles` reference `circles(id) ON DELETE CASCADE`.
  `post_comments.circle_ids uuid[]` holds the author's circles at write time (`comments.ts` `addComment`).
  None of these tables has RLS. All are `GRANT ALL` to `anon`/`authenticated` (see `rls.md`).
  The Postgres major version is 17 (`supabase/config.toml`).
- **SQL helpers.** `20260727013047_baby_access_helper_functions.sql` defines `is_circle_visible`,
  which only checks direct membership. No policy uses it yet; it's waiting for `rls.md`.
- **Where "can X see Y" is resolved.** Everything goes through three functions:
  - `getUserCircleIds` → `getCirclesAccess` in `src/utils/actions/circles.ts`. This is cookie-bound,
    behind React `cache()` plus a 5 s TTL cache. Callers: `feed-access.ts` `getFeedViewer` (used by
    `assertMember`, `findVisiblePost`, `assertCommentVisible` and `canViewStorageObject`, so also the
    storage route `src/app/api/storage/[babyId]/[...path]/route.ts`), `feed-loaders.ts` (comments),
    `posts.ts` `withVisibility`, `stories.ts`, `story_highlights.ts`, `albums.ts`, `events.ts`, and the
    `feed`/`albums`/`anecdotes` pages (the "pending circle access" notice).
  - `getViewerCircleIds` in `src/utils/member-access.ts`. It takes an explicit user and has no cache.
    Callers: `events-core.ts` and `anecdotes-core.ts`, which serve both the app and MCP
    (`list_events`, `list_anecdotes`, and the digest through `digest-core.ts`).
  - `getVisibleUserIdsWith` in `member-access.ts`, wrapped by `getVisibleUserIds` in `access.ts`.
    Used for notification fan-out in `posts.ts`, `stories.ts`, `events-core.ts` and `anecdotes-core.ts`,
    including the "newly visible on edit" diff, and in `broadcast_email.ts`.
- **Client-side mirrors of the rule.** `admin/_components/send_broadcast_email.tsx` previews the
  recipient count. `admin/_components/display_circle_access.tsx` filters albums with
  `album.circleIds.includes(selected)`.
- **Pickers.** Each one has its own inline `Select multiple` over `circles` (from `getCircles`, `select *`,
  so `parent_circle` already reaches the client). They live in: `feed/_components/create_post_modal.tsx`,
  `edit_post_modal.tsx`, `create_story_modal.tsx`, `edit_story_modal.tsx`,
  `calendar/_components/create_event_modal.tsx`, `anecdotes/_components/create_anecdote_modal.tsx`,
  `edit_anecdote_modal.tsx`, `albums/_components/create_album_modal.tsx`,
  `albums/[albumId]/_components/edit_album_modal.tsx`, `admin/_components/send_broadcast_email.tsx`,
  and the single-select in `display_circle_access.tsx`.
- **Admin.** `admin/_components/create_circle.tsx` (name only) and `display_circles.tsx` (a flat list,
  add and remove members, delete; it already handles `circles` UPDATE events from realtime).
  `deleteCircle` deletes `circles_access` rows by hand and then the circle.
- **MCP.** `list_circles` → `circles-core.ts` `listCirclesCore` returns `{id, name}` (admin only).
  `add_anecdote` and `add_event` take `circleIds`.
- **Realtime.** `src/utils/supabase/realtime-relay.ts` relays full `circles` rows (so `parent_circle`
  is included) and a bare `circles_access` signal per baby. No change is needed.
- **Drift from CLAUDE.md.** Actions live in `src/utils/actions/`. There is no
  `@/utils/supabase/client`. `rls.md` is on hold, so these checks in app code are still the only protection.

## Approach
The tree goes in the existing `parent_circle` column. A composite FK keeps parent and child in
the same baby, and a trigger blocks cycles and enforces a maximum depth. Visibility is computed
by expanding circle ids in **one pure TypeScript module** (`src/utils/circle-tree.ts`). The three
resolver functions above call it, so every page, action, MCP tool, the storage route and the
notification fan-out follow without touching each caller. In SQL, `is_circle_visible` gets the
same rule through a recursive CTE, so the future RLS rollout matches the app.

**Recursive CTE, not a closure table.** A baby has a handful of circles, at most about 3 levels.
The CTE walks a few rows by primary key or index, so it is effectively free. A closure table would
need insert, update and delete triggers to keep it in sync, which adds a lot for no measurable gain.
On the app side, one `select id, parent_circle from circles where baby_id = …` per request
(cached like `getCirclesAccess`) lets TypeScript do the expansion in memory, without an RPC round trip.

## Data and migrations
One migration, `supabase/migrations/<ts>_circle_hierarchy.sql`, for example `20261117120000_circle_hierarchy.sql`:
1. **Preflight `DO` block.** Raise an exception and stop the migration if any
   `circles.parent_circle IS NOT NULL`, or any `circles.baby_id IS NULL`. Both should be zero,
   since the column was never written. Don't silently `UPDATE … SET NULL`. If rows show up,
   stop and ask the user.
2. `ALTER TABLE circles ALTER COLUMN baby_id SET NOT NULL`. Also make `circles.name NOT NULL` if
   the preflight shows there are no nulls (optional, note the result).
3. `ADD CONSTRAINT circles_id_baby_id_key UNIQUE (id, baby_id)`. This is the target of the composite FK.
4. Drop `circles_parent_circle_fkey`. Add
   `circles_parent_same_baby_fkey FOREIGN KEY (parent_circle, baby_id) REFERENCES circles(id, baby_id) ON DELETE SET NULL (parent_circle)`
   (PG 15+ column-list syntax). This blocks cross-baby parents at the database level. The column list
   keeps `baby_id` from being nulled. It only acts as a backstop, since the delete trigger below
   re-parents children first.
5. `ADD CONSTRAINT circles_parent_not_self CHECK (parent_circle IS DISTINCT FROM id)`.
6. `CREATE INDEX circles_parent_circle_idx ON circles (parent_circle)` and
   `CREATE INDEX IF NOT EXISTS circles_baby_id_idx ON circles (baby_id)`.
7. **Trigger function `circles_check_hierarchy()`**, `BEFORE INSERT OR UPDATE OF parent_circle, baby_id`.
   It is plpgsql, `SECURITY DEFINER`, `SET search_path = ''`. It:
   - Takes `pg_advisory_xact_lock(hashtextextended('circles:' || NEW.baby_id::text, 0))`. This
     serializes tree edits per baby, so two concurrent moves can't create a cycle.
   - Walks up from `NEW.parent_circle` with a recursive CTE. If it reaches `NEW.id`, it raises a
     cycle error.
   - Checks `depth(NEW.parent_circle) + 1 + height(subtree of NEW.id) - 1 ≤ 3`. In words, the moved
     circle's whole subtree has to fit. Otherwise it raises a depth error.
   - Raises with `ERRCODE = 'check_violation'` and a stable `MESSAGE` prefix
     (`circle_hierarchy_cycle`, `circle_hierarchy_depth`) so the action can map it to a translated error.
   - Also rejects `UPDATE OF baby_id` when the row has a parent or children. That never happens
     today, but it keeps the tree consistent.
8. **Trigger function `circles_reparent_children()`**, `BEFORE DELETE`. It runs
   `UPDATE circles SET parent_circle = OLD.parent_circle WHERE parent_circle = OLD.id`, which moves
   the children up one level. Their depth goes down, so neither check can fail. See Open questions
   for the alternative (block the delete).
9. **`circle_descendants_or_self(target_circle_ids uuid[]) RETURNS SETOF uuid`.** SQL, `STABLE`,
   `SECURITY DEFINER`, `SET search_path = ''`. It is a recursive CTE with a depth guard
   (`WHERE depth < 10`) as a safety net.
10. **`CREATE OR REPLACE is_circle_visible(target_baby_id, target_circle_ids)`.** The signature stays the same.
    The body becomes: admin OR `EXISTS (circles_access WHERE baby_id = target AND user_id = auth.uid()
    AND circle_id IN (SELECT circle_descendants_or_self(target_circle_ids)))`.
11. **Grants for the new functions.** The baseline sets `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS
    TO anon, authenticated`, so each new function needs:
    `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role;`
    This applies to `circle_descendants_or_self` and both trigger functions. `is_circle_visible` keeps
    its existing grants. It runs as definer (owner `postgres`), so it can call the revoked helper.
    Set `OWNER TO postgres` on all three.
- No new tables, so no new RLS policies. RLS on `circles` stays with `rls.md`. Note it in that plan's
  `circles` batch: the policies can reuse `circle_descendants_or_self` and should leave `parent_circle`
  writable only by admins.
- **Regenerate `src/utils/supabase/database.types.ts`.** The FK relationship name changes and new
  functions appear. Use `mise exec -- supabase gen types …`, matching the existing task. When pushing,
  remember `supabase db push --debug` (TLS quirk).
- Irreversible parts: `baby_id SET NOT NULL` and dropping the old FK. Both are safe if the preflight
  passes. A down-migration is not needed. Rollback means one migration that drops the triggers, the
  functions and the composite FK, and restores the old `is_circle_visible` body.

## Access and security
- **`setCircleParent(circleId, parentId | null, babyId)`** (new, in `src/utils/actions/circles.ts`).
  It checks `assertIsAdmin`, validates both ids as UUIDs, and runs `assertCirclesInBabyWith` (from
  `member-access.ts`, which doesn't import `circles.ts`, so no cycle) on `[circleId, parentId]`.
  The update is scoped with `.eq('baby_id', babyId)`. A TypeScript pre-check (cycle, depth) gives a
  friendly error, and the trigger has the final say. Trigger errors map to `actionError('circleHierarchyCycle' | 'circleHierarchyDepth')`.
  Other database errors are logged and rethrown as they are today.
- **`createCircle`** accepts an optional `parentId` with the same checks. The insert sets `parent_circle`.
- **`deleteCircle`**: unchanged in code. The trigger moves the children up. The confirm text has to mention it.
- **`getCircleTree(babyId)`** (new, internal, not exported from a `'use server'` file). It loads
  `id, parent_circle` for a baby. Put it in `member-access.ts` as `getCircleParentsWith(supabase, babyId)`,
  with a `cache()` plus 5 s TTL wrapper next to `getCirclesAccess`. It is only called after the caller's
  membership check has passed: `getCirclesAccess` already checks membership first, and the MCP core
  functions call it after `assertPageAccessForUser`.
- **Read-only changes** to `getUserCircleIds`, `getViewerCircleIds` and `getVisibleUserIdsWith`
  widen what they return according to the rules above. They don't change who may call them.
- **`getCircleMemberCounts`** stays member-only and returns audience counts. These are numbers per circle,
  as today, with no new data.
- **Tree structure exposure.** `parent_circle` was already returned by `getCircles` (`select *`) to every
  member and sent to every member through the realtime relay. Members could already see circle names,
  so the tree shape is not considered sensitive.
- No service-role use is added. MCP keeps its existing service-role client plus the verified-token user id.
- No new public endpoints, no auth changes. The broadcast email recipient set widens by design (rule 2).

## Steps
Commit after each step (Conventional Commits), then the CHANGELOG follow-up commit.

1. **Pure tree module.** Files: `src/utils/circle-tree.ts` (no `server-only`, so client components can
   import it). It exports `CIRCLE_MAX_DEPTH = 3` and the type `CircleNode = { id: string; parent_circle: string | null }`,
   plus these functions:
   `ancestorsOrSelf(ids, nodes)`, `descendantsOrSelf(ids, nodes)`, `depthOf(id, nodes)`, `subtreeHeight(id, nodes)`,
   `validParentIds(circleId | null, nodes)` (excludes self, its descendants, and anything that would break
   the depth limit), and `orderAsTree(circles)` (a depth-first order with `depth`, for indented lists).
   All guard against cycles with a visited set. Nothing calls it yet, so the app is unchanged.
   `feat(circles): add circle tree helpers`.
2. **Migration.** Files: `supabase/migrations/<ts>_circle_hierarchy.sql` (all items under Data), then
   regenerate `database.types.ts`. Before writing the migration, run the preflight counts read-only and
   report them to the user. Apply the migration only after the reviewer gives the green light
   (CLAUDE.md). With every `parent_circle` null, behaviour is unchanged.
   `feat(db): circle hierarchy constraints and recursive visibility helper`.
3. **Server-side resolution.** Files: `src/utils/member-access.ts` (`getCircleParentsWith`; `getViewerCircleIds`
   returns effective ids; `getVisibleUserIdsWith` expands `circleIds` to `descendantsOrSelf` before the
   `circles_access` query), `src/utils/actions/circles.ts` (a cached tree loader; `getUserCircleIds`
   returns effective ids; new `getDirectCircleIds` for the comment stamp; `getCircleMemberCounts` returns
   distinct audience counts), `src/utils/actions/comments.ts` (stamp `getDirectCircleIds`),
   `src/utils/feed-loaders.ts` and `src/utils/feed-access.ts` `assertCommentVisible` (rule 4: expand
   `comment.circle_ids` with `ancestorsOrSelf` before matching). Update the doc comments that say "same
   rule as …". Every caller listed in Current state then follows. Check each `circleIds.length === 0`
   "pending access" check: it is still correct, because an effective set is empty only if the direct set is.
   `feat(circles): resolve visibility through ancestor circles`.
4. **Admin actions.** Files: `src/utils/actions/circles.ts` (`setCircleParent`, `createCircle` with `parentId`,
   `revalidatePath(`/baby/${babyId}`, 'layout')` after a move, because visibility changes on every page),
   `messages/en.json`, `messages/fr.json` (`serverErrors`).
   `feat(circles): allow nesting and moving circles`.
5. **Admin UI.** Files: `admin/_components/create_circle.tsx` (optional parent),
   `admin/_components/display_circles.tsx` (tree order, move action, inherited members shown on parent
   circles, delete confirm mentioning that children move up, move confirm stating the access change),
   `admin/_components/display_circle_access.tsx` (albums whose `circleIds` intersect `ancestorsOrSelf(selected)`),
   `admin/_components/send_broadcast_email.tsx` (the preview expands with `descendantsOrSelf`), and
   `admin/page.tsx` if new props are needed. The behaviour is described here; the layout is up to the designer.
   `feat(admin): manage circle hierarchy`.
6. **Audience pickers.** Files: a new shared `src/components/circle_picker.tsx` (client) that wraps the
   existing `Select multiple`, uses `orderAsTree` and shows descendants of a ticked circle as included.
   If the user ticks a descendant of a circle that's already ticked, it's kept. That's harmless, since
   storage is "what was ticked". Then replace the inline pickers in the 9 modals listed under Current state.
   Behaviour: the value is still `string[]` of ticked ids, and the "empty circle" warning uses the new audience counts.
   `refactor(ui): shared hierarchical circle picker`. This step can be split per page if it gets large.
7. **MCP.** Files: `src/utils/circles-core.ts` (`listCirclesCore` returns `parentId`),
   `src/app/api/mcp/tools/calendar.ts` and `anecdotes.ts` (descriptions say "sharing with a circle also
   shares with its sub-circles"; the `list_circles` output includes `parentId`).
   `feat(mcp): expose circle hierarchy in list_circles`.
8. **Docs.** Update `docs/architecture/Authorization.md` (rules 1 to 4, the mermaid "shared with one of my
   circles" node, the comment exception), `docs/architecture/Data model.md` (the `circles` self-relation
   in the ER diagram), `docs/architecture/Row Level Security.md` (the new helper and grants),
   `docs/architecture/Notifications pipeline.md` (recipients expand to sub-circles),
   `docs/architecture/MCP server.md`, and `docs/features/Admin console.md`. Add a new
   `docs/features/Circles.md` covering the hierarchy, linked from `docs/Le petit monde.md` and from
   `Authorization.md`. Mark `.claude/plans/quirks-and-issues.md` #10 as resolved. Add a one-line
   cross-reference in `.claude/plans/rls.md` near the `circles` batch.
   `docs(circles): document circle hierarchy`.
9. **Close-out.** Add `## Status: implemented` to this plan and move it to `.claude/plans/done/`.
   Once the user approves, record the decision (tree via `parent_circle`, recursive CTE rather than a
   closure table, ancestor inheritance, the delete behaviour) in the vault at
   `Projects/lepetitmonde/Decisions.md`.

## Translations
Add to `messages/en.json` and `messages/fr.json`. The designer can rename keys; the namespaces are fixed.
- `serverErrors.circleHierarchyCycle`, `serverErrors.circleHierarchyDepth`
- `admin.circles.parentLabel`, `parentNone` ("Top level"), `moveTitle`, `moveConfirm` (`{name}`, `{parent}`,
  telling the admin that members of {name} will see everything shared with {parent}), `moveError`,
  `inheritedMembers` / `inheritedFrom` (`{name}`), and `deleteConfirmWithChildren` (`{name}`, `{count}`, ICU plural)
- `circlePicker.includesSubCircles` (`{count}`) and `circlePicker.includedVia` (`{name}`). This is a new
  top-level namespace for the shared picker.
- Update `admin.groupAccessDescription` if it says "this group" without mentioning inherited albums.

## Design

Existing patterns reused: admin cards (`Card` with `border-landing-border bg-landing-surface`, `font-display text-base font-semibold` title, `text-rose` icon for circles), the row style of `display_circles.tsx` (`py-3.5 px-6`, `divide-y divide-landing-border`, rose-tinted icon tile, member chips `rounded-full bg-landing-background text-xs`), `useConfirm` from `src/components/confirm_provider.tsx`, `DropdownMenu`, `Dialog`, `Select`, `Input`, `Button` from `src/components/ui/`, sonner toasts. Tokens only (`text-landing-foreground`, `text-landing-muted`, `bg-landing-background`, `border-landing-border`, `text-rose`, `bg-rose/10`, `text-primary`, `text-destructive`); all work in the `.dark` theme already defined in `globals.css`, no raw colors. Popover/Select content is at `z-[70]`, dialogs at `z-[60]` per `docs/z-index.md`; the picker and the move dialog's parent Select add no new z-index values. Display font (Fraunces, `font-display`) is only for card titles and dialog titles, as today; everything else is DM Sans.

### User flow
1. Admin opens Admin page → "Sharing circles" card now shows circles as an indented tree, each row with its member count and audience count.
2. Admin taps "..." on a row → menu: "Add a sub-circle", "Move to...", "Delete".
3. "Add a sub-circle" → small dialog with a name field (parent shown as read-only line "Inside: Family") → Create → new row appears under its parent (realtime INSERT), parent auto-expanded, toast "Circle created".
4. "Move to..." → dialog with a Select of allowed parents ("Top level" first) → "Continue" → confirm dialog lists who gains and who loses access, with an explicit "applies to everything already shared" line → "Move circle" → row jumps to new position, toast "Circle moved".
5. "Delete" → confirm dialog (mentions sub-circles move up one level when there are any) → row disappears, children appear at the parent's level.
6. Admin adds/removes a member in a circle → chips update; if the person is still reachable through a sub-circle the chip stays as a dashed "included via X" chip and a toast says so.
7. In any content form (post, story, event, anecdote, album, broadcast), user opens "Visible to" → sees the same tree, ticks "Family" → "Close family" and "Grandparents" show muted implied ticks → saves; only "Family" is stored.

### Screens

#### 1. Circle tree ("Sharing circles" card) — `admin/_components/display_circles.tsx`
Wireframe (mobile, 375px):
```
┌─────────────────────────────────────┐
│ (o) Sharing circles                 │  <- CardTitle, rose icon
│ Groups organised so that wider      │
│ circles include the ones inside.    │
├─────────────────────────────────────┤
│ [v] (◎) Family                  [⋯] │  <- 44px row, chevron toggles children
│         3 members · 7 can see       │  <- text-xs muted
│   [Marie x] [Paul x] [Jo x]         │  <- direct chips (solid)
│   [Anna ┄ via Close family]         │  <- inherited chip (dashed, muted)
│   [Add a member...  v ] [+ Add]     │
│ ┃                                   │
│ ┃ [v] (◎) Close family          [⋯] │  <- indent 20px + 2px guide line
│ ┃         1 member · 4 can see      │
│ ┃   [Rose x]  [Léo ┄ via Grandparents]
│ ┃   [Add a member...  v ] [+ Add]   │
│ ┃ ┃                                 │
│ ┃ ┃ ( ) (◎) Grandparents      [⋯]   │  <- leaf: no chevron, 24px spacer
│ ┃ ┃         2 members · 2 can see   │
│ ┃ ┃   [Léo x] [Jeanne x]            │
│                                     │
│ [v] (◎) Friends                 [⋯] │
│         ...                         │
├─────────────────────────────────────┤
│ (⊘) No circle                       │  <- unchanged block
│ Members not in any circle           │
│   [Tom] [Sam]                       │
└─────────────────────────────────────┘
```
- Layout: same card and `divide-y divide-landing-border` as today, but nested rows are NOT separate bordered rows; a root circle and its subtree form one block (`py-3.5 px-6`), children indented by `depth * 20px` (max depth 3, so max 40px) with a 2px `border-l border-landing-border` guide line, so at 375px the content column is still >= 280px. Row header: chevron button (44x44 touch area via the existing `touch-target` class, 16px icon `ChevronDown`/`ChevronRight`, hidden spacer when no children), rose tile icon (`CircleDot` for root, same for children, tile `bg-rose/10 text-rose p-2 rounded-xl`), name (`font-semibold text-sm`, wraps up to 2 lines, never truncated), subtitle (`text-xs text-landing-muted`), kebab on the right. The `ID: xxxxxxxx...` mono line is removed (noise for non-technical admins). Desktop (`lg`, card sits in the 7-col column): identical, just wider; the chips and "Add a member" row stay inline.
- Subtitle format: `"{direct} members · {audience} can see"`. "can see" = distinct people who see items shared with this circle (direct plus all descendants), i.e. the audience count from `getCircleMemberCounts`. When audience == direct, show only `"{direct} members"`. Admins are not counted (as today).
- Member chips: direct members use the existing chip style, with the remove "x" (min 44px hit area via `touch-target`, label "Remove {member} from {circle}"). Inherited members (people in a descendant circle but not directly in this one) render after the direct chips as `inline-flex rounded-full border border-dashed border-landing-border text-landing-muted text-xs pl-2.5 pr-2.5 py-1` with the text `"{member} · via {circle}"` (`circle` = the sub-circle name; if via several, first by tree order plus "+N"). No remove button; `title`/tooltip-free (the text itself explains). A one-line explainer above the first inherited chip appears once per card, not per circle: see the legend below.
- Legend (below the card description, only if at least one circle has a parent): `text-xs text-landing-muted` with a small dashed chip sample: "Dashed = included through a sub-circle. Remove them from the sub-circle to take access away." (`admin.circles.legend`).
- "Add a member" Select: lists everyone not directly in the circle. People already included through a sub-circle are listed in a second group labelled "Already included via a sub-circle" (`SelectGroup` + `SelectLabel`), each item suffixed with ` · via {circle}`; they stay selectable (adding them directly is harmless and sometimes wanted: it keeps access if they leave the sub-circle). The "Add" button keeps its `xs` size but gets the 44px touch floor from the existing `Button` min-height rule (commit 9b4f0ed).
- Kebab menu (`DropdownMenu`, trigger `Button variant="outline" size="icon"`, `MoreHorizontal` icon, `aria-label` "Actions for {name}"), items with icon + text, 44px tall: `Plus` "Add a sub-circle" (disabled with sub-label "Circles can be nested 3 levels deep" when depth is 3), `ArrowRightLeft` "Move to...", `Trash2` "Delete" (`text-destructive`). Replaces the bare trash button so that delete is no longer one stray tap from the row. Non-admins (`isAdmin` false) see no kebab and no add/remove controls, but do see the tree, counts and chips, as today.
- Collapse: all expanded by default; chevron collapses only the sub-circles (the circle's own chips and add row stay visible). State is local, not persisted. Collapsed parent subtitle appends nothing; chevron `aria-expanded` conveys it.
- Interactions: no drag and drop (not touch- or keyboard-reliable and easy to trigger a retroactive access change by accident); re-parenting is only through "Move to...".
- Components: existing `Card`, `Button`, `Select`, `DropdownMenu`, `Dialog`, `useConfirm`. New small internal components in the same file or `admin/_components/`: `CircleTreeNode` (recursive row), `MemberChip` / `InheritedChip`, `MoveCircleDialog` and `AddSubCircleDialog` (both built on `src/components/ui/dialog.tsx`). Tree order and depth from `orderAsTree` in `src/utils/circle-tree.ts`.

#### 2. Add a sub-circle (dialog) and the create card — `create_circle.tsx`
Wireframe (dialog, mobile: bottom-anchored like existing dialogs, full width minus 16px margin):
```
┌─────────────────────────────────────┐
│ Add a sub-circle                [x] │
│ Inside: Family                      │
│ [ Name, e.g. Grandparents         ] │
│ People in the new circle will also  │
│ see what is shared with Family.     │
│              [Cancel] [Create circle]
└─────────────────────────────────────┘
```
- The existing "Create a sharing circle" card gets one more field under the name: a `Select` labelled "Inside" (`admin.circles.parentLabel`) defaulting to "Top level" and listing every circle indented by depth (circles at max depth are disabled with the reason "too deep"). It stays a plain server-form post to `createCircle` with a hidden/`name="parentId"` field. Because `create_circle.tsx` is a server component, only the Select needs to be a tiny client island (`CircleParentSelect`) that writes the chosen id into a hidden input; it is omitted entirely when the baby has no circles yet (first circle is always top level).
- Name input: `maxLength={INPUT_LIMITS.circleName}`, `required`, autofocus in the dialog, Enter submits.
- Submit: button shows existing pending pattern (disabled + spinner label "Creating..."). Duplicate names are allowed (as today).

#### 3. Move circle (two-step) — `MoveCircleDialog` + `useConfirm`
Step 1 wireframe:
```
┌─────────────────────────────────────┐
│ Move "Friends"                  [x] │
│ New parent                          │
│ [ Family                        v ] │  <- Select: Top level, then valid parents indented
│ Only circles that keep the tree     │
│ within 3 levels are listed.         │
│              [Cancel]    [Continue] │
└─────────────────────────────────────┘
```
- Select options: "Top level" always first (unless the circle is already top level, then it is shown selected and "Continue" is disabled), then `validParentIds(...)` in tree order, indented by depth with the same `pl-*` steps as the picker. Invalid targets (itself, its descendants, anything that would exceed depth) are not listed. The current parent is preselected and "Continue" is disabled until the choice changes. If the list is empty besides "Top level", show helper text "No other circle can hold this one." instead of the 3-level text.
- Step 2: calls `confirmAction({ title, description, content, confirmLabel: 'Move circle', destructive: false })`. `ConfirmOptions` in `confirm_provider.tsx` gets one new optional field `content?: ReactNode` rendered under the description (scrollable `max-h-[50vh] overflow-y-auto`), so existing callers are untouched. (Alternative: keep step 1 and 2 in one dialog; two steps chosen so the one irreversible-ish action always goes through the shared confirm dialog.)
Step 2 wireframe:
```
┌─────────────────────────────────────┐
│ Move "Friends" into "Family"?       │
│ Everything already shared with      │
│ Family, including older posts,      │
│ changes who can see it right away.  │
│ Nobody is notified.                 │
│                                     │
│ Will now see what is shared with    │
│ Family  (+2)                        │
│   Tom, Sam                          │
│ Will no longer see what is shared   │
│ with Close family  (-1)             │
│   Jo                                │
│                                     │
│            [Cancel] [Move circle]   │
└─────────────────────────────────────┘
```
- Content rules: compute client-side with `circle-tree.ts` and `circlesAccess`. For each person in the moved circle's subtree, compare circles they reach through ancestors before vs after the move. "Gains" section lists, per newly reached ancestor circle, the people who didn't already reach it by another path (e.g. already directly in Family). "Loses" likewise for ancestors no longer reached. Group by circle (heading line `text-sm font-medium`, names `text-sm text-landing-muted`, plus `({count})` badge). More than 6 names: first 6 then "and {n} more". Sections with nobody are omitted; if both are empty show "Nobody's access changes." and keep the button enabled. Moving to Top level from a parent shows only the "loses" section.
- Errors: if `setCircleParent` throws, toast `moveError` (generic) or the mapped `serverErrors.circleHierarchyCycle`/`circleHierarchyDepth` message (another admin moved things meanwhile); the tree resyncs via realtime.
- Success: toast "Circle moved" and the row appears in its new place; no animation beyond tw-animate `fade-in` (disabled under `motion-reduce`).

#### 4. Delete circle (confirm)
- No children: today's text ("Delete the "{name}" circle? This action can't be undone.") plus the new sentence on access: "Members lose access to content shared only with this circle."
- With children: title "Delete "{name}"?", description: "Its {count, plural, one {sub-circle} other {sub-circles}} will move up to "{parent}". This can't be undone." (if the deleted circle is top level: "will become top-level circles"). Add the same access sentence. `destructive` true, button "Delete".
- Errors: toast `deleteError` as today. Success: toast "Circle deleted".

#### 5. Shared audience picker — new `src/components/circle_picker.tsx` (client)
Built on the existing `Select` (`@/components/ui/select`, Base UI, `multiple`), so it keeps the current look, the `id`/`Label` wiring and the `string[]` value. Replaces the inline `Select` in the 9 modals + broadcast form; each keeps its own label (`visibleByLabel`) and hint (`visibleByHint`). Props: `circles` (id, name, parent_circle), `audienceCounts` (id → number), `value: string[]`, `onChange`, `disabled`, `id`.
Wireframe (closed, mobile):
```
 VISIBLE TO
 ┌───────────────────────────────────┐
 │ Family  +2 sub-circles          v │  <- trigger, h-11
 └───────────────────────────────────┘
 Family includes Close family and Grandparents.
 No circle selected = hidden post, visible to admins only.
```
Wireframe (open, mobile):
```
 ┌───────────────────────────────────┐
 │ ✓ Family                      7   │  <- explicit tick (primary), count right
 │    ✓ Close family  included   4   │  <- implied: muted tick, "included" label
 │       ✓ Grandparents inc.     2   │
 │   Friends                     3   │
 │   Godparents (empty)          0   │  <- count 0: amber-free, muted "empty"
 └───────────────────────────────────┘
```
- Layout: tree order from `orderAsTree`, indent `pl-2` / `pl-6` / `pl-10` by depth. Each item row min-height 44px (existing `SelectItem` padding is raised via className on mobile only). Right-aligned audience count `text-xs text-muted-foreground tabular-nums` (people who will see it, from `getCircleMemberCounts`). A flat tree (no parents) renders exactly like today (no indentation, no legend).
- Implied ticks: when a circle is ticked, every descendant shows a `Check` icon in `text-muted-foreground` (not the primary colour of an explicit tick) and a small `text-xs` label "included" (`circlePicker.included`). Ticking an implied row makes it explicit (tick turns primary, label disappears); harmless, and stays correct if the circle is later moved out. Unticking the parent removes implied ticks from descendants that were not explicitly ticked. Implied rows are NOT disabled (disabled rows read as "unavailable" to non-technical users).
- Trigger summary: names of explicitly ticked circles joined by ", " (wraps to 2 lines, then "+N" fallback), then if implied descendants exist a muted suffix "+{count} sub-circles" (`circlePicker.includesSubCircles`). Placeholder as today (`visibleByPlaceholder`). Helper line below the trigger: when any ticked circle has descendants, `text-xs text-muted-foreground` "Family includes Close family and Grandparents." (`circlePicker.includesList`, names listed up to 3 then "and {n} more"); otherwise only the existing hint.
- Empty circle warning: when a ticked (explicit) circle has audience count 0, show the existing warning style under the field "Nobody is in {name} yet, so nobody but admins will see this." (existing key reused, now based on audience, so a parent with filled sub-circles no longer warns).
- Interactions: tap trigger → popup (Base UI Select, `z-[70]`); popup stays open while multi-selecting; tap outside or Escape closes. On phones the popup is the existing Select popup (full-width, max-height with scroll). Optimistic: purely local state, nothing is fetched.
- Components: `Select`, `SelectTrigger`, `SelectContent`, `SelectGroup`, `SelectItem`, `SelectValue` unchanged; picker adds `Check` from lucide inside the item for implied rows (custom `ItemIndicator`-sibling, `aria-hidden`).

#### 6. Other admin spots touched
- "Access by group" (`display_circle_access.tsx`): single Select uses the same indented tree options (no ticks). Description updated: "See which albums a group can see, including albums shared with a wider circle." Album rows that appear only because of an ancestor show a muted `text-xs` suffix "via {circle}" (`circlePicker.includedVia`).
- Broadcast form: uses the shared picker; the recipient count preview updates live with the expanded audience; text unchanged.

### States
- Loading: the admin route's existing `loading.tsx` skeleton (`animate-pulse`, `bg-muted/70` blocks, `role="status"` with sr-only "Loading") already covers the card; no change. While a row action runs, that circle's block gets `aria-busy`, kebab and add controls disabled (existing `pendingCircleId` pattern), kebab icon replaced by a small `Loader2 animate-spin`. The picker has no loading state of its own (circles come from the parent page); if circles are still loading in a modal, show the Select disabled with placeholder "Loading...".
- Empty: no circles → keep today's block ("No sharing circle created yet." + hint "Use the form to create your first group.") and add a one-line tip "Tip: circles can be nested, e.g. Family > Grandparents." (`admin.circles.emptyNestingHint`). A circle with no members: subtitle "No members yet" and no chips. Picker with zero circles: trigger disabled, text "No circles yet. An admin can create them in Admin." (non-admins: "No circles yet."). "No circle" block unchanged (people in no direct circle only).
- Error: failed add/remove/delete/move/create → sonner `toast.error` with the specific string (existing pattern), UI state reverts (nothing is optimistic for structure changes; row moves only on the realtime UPDATE or router refresh). Hierarchy errors (cycle, too deep) show their own messages. If realtime is down, after success call `router.refresh()` so the tree still updates.
- Success: toasts "Circle created", "Circle moved", "Circle deleted"; member add/remove keep today's silent update except the inherited-access toast below.
- Offline / slow: admin actions are server actions; when offline they throw → the error toast appears and nothing changes (text "Something went wrong. Check your connection and try again." for move/create/delete, reusing the generic network wording if one exists). Buttons show pending state so a slow connection is visible; no double submit (controls disabled while pending). The picker works fully offline (pure client state). The move confirm is computed locally and never blocks on the network.
- After removing a member from a circle where they remain included via a sub-circle: toast info "{name} still has access through {circle}." (`admin.circles.stillIncluded`).

### Copy
Namespaces: `admin.circles.*`, `admin.createCircle.*`, `circlePicker.*`, `serverErrors.*`. ICU plurals where noted.

| Key | English | French |
|-----|---------|--------|
| admin.circlesDescription | Groups that structure who sees what. A wider circle includes the circles inside it. | Des groupes pour organiser qui voit quoi. Un cercle plus large inclut les cercles qu'il contient. |
| admin.groupAccessDescription | See which albums a group can see, including albums shared with a wider circle. | Voyez quels albums un groupe peut voir, y compris ceux partagés avec un cercle plus large. |
| admin.createCircle.parentLabel | Inside | Dans |
| admin.createCircle.parentNone | Top level | Niveau principal |
| admin.createCircle.parentTooDeep | Too deep | Trop profond |
| admin.circles.membersCount | {count, plural, one {# member} other {# members}} | {count, plural, one {# membre} other {# membres}} |
| admin.circles.noMembers | No members yet | Aucun membre pour l'instant |
| admin.circles.audienceCount | {direct, plural, one {# member} other {# members}} · {audience} can see | {direct, plural, one {# membre} other {# membres}} · {audience} peuvent voir |
| admin.circles.legend | Dashed = included through a sub-circle. Remove them from the sub-circle to take access away. | Pointillés = inclus via un sous-cercle. Retirez-les du sous-cercle pour leur retirer l'accès. |
| admin.circles.inheritedFrom | {name} · via {circle} | {name} · via {circle} |
| admin.circles.inheritedMore | {name} · via {circle} +{count} | {name} · via {circle} +{count} |
| admin.circles.alreadyIncludedGroup | Already included via a sub-circle | Déjà inclus via un sous-cercle |
| admin.circles.stillIncluded | {name} still has access through {circle}. | {name} a toujours accès via {circle}. |
| admin.circles.actionsFor | Actions for {name} | Actions pour {name} |
| admin.circles.addSubCircle | Add a sub-circle | Ajouter un sous-cercle |
| admin.circles.addSubCircleTitle | Add a sub-circle | Ajouter un sous-cercle |
| admin.circles.insideLine | Inside: {parent} | Dans : {parent} |
| admin.circles.subCircleHint | People in the new circle will also see what is shared with {parent}. | Les personnes du nouveau cercle verront aussi ce qui est partagé avec {parent}. |
| admin.circles.maxDepthHint | Circles can be nested 3 levels deep. | Les cercles peuvent être imbriqués sur 3 niveaux. |
| admin.circles.moveAction | Move to... | Déplacer vers... |
| admin.circles.moveTitle | Move "{name}" | Déplacer « {name} » |
| admin.circles.moveParentLabel | New parent | Nouveau parent |
| admin.circles.moveListHint | Only circles that keep the tree within 3 levels are listed. | Seuls les cercles qui respectent 3 niveaux maximum sont proposés. |
| admin.circles.moveNoTarget | No other circle can hold this one. | Aucun autre cercle ne peut contenir celui-ci. |
| admin.circles.moveContinue | Continue | Continuer |
| admin.circles.moveConfirm | Move "{name}" into "{parent}"? | Déplacer « {name} » dans « {parent} » ? |
| admin.circles.moveConfirmTop | Move "{name}" to the top level? | Déplacer « {name} » au niveau principal ? |
| admin.circles.moveRetroactive | Everything already shared with {parent}, including older posts, changes who can see it right away. Nobody is notified. | Tout ce qui est déjà partagé avec {parent}, y compris les anciennes publications, change immédiatement de visibilité. Personne n'est prévenu. |
| admin.circles.moveGains | Will now see what is shared with {circle} ({count}) | Verront désormais ce qui est partagé avec {circle} ({count}) |
| admin.circles.moveLoses | Will no longer see what is shared with {circle} ({count}) | Ne verront plus ce qui est partagé avec {circle} ({count}) |
| admin.circles.moreNames | and {count} more | et {count} autres |
| admin.circles.moveNoChange | Nobody's access changes. | L'accès de personne ne change. |
| admin.circles.moveSubmit | Move circle | Déplacer le cercle |
| admin.circles.moved | Circle moved | Cercle déplacé |
| admin.circles.moveError | Something went wrong while moving the circle. | Une erreur est survenue lors du déplacement du cercle. |
| admin.circles.created | Circle created | Cercle créé |
| admin.circles.deleted | Circle deleted | Cercle supprimé |
| admin.circles.deleteConfirm | Delete the "{name}" circle? Members lose access to content shared only with it. This can't be undone. | Supprimer le cercle « {name} » ? Ses membres perdent l'accès au contenu partagé uniquement avec lui. Cette action est irréversible. |
| admin.circles.deleteConfirmWithChildren | Delete "{name}"? Its {count, plural, one {sub-circle} other {sub-circles}} will move up to "{parent}". Members lose access to content shared only with "{name}". This can't be undone. | Supprimer « {name} » ? {count, plural, one {Son sous-cercle remontera} other {Ses sous-cercles remonteront}} dans « {parent} ». Ses membres perdent l'accès au contenu partagé uniquement avec « {name} ». Cette action est irréversible. |
| admin.circles.deleteConfirmWithChildrenTop | Delete "{name}"? Its {count, plural, one {sub-circle} other {sub-circles}} will become top-level. Members lose access to content shared only with "{name}". This can't be undone. | Supprimer « {name} » ? {count, plural, one {Son sous-cercle passera} other {Ses sous-cercles passeront}} au niveau principal. Ses membres perdent l'accès au contenu partagé uniquement avec « {name} ». Cette action est irréversible. |
| admin.circles.emptyNestingHint | Tip: circles can be nested, e.g. Family > Grandparents. | Astuce : les cercles peuvent être imbriqués, par ex. Famille > Grands-parents. |
| admin.circles.networkError | Something went wrong. Check your connection and try again. | Une erreur est survenue. Vérifiez votre connexion et réessayez. |
| circlePicker.included | included | inclus |
| circlePicker.includesSubCircles | {count, plural, one {+# sub-circle} other {+# sub-circles}} | {count, plural, one {+# sous-cercle} other {+# sous-cercles}} |
| circlePicker.includesList | {name} includes {list}. | {name} inclut {list}. |
| circlePicker.includedVia | via {name} | via {name} |
| circlePicker.audienceCount | {count, plural, one {# person} other {# people}} | {count, plural, one {# personne} other {# personnes}} |
| circlePicker.emptyWarning | Nobody is in {name} yet, so only admins will see this. | Personne n'est encore dans {name} : seuls les admins verront ceci. |
| circlePicker.loading | Loading... | Chargement... |
| circlePicker.noCirclesAdmin | No circles yet. Create them in Admin. | Aucun cercle pour l'instant. Créez-en dans Admin. |
| circlePicker.noCircles | No circles yet. | Aucun cercle pour l'instant. |
| circlePicker.optionLabel | {name}, level {level}, {count} people | {name}, niveau {level}, {count} personnes |
| circlePicker.optionLabelIncluded | {name}, level {level}, included via {parent} | {name}, niveau {level}, inclus via {parent} |
| serverErrors.circleHierarchyCycle | A circle can't be placed inside itself or one of its sub-circles. | Un cercle ne peut pas être placé dans lui-même ou dans l'un de ses sous-cercles. |
| serverErrors.circleHierarchyDepth | Circles can only be nested 3 levels deep. | Les cercles ne peuvent être imbriqués que sur 3 niveaux. |

(Existing keys `admin.circles.empty`, `emptyHint`, `deleteTitle`, `removeTitle`, `add`, `addMemberPlaceholder`, `withoutCircle*` stay; the old `deleteConfirm` text is replaced by the version above. The plan's draft key `moveConfirm` (`{name}`, `{parent}`) is kept as written; `admin.circlesDescription` is reworded. Reuse `common.cancel` / `common.confirm`.)

### Accessibility
- Tree semantics: the circle list is `role="tree"` with `aria-label` "Sharing circles"; each circle block is `role="treeitem"` with `aria-level` (1..3), `aria-expanded` only when it has children, `aria-setsize`/`aria-posinset`; sub-circles sit in `role="group"`. The member chips and Add row live inside the treeitem as ordinary focusable controls. Keyboard (roving tabindex on the treeitem header): Up/Down move between visible circles, Right expands or moves to first child, Left collapses or moves to parent, Home/End first/last, Enter or Space toggles expand, Tab moves into that circle's controls (kebab, chips, Add). Kebab also opens with Enter/Space/Down. Menus and dialogs use Base UI focus management (trap, Escape closes, focus returns to the kebab).
- Not colour-only: inherited chips differ by dashed border AND the "via {circle}" text; implied picker ticks differ by muted icon AND the word "included"; gains/loses differ by heading text and +/- counts.
- Names: icon-only buttons have `aria-label`s (chevron: "Show/Hide sub-circles of {name}", kebab "Actions for {name}", chip remove "Remove {member} from {circle}"). Move/delete dialogs have `DialogTitle` and `DialogDescription`; initial focus on the Select (move), name input (add), or Cancel (delete/confirm, as the existing confirm dialog does). Toasts use sonner's polite live region.
- Picker: Base UI Select provides listbox with `aria-multiselectable`; each option gets `aria-label` from `optionLabel` / `optionLabelIncluded` (level and included state spoken); the helper line is linked with `aria-describedby`. Hint and warning texts are real text, not placeholders.
- Touch targets >= 44px for chevron, kebab, chip remove, Add, menu items, picker options. Visible focus uses the existing `focus-visible:ring-3 ring-ring/30` pattern. Contrast: `text-landing-muted` on `bg-landing-surface` is the existing admin body-muted pair; dashed chips use the same text token, never lighter. Dark mode works through the same tokens.
- Motion: chevron rotation and row expand use `transition` + tw-animate classes under `motion-safe:`; with `prefers-reduced-motion` the change is instant.
- French: "Ne verront plus ce qui est partagé avec ..." and the delete text are the longest strings; they wrap, dialogs are `max-h` scrollable, and nothing relies on single-line fit. Subtitle may wrap to two lines.

### Questions
- Open question 5 (plan): proposed default is to show people already included via a sub-circle in the "Add a member" list but in a separate "Already included" group (still selectable) and keep "No circle" for people in no direct circle only. Confirm, or hide them.
- The move confirm computes gains/loses on the client from the circles and access rows the page already has; it ignores admins (they always see everything). This is display only, the server stays the source of truth. OK?
- `confirm_provider.tsx` needs one new optional `content?: ReactNode` field for the rich move confirm. Flagging in case the builder prefers a dedicated dialog.
- Audience counts shown to every member in pickers (`getCircleMemberCounts`) already exist today, so no new exposure. Planner: the picker needs counts for all circles per request, confirm the member-only action returns the map for each descendant-expanded circle.
- Admin page restructuring (separate "Circles & access" page) was not done: the existing "Sharing circles" and "Access by group" cards are kept in place to stay consistent. A dedicated route would be a larger change; say if you want it.
- Depth 3 is assumed in all copy ("3 levels"); if the maximum becomes 4, change `maxDepthHint`, `moveListHint` and `serverErrors.circleHierarchyDepth`, ideally by interpolating `{max}`.

## Risks and open questions
- **Retroactive access on move.** This is the biggest risk of the feature. One drag can show years of
  Family content to a new sub-circle. Mitigation: an explicit confirm that names both circles. No
  notifications are sent on a move.
- **Removing a member from a parent circle doesn't revoke access** if they're still in a sub-circle (see
  Semantics). The admin UI must make that visible.
- **Comment visibility widens slightly** (rule 4).
- **Coordination with `rls.md`.** This plan changes the body of `is_circle_visible`, which that rollout will use.
  The signature is unchanged and no policy uses it yet. The other owner needs to know.
- **Caches.** Visibility can lag up to 5 s after a move, because of the TTL caches. That's acceptable and the same as membership changes today.
- **Performance.** One extra small query per request (the tree), then work in memory. No N+1.

## How to verify
SQL, run with `mise exec -- supabase db query --db-url …` inside `BEGIN; … ROLLBACK;` on the
`+rls` test babies:
- Setting A's parent to B while B's parent is A fails with `circle_hierarchy_cycle`. `parent_circle = id` fails the CHECK.
- Nesting a 4th level, or moving a 2-level subtree under a level-2 circle, fails with `circle_hierarchy_depth`.
- A parent from another baby fails the composite FK.
- Deleting a middle circle moves its children up to the grandparent. Deleting a root makes its children roots.
- `is_circle_visible` as a Grandparents-only user returns true for `[Family]` and false for a sibling-only circle.
- `SELECT has_function_privilege('anon', 'public.circle_descendants_or_self(uuid[])', 'execute')` returns false.
  Do the same check for both trigger functions.

App, manual, with Family → Close family → Grandparents, a sibling "Friends", and test accounts
G (Grandparents only), F (Family only) and X (Friends only):
- A post, story, event, anecdote and album shared with **Family**: G and F see it (feed, calendar,
  anecdotes, albums, photo URLs through `/api/storage/...`). X does not.
- The same items shared with **Grandparents**: G sees them, F does not. F opening the storage URL directly gets 404.
- Push and new-post email for a Family post reach G and F, not X. Editing a Grandparents post to Family
  notifies F only, as "newly visible".
- Broadcast to Family: the preview count matches the number actually sent, and includes G.
- MCP with G's token: `list_events` and `list_anecdotes` include Family items. `list_circles` (admin)
  returns `parentId`. The digest includes Family events.
- A comment by G on a Family post is visible to F. A comment by X on a post shared with Family and Friends is not visible to G.
- Admin: moving Friends under Family shows the confirm, then X sees Family content after a refresh.
  The Access-by-group card for Grandparents lists Family albums. Invalid parents (self, descendants, too deep) can't be picked.
- **User without access:** a viewer of another baby calling `setCircleParent` / `createCircle` with this
  baby's circle ids gets `unauthorized`. A non-admin member calling them gets `unauthorized`. A
  `parentId` from another baby gets `unauthorized` (app) or an FK error (DB). An account in no circle
  still gets the pending-access notice.
- `pnpm typecheck` and `pnpm lint` are clean.

## Open questions
1. Maximum depth: is 3 levels (Family → Close family → Grandparents) enough, or do you want 4?
2. Deleting a circle that has sub-circles: move its children up to its parent (proposed), or refuse
   the delete until the admin moves them?
3. Comment visibility: OK with rule 4 (comments visible across the tree, wherever both people can see
   the post), or keep comments strictly within the author's own sub-circles?
4. Moving a circle: is a confirm dialog enough, or should a move also notify the members who gain access?
5. Admin page: should a member who is in "Grandparents" be offered for "Family" at all, or shown as
   "already included"? This changes the "No circle" list and the add-member dropdown.
