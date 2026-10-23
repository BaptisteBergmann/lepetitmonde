# Security: access control fixes (C1, H1, H2, H3, L7)

Status: partially implemented (2026-10-23): Steps 1 and 3-9 done; Step 2 (H1) skipped, blocked on `rls.md` Step 4 (on hold). Not moved to `done/` for that reason.
Approved by:

Updated 2026-10-23 with `.claude/plans/security-plan-review.md` (items 1-6, recommended order).

## Goal
Close the app-level access control holes from `.claude/plans/security-findings.md` (2026-10-23
audit):
- C1: the bug-report screenshot route can be used to traverse out of its bucket with the
  service-role key.
- H1: bug reports are not scoped to a family.
- H2: membership checks are missing on read actions and on the admin page.
- H3: child ids are not checked against the baby in event, anecdote and circle writes.
- L7: two functions run before any membership check.

After this plan, a signed-in user can read or change data only for babies they belong to. Bug
reports are visible only to system admins (`rls.md` Steps 4-5, which this plan depends on).

## Out of scope
- RLS policies and grants. These are covered by `.claude/plans/rls.md` (B1-B12 and Step 17)
  and are not repeated here. `system_admins` / `is_system_admin()` / `assertSystemAdmin()`
  (`rls.md` Steps 4-5) are **not** out of scope any more: they are a prerequisite of Step 2
  (review item 1).
- The other findings: H4 (deps), H5 (RLS), M1-M9, L1-L6, L8-L15.
- Text length validation on events, anecdotes and circles (M9).
- Mass assignment in todo and inventory (M8).
- Removing the now-dead `isAdmin` branches on the admin page (cleanup only, no security effect).
- Stripping `circles_access` and `baby_access` realtime payloads. That is in
  `security-hardening.md` Step 10 (review item 6).
- Automated tests. The repo has no test runner (`package.json` scripts: dev, build, start,
  lint, typecheck), so negative cases are manual. See "How to verify".

## Current state
- **Bug reports**
  - `src/app/api/bug-reports/[...path]/route.ts`:
    - joins the client's catch-all segments and downloads them with
      `createAdminClient().storage.from('bug-reports')`.
    - has no `hasUnsafePathSegment` check (`src/utils/storage-path.ts`).
    - its only gate is "admin of any baby" (lines 28-38).
  - `src/utils/actions/bug_reports.ts`:
    - `getBugReports(babyId)` runs `assertIsAdmin` and then selects every row.
    - `updateBugReportStatus` updates by id alone, with `.single()`.
  - `bug_reports.created_by` is nullable.
  - Screenshot paths are always `${user.id}/${Date.now()}.png` (unchanged since `e22992c`).
  - The UI builds the URL as `/api/bug-reports/${report.screenshot_path}`
    (`src/app/baby/[babyId]/admin/_components/display_bug_reports.tsx:84-85`).
  - `rls.md` Step 4 (B0: `system_admins`, `is_system_admin()`) has **not** run. No migration
    in `supabase/migrations/` defines it. `rls.md` Steps 1-3 have shipped
    (`src/utils/invitations.ts` and `src/utils/album-share.ts` exist). `rls.md` Step 0 (the
    preflight and rehearsal tooling under `supabase/rls/`) has not shipped either, and every
    `rls.md` DB batch, including Step 4, uses it.
- **Reads with no membership check (H2)**
  - `src/utils/actions/users.ts`: `getUsers` checks only that a session exists.
  - `src/utils/actions/baby.ts`: `getBaby` checks only that a session exists, and uses
    `console.error`.
  - `src/utils/actions/circles.ts`: `getCircles`, `getCirclesAccess` (any `userId`, TTL cache
    keyed `babyId:userId`), `getCircleMemberCounts` and `getAllCirclesAccess` all check only
    that a session exists.
  - `src/app/baby/[babyId]/admin/page.tsx` calls `getUsers`, `getCircles` and
    `getAllCirclesAccess` before any access check, and has no `assertPageAccess`. In the nav,
    `admin` is always `role: 'admin'` (`page_settings.ts:55-66`), and no other link points to
    `/admin`.
- **Writes with unchecked child ids (H3)**
  - `src/utils/actions/events.ts`:
    - `updateEvent` scopes the row update by `baby_id`, but then deletes and re-inserts
      `events_circles` by `eventId` alone.
    - `createEvent` and `updateEvent` never validate `circleIds`.
  - `src/utils/actions/anecdotes.ts`: `updateAnecdote` and `createAnecdote` have the same
    problem with `anecdotes_circles`.
  - `src/utils/actions/circles.ts`: `addUserToCircle` inserts `circles_access` without
    checking that the circle or the user belongs to `babyId`. It then reads the circle name by
    id alone.
  - `assertCirclesInBaby` builds `new Set(circleIds)`. A string argument is iterated
    character by character, so it does not fail as a non-array.
- **L7**
  - `src/utils/actions/page_settings.ts`: `getPageSettings` has no auth at all. It has a TTL
    cache keyed by `babyId`.
  - `src/utils/actions/stories.ts`: `getActiveStories` fires `pruneExpiredStories(babyId)`
    (line 248) before `getUserAccess`.
- **Helpers to reuse**
  - `src/utils/feed-access.ts` (`server-only`): `assertMember`, `assertAdmin`,
    `assertCirclesInBaby`.
  - `src/utils/albums-internal.ts`: `assertAlbumInBaby`, the "row exists in this baby,
    otherwise `unauthorized`" pattern.
  - `src/utils/actions/access.ts` (`server-only`, not `'use server'`): `assertIsAdmin`,
    `getAllBabyMemberIds`. `rls.md` Step 5 adds `assertSystemAdmin` here.
  - `src/utils/actions/users.ts`: `getUserAccess`, plus the "check before the cache" pattern
    in `getNicknamesByBaby`.
  - `src/utils/storage-path.ts`: `hasUnsafePathSegment`.
  - `src/utils/actions/page_settings.ts`: `assertPageAccess`.

### Import-cycle constraint (important)
`feed-access.ts` imports `getUserAccess` from `users.ts` and `getUserCircleIds` from
`circles.ts`. `getFeedViewer` → `getUserCircleIds` → `getCirclesAccess`. So:
- **Do not** call `assertMember` or `assertAdmin` from `getCirclesAccess`, because that would
  recurse forever. Do not import `feed-access.ts` into `users.ts` or `circles.ts` at all, to
  avoid a module cycle.
- In `users.ts`, `baby.ts` and `circles.ts`, use `getUserAccess` + `Array.isArray(access)`
  (the `getNicknamesByBaby` pattern). This is the same check `assertMember` makes internally.
- `events.ts` and `anecdotes.ts` are not imported by `feed-access.ts`, so they can import
  `assertCirclesInBaby` from `@utils/feed-access` (as `posts.ts` and `albums.ts` already do).

### CLAUDE.md drift
- Server Actions live in `src/utils/actions/`, not `app/actions/`.
- `@/utils/supabase/client` does not exist.

## Approach
Add explicit checks at the top of each affected function, using existing helpers. This plan
makes no schema change of its own; Step 2 depends on the `rls.md` Step 4 migration.
- **C1:** the screenshot route serves only a path that matches a strict format and an
  existing `bug_reports.screenshot_path`, so a client string never reaches storage.
- **H1:** run `rls.md` Steps 4-5 as Step 2 of this plan. Bug reports become visible only to
  system admins (`assertSystemAdmin()` in `getBugReports`, `updateBugReportStatus` and the
  screenshot route). The C1 path validation and the row lookup from Step 1 stay.
- **H2 and L7:** add a membership check before any query or cache lookup. Non-members get the
  same empty or `unauthorized` result as a signed-out caller.
- **H3:** check that `circleIds` is an array of strings, then validate it with
  `assertCirclesInBaby`. Require the parent row update to match one row in `babyId` before the
  link tables are touched. Scope `addUserToCircle`'s circle and user to `babyId`.

Alternatives considered for H1:
- An interim "reporter is a member of a baby the caller administers" filter (the first draft of
  this plan). Rejected by the review: a reporter who belongs to two families exposes their
  reports to both families' admins.
- A server-only `SYSTEM_ADMIN_USER_IDS` env allowlist checked in the three gates, returning 404
  otherwise. It needs no migration, but it duplicates `rls.md`'s `system_admins` table and
  would be thrown away. Use it only if `rls.md` Step 4 is blocked.

## Data and migrations
- This plan adds no migration of its own.
- Step 2 depends on `rls.md` Step 4 (B0, migration `rls_helpers_and_indexes`: helper
  functions, policy indexes, `system_admins`, `is_system_admin()`), applied with the `rls.md`
  per-batch procedure (which needs `rls.md` Step 0 tooling), plus the manual seed of
  `system_admins`. `database.types.ts` is regenerated in that `rls.md` step, not here.

## Access and security
- **`/api/bug-reports/[...path]`** (route, uses the service role):
  - Session required (401).
  - Path must be exactly 2 segments and pass `hasUnsafePathSegment`, and the joined path must
    match `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/\d{1,16}\.png$`
    (400).
  - A `bug_reports` row must exist with `screenshot_path` equal to that path (404).
  - If `row.created_by` is null, return 404 before any further lookup (review item 2).
  - After Step 2: the caller must be a system admin (`assertSystemAdmin()` / `is_system_admin()`).
    Otherwise 404, so ids can't be probed.
  - The service role then downloads `row.screenshot_path` (the DB value). Service role is still
    needed: the bucket is private and there are no storage policies (`rls.md` "Storage").
- **`getBugReports(babyId)`** and **`updateBugReportStatus(babyId, id, status)`**: after Step 2,
  `assertSystemAdmin()` replaces `assertIsAdmin`. `updateBugReportStatus` uses `.maybeSingle()`
  and throws `unauthorized` when no row matches. `notifyBugReportFixed` is unchanged: it still
  targets the reporter read from the DB.
- **`getUsers`, `getBaby`, `getCircles`, `getCircleMemberCounts`**: the caller must be a
  member of `babyId` (`getUserAccess`).
- **`getCirclesAccess(babyId, userId)` / `getUserCircleIds`**:
  - The caller must be a member of `babyId`.
  - If `userId !== caller`, the caller must be an admin of `babyId`.
- **`getAllCirclesAccess(babyId)`**: admin of `babyId` (`assertIsAdmin`). Its only caller is
  the admin page, which becomes admin-only.
- **Admin page**: `assertPageAccess(babyId, 'admin')` before any data call. Non-members and
  viewers are redirected to `/baby/<babyId>`, which itself calls `notFound()` for
  non-members.
- **`createEvent`, `updateEvent`, `createAnecdote`, `updateAnecdote`**:
  - `assertIsAdmin` (unchanged).
  - `circleIds` must be an array whose elements are all strings (`unauthorized` otherwise).
  - `assertCirclesInBaby(circleIds, babyId)`.
  - Update paths: the update must return exactly one row in `babyId` before the link tables
    are cleared or written.
- **`addUserToCircle`**:
  - `assertIsAdmin` (unchanged).
  - The circle must belong to `babyId`.
  - `userId` must be in `getAllBabyMemberIds(babyId)`.
  - The circle name is read with `.eq('baby_id', babyId)`.
- **`getPageSettings(babyId)`**: the caller must be a member of `babyId`, checked before the
  TTL cache. Otherwise return `[]`.
- **`getActiveStories(babyId)`**: `pruneExpiredStories` runs only after `getUserAccess`
  confirms membership.
- No new public endpoints, no new service-role uses, and no auth, email or push changes.

## Steps
Each step is one Conventional Commit, followed by its own `CHANGELOG.md` commit.
- **Verification for every step:**
  1. `pnpm typecheck && pnpm lint`.
  2. The negative case listed for the step, on dev (`:latest`).
  3. A happy-path smoke test.
- **Test identities:** reuse the `rls.md` test babies T and U and the `+rls` accounts:
  - "admin T": admin of T only
  - "viewer T": viewer of T
  - "outsider": member of U only
  - "dual member": member of both T and U (for the Step 2 cross-family test)
- **Replaying a Server Action:**
  1. In devtools, copy the action's POST as cURL (it has the `Next-Action` header).
  2. Edit the JSON args.
  3. Replay it with the attacker's cookies.
  4. Next exposes an action id only for actions referenced from client code. After
     `pnpm build`, find the real path of the server reference manifest (expected
     `.next/server-reference-manifest.json`; check, it may live under `.next/server/`). If a
     function has no entry there, record "not exposed as an action" in the step's commit body
     and in `security-findings.md`, and verify the fix through the page HTML / RSC payload of
     the page that calls it instead (review item 3). This applies to every replay in Steps 3-8.

### Sequencing
From the review's recommended order:
1. Step 1 (C1) first, alongside `security-deps-and-ci.md` Steps 1-2 (H4).
2. `rls.md` Step 0 (tooling) and Step 4 (B0 migration + `system_admins` seed), then Step 2 here
   (which is `rls.md` Step 5).
3. Steps 3-8 next. They don't depend on Step 2 and may land before it if `rls.md` Step 4 is
   delayed; Step 2 must not be replaced by an interim filter.

1. **`fix(security): validate bug report screenshot paths before download`** (C1)
   - Files: `src/app/api/bug-reports/[...path]/route.ts`
   - Reuse `hasUnsafePathSegment` from `src/utils/storage-path.ts` (same placement as
     `src/app/api/storage/[babyId]/[...path]/route.ts:43`).
   - After the session check:
     - reject unless `path.length === 2`, `!hasUnsafePathSegment(path)` and the regex above
       matches. Return 400 and log `warn`.
     - look up `bug_reports` (user client) `.select('screenshot_path, created_by')
       .eq('screenshot_path', objectPath).maybeSingle()`. Return 404 if there is none.
     - return 404 if `row.created_by` is null (review item 2).
     - download `row.screenshot_path`, not `objectPath`.
   - Keep the existing "admin of any baby" gate for this commit. Step 2 replaces it.
   - Update the route's header comment.
   - Negative test: as admin T, run
     `curl -s -o /dev/null -w '%{http_code}' -b '<cookies>' '<dev>/api/bug-reports/..%2F..%2Fbucket'`
     and expect `400`. Repeat with `..%2F<babyT-id>%2Fposts%2F<postId>%2F<file>` (expect 400) and
     with a well-formed path that has no row (expect 404).
   - Positive test: a real screenshot still opens from the admin page.

2. **`feat(admin): restrict bug reports to system admins`** (H1; this is `rls.md` Step 5)
   - **Dependency:** `rls.md` Step 4 has been applied (B0 migration through the `rls.md`
     per-batch procedure, which needs `rls.md` Step 0) and the user has seeded
     `system_admins`. Do not start this step before that. Do not ship an interim
     family-scoped filter in its place (review item 1).
   - Files (as listed in `rls.md` Step 5):
     - `src/utils/actions/access.ts` (`assertSystemAdmin`)
     - `src/utils/actions/bug_reports.ts`
     - `src/app/api/bug-reports/[...path]/route.ts`
     - the admin page component that lists bug reports
   - Follow `rls.md` Step 5 and its "Bug reports (Step 4)" access notes. In addition:
     - Route: keep the Step 1 path validation, row lookup and null-`created_by` 404. Replace
       the "admin of any baby" query with `assertSystemAdmin()`; on failure return 404 (not
       403), so report existence isn't confirmed.
     - `updateBugReportStatus`: switch `.single()` to `.maybeSingle()`. If there is no row, log
       `warn` and `throw await actionError('unauthorized')`.
     - Admin page: render the bug report list only for system admins; non-system admins see
       no bug report section and no error.
   - Negative tests:
     - **Cross-family (review item 1):** dual member (in T and U) files a report with a
       screenshot from `/baby/<U>/feed`. As admin T (not a system admin), the report does not
       appear on `/baby/<T>/admin`, and its screenshot URL `/api/bug-reports/<dual-uuid>/<ts>.png`
       returns 404.
     - As admin T, replaying `updateBugReportStatus(<T>, <anyReportId>, 'reviewed')` returns
       unauthorized, and the status is unchanged in the DB.
     - As the outsider, the screenshot URL of any report returns 404.
   - Positive test: as the system admin, all reports appear, screenshots open, and marking one
     fixed still sends the push to the reporter.
   - Then mark `rls.md` Step 5 done (see Step 9).

3. **`fix(security): require baby membership in getUsers and getBaby`** (H2)
   - Files:
     - `src/utils/actions/users.ts` (`getUsers`)
     - `src/utils/actions/baby.ts` (`getBaby`)
   - Reuse the `getUserAccess(babyId)` + `Array.isArray(access)` check (the
     `getNicknamesByBaby` pattern). Do not use `assertMember`; see "Import-cycle constraint".
   - `getUsers`: return `[]` for non-members, which matches the existing signed-out behavior.
   - `getBaby`: return `[]` for non-members. Existing callers already treat `[]` as not found:
     `baby/[babyId]/page.tsx` calls `notFound()`, and `onboarding/page.tsx` redirects to `/`.
     Replace its `console.error` with a pino child logger while touching it.
   - Negative test: as outsider, open `/baby/<T>`. Expect 404. Replay `getUsers(<T>)` and
     expect `[]` in the response (or record "not exposed as an action", see above).
   - Positive test: the T landing page, onboarding and the guess leaderboard
     (`guesses.ts:216`) still list members.

4. **`fix(security): require baby membership in circle reads`** (H2)
   - Files: `src/utils/actions/circles.ts` (`getCircles`, `getCircleMemberCounts`,
     `getCirclesAccess`, `getAllCirclesAccess`)
   - Import `getUserAccess` from `./users`. This adds no cycle, because `users.ts` does not
     import `circles.ts`.
   - `getCircles`, `getCircleMemberCounts`: throw `actionError('unauthorized')` for non-members.
   - `getCirclesAccess`:
     - **before** `circlesAccessCache.get`, check membership and return `[]` if the caller is
       not a member. This keeps `withVisibility` callers in posts, stories, anecdotes, albums
       and highlights returning empty rather than throwing.
     - if `userId !== user.id` and the caller is not admin, throw `unauthorized`.
     - do **not** call `assertMember` here, because it would recurse through `getFeedViewer`.
   - `getAllCirclesAccess`: `assertIsAdmin(supabase, babyId)`.
   - Negative test: as outsider, replay `getCircles(<T>)` (expect unauthorized),
     `getCirclesAccess(<T>, <viewerT-id>)` (expect `[]`) and `getAllCirclesAccess(<T>)` (expect
     unauthorized). As viewer T, replay `getCirclesAccess(<T>, <adminT-id>)` and expect
     unauthorized. Functions with no manifest entry: record "not exposed as an action".
   - Positive test: feed, albums, anecdotes and calendar still show the circle picker and
     filter correctly for admin T and viewer T.

5. **`fix(security): gate the admin page on admin access`** (H2)
   - Files: `src/app/baby/[babyId]/admin/page.tsx`
   - Reuse `assertPageAccess(babyId, 'admin')` from `@/utils/actions/page_settings`, as the
     first statement after `await params`, before `getUserAccess`/`getUsers`.
   - Leave the existing `isAdmin` branches as they are.
   - Negative test:
     - As outsider, open `/baby/<T>/admin`. You should be redirected to `/baby/<T>` and then
       get a 404.
     - Search the response (view-source and the RSC payload) for a T member's name. Expect no
       match.
     - As viewer T, open `/baby/<T>/admin` and expect a redirect to `/baby/<T>`.
   - Positive test: admin T sees the full admin page.

6. **`fix(security): scope event and anecdote circle links to their baby`** (H3)
   - Files:
     - `src/utils/actions/events.ts` (`createEvent`, `updateEvent`)
     - `src/utils/actions/anecdotes.ts` (`createAnecdote`, `updateAnecdote`)
   - Reuse `assertCirclesInBaby` from `@utils/feed-access` (same as `posts.ts:45`), and the
     `assertAlbumInBaby` idea of "row must exist in this baby".
   - **Shape check first (review item 4):** in all four functions, before
     `assertCirclesInBaby`, require
     `Array.isArray(circleIds) && circleIds.every((id) => typeof id === 'string')` (for
     `updateEvent`, on `patch.circleIds` when it is set). Otherwise log `warn` and
     `throw await actionError('unauthorized')`. This stops a string being split into
     characters by `new Set(circleIds)`.
   - `createEvent` / `createAnecdote`: shape check, then
     `await assertCirclesInBaby(circleIds, <baby_id>)` right after `assertIsAdmin`, before the
     insert.
   - `updateEvent`:
     - if `patch.circleIds` is set, shape-check it and call
       `assertCirclesInBaby(patch.circleIds, babyId)` first.
     - chain `.select('id').maybeSingle()` on the `events` update.
     - if no row came back, log `warn` and `throw await actionError('unauthorized')` before
       any `events_circles` delete or insert.
   - `updateAnecdote`: same pattern: shape check, `assertCirclesInBaby(circleIds, babyId)`,
     then `.select('id').maybeSingle()` on the update, then `unauthorized` on 0 rows.
   - Negative tests (the `security-findings.md` "Manual checks" item 5):
     - As admin T, replay `updateEvent(<U-eventId>, <T>, { circleIds: [] })` and expect
       unauthorized, with U's `events_circles` rows unchanged in the DB.
     - Replay `updateEvent(<T-eventId>, <T>, { circleIds: [<U-circleId>] })` and expect
       unauthorized.
     - Replay `updateEvent(<T-eventId>, <T>, { circleIds: '<T-circleId>' })` (a string, not an
       array) and expect unauthorized, with no `events_circles` change.
     - Replay `createAnecdote` with a U circle and expect unauthorized and no row inserted.
     - Repeat for `updateAnecdote`, including the string `circleIds` case.
   - Positive test: edit an event and an anecdote and change their circles. The visibility
     change shows for viewer T.

7. **`fix(security): scope addUserToCircle to the admin's baby`** (H3)
   - Files: `src/utils/actions/circles.ts` (`addUserToCircle`)
   - Do not import `assertCirclesInBaby` here, because of the module cycle. Use the same
     check inline:
     - move the circle lookup **before** the insert:
       `.from('circles').select('name').eq('id', circleId).eq('baby_id', babyId).maybeSingle()`.
     - if there is no row, throw `unauthorized`.
   - Reuse `getAllBabyMemberIds(babyId)` from `./access`. If it does not include `userId`,
     throw `unauthorized`.
   - Then insert `circles_access`. Use the already-fetched name for the push.
   - Negative tests:
     - As admin T, replay `addUserToCircle(<U-circleId>, <viewerT-id>, <T>)` and expect
       unauthorized, with no new `circles_access` row.
     - Replay `addUserToCircle(<T-circleId>, <outsider-id>, <T>)` and expect unauthorized.
   - Positive test: admin T adds viewer T to a T circle, and viewer T gets the push with the
     circle name.

8. **`fix(security): check membership in getPageSettings and before pruning stories`** (L7)
   - Files:
     - `src/utils/actions/page_settings.ts` (`getPageSettings`)
     - `src/utils/actions/stories.ts` (`getActiveStories`)
   - `getPageSettings`:
     - start with `const access = await getUserAccess(babyId); if (Array.isArray(access)) return []`,
       placed **before** `pageOverridesCache.get` (the `getNicknamesByBaby` pattern).
     - existing callers keep working: the nav iterates the caller's own babies, the baby page
       is already `notFound()` for non-members, and `assertPageAccess` redirects when the page
       is not found.
   - `getActiveStories`:
     - move the `getUserAccess(babyId)` call above the prune.
     - fire `pruneExpiredStories` only when `!Array.isArray(access)`.
     - return `[]` early for non-members.
     - this matches the `rls.md` B10 rule that any member may delete expired stories they can
       see.
   - Negative tests:
     - As outsider, replay `getPageSettings(<T>)` and expect `[]`.
     - With an expired, non-highlighted story in T, replay `getActiveStories(<T>)` as outsider.
       Expect `[]`, and the expired row still exists in `stories`.
     - Then load T's feed as viewer T. The row is pruned.
     - Functions with no manifest entry: record "not exposed as an action" and check the page
       payload instead.
   - Positive test: nav and section cards are unchanged for admin T and viewer T.

9. **`docs(plans): record security access control fixes`**
   - Files:
     - this plan: add `## Status: implemented` and move it to `.claude/plans/done/`.
     - `.claude/plans/security-findings.md`:
       - mark C1, H1, H2, H3 and L7 fixed, with commit hashes.
       - **Server Action gate inventory (review item 5):** add a section listing every export
         from every `'use server'` file in `src/utils/actions/`, one row per export, with its
         gate: `assertIsAdmin` / `assertSystemAdmin` / `getUserAccess` / `assertMember` /
         `hasPageAccess` / own row (`user_id = caller`) / none (with the reason, e.g. a public
         auth action). Also note "not exposed as an action" for any export with no manifest
         entry. Build the list with `grep -l "^'use server'" src/utils/actions/*.ts` and read
         each file; any export with no gate is a new finding, reported to the user, not fixed
         silently.
     - `.claude/plans/rls.md` Step 5: mark it done by this plan's Step 2 (commit hash), and note
       that the C1 path and row checks in the route must stay.

## Translations
- None. All errors reuse `serverErrors.unauthorized`. Route responses keep their existing
  French JSON strings.

## Design
No UI changes beyond hiding the bug report list from non-system admins, which uses the
existing component as-is (`rls.md` Step 5).

## Risks and open questions
- **H1 depends on `rls.md` Steps 0 and 4.** Until they ship, bug reports remain visible to any
  admin (the C1 fix in Step 1 still applies). If `rls.md` Step 4 is blocked for long, fall back
  to the `SYSTEM_ADMIN_USER_IDS` env allowlist (see Approach) rather than the rejected interim
  family filter.
- **Behavior change:** family admins who are not system admins no longer see bug reports.
  This is the intended `rls.md` rule (user decision: system admins are the owner only).
- **Behavior change:** viewers who type `/baby/<id>/admin` are now redirected. The nav never
  showed them this page, so this matches the intended rule.
- **`rls.md` ordering:** B12 (`rls_bug_reports`) limits `bug_reports` SELECT to
  `is_system_admin()`. Step 2 already uses the same rule, so nothing breaks when B12 lands.
  `rls.md` gate G2 (promote Step 5 to `:prod` before B12) still applies.
- **Recursion risk:** if a builder "simplifies" `getCirclesAccess` to use `assertMember`, every
  feed load recurses forever. The rule is stated in Step 4 and in "Import-cycle constraint".
- **TOCTOU:** with no RLS, the H3 checks are app-level only. Two concurrent admin requests could
  still race, but each one is scoped to the caller's own baby. The DB-level guarantee comes with
  `rls.md` B5/B11.
- **Realtime:** `circles_access` and `baby_access` events still carry full rows until
  `security-hardening.md` Step 10 strips them (review item 6).

## How to verify
- Every step: `pnpm typecheck && pnpm lint` pass with no new warnings.
- Run each step's negative case on dev after deploying `:latest`, using the `rls.md` test babies
  T/U and the `+rls` accounts.
- **User without access (end-to-end, after Step 9):** signed in as outsider (member of U only):
  1. `/baby/<T>`, `/baby/<T>/admin` and `/baby/<T>/feed` all end in a 404 or a redirect, and
     none of them render T's baby name, member names or circle names.
  2. `/api/bug-reports/..%2F..%2Fbucket` returns 400.
  3. Replayed `getUsers`, `getCircles`, `getCirclesAccess`, `getAllCirclesAccess`, `getBaby`
     and `getPageSettings` for T all return `[]` or unauthorized (or are recorded as "not
     exposed as an action").
  4. Replayed `updateEvent`, `updateAnecdote` and `addUserToCircle` aimed at T's ids from U's
     admin all return unauthorized, and the DB is unchanged.
  5. A report filed by the dual member from U's pages is invisible to admin T, and its
     screenshot URL returns 404.
- **Regression pass as admin T and viewer T:** feed, stories, albums, anecdotes, calendar,
  guess leaderboard, admin page, bug report submit. As the system admin: bug report view,
  screenshot and mark fixed.
