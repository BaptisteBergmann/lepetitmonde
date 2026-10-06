# Journal (feed) review fixes

Status: implemented

## Status: implemented
Shipped 2026-10-06 (steps 0–14, reviewer approved round 1). Migration `20261006205655_poll_votes_option_matches_poll` applied (pre-check: 0 mismatched votes); types regenerated.
Deviations: notifications wait until every upload succeeds (user decision, not "after first pass"); new `serverErrors.textRequired` key; `uploadsFailed` toast reworded; upload hook dedupes retries and turns network errors into per-file errors; "Finish publishing" skips already-uploaded files; viewer closes when its group disappears; `maxLength` on feed inputs.
Follow-ups (reviewer, low): make `createPoll`/`createPost` atomic or retry-safe; wrap the email step in `publishPost` so a failure can't resend the push; disable the Dropzone while pending; make the 0-vote poll row fully tappable; tapping a reaction pill adds that reaction (user decision). Separate security fix needed: `storage.ts`, `albums.ts` (`linkPostPhotos`, `copyStoryPhotoToLibrary`) and `notify.ts` expose unauthenticated service-role actions.
Approved by: Baptiste (2026-10-06)

## Goal
Fix the issues a code review of current `main` found on the Journal page (`/baby/[babyId]/feed`): missing access checks and cross-baby IDOR in feed Server Actions, a crash when opening highlights, invalid nested buttons in polls, poll vote stuffing, missing server-side input validation, a publish flow that notifies too early and breaks on poll failure, modals that can be closed during uploads, and three story viewer bugs. This affects every family member who uses the feed. Admins are the only ones who create content.

## User decisions (recorded)
- New posts and stories keep **"no circle" (admin-only)** as the default visibility. Do not change it.
- The edit post modal **intentionally cannot add or remove photos**. Do not add that.
- Tapping a reaction pill **should** add that same reaction. This is a **follow-up and out of scope here**.
- **access.ts first (open question 1):** fix `src/utils/actions/access.ts` before this plan's steps, as its own step 0 / commit: drop `'use server'` so `getEmailsForUserIds`, `getVisibleUserIds`, `getAllBabyMemberIds` and `getBabyAdminIds` are no longer callable endpoints. Every importer must be server-side. Add `import 'server-only'` only if the project already uses that pattern (it does not; the package is not installed).
- **Partial upload failure (open question 2): wait.** `publishPost` (push + email) runs only once every file has uploaded and the poll is attached. If some uploads fail, the post stays un-notified and the modal offers retry; publishing happens after the retry succeeds. This replaces the plan's original "publish after the first pass" proposal. The `uploadsFailedNotice` copy must not say the post was published/announced.
- **Text limits (open question 3): approved as proposed.** Comment and post caption 2000, story caption 500, poll question 200, poll option 100, group label and highlight name 50.
- **`feed.poll.voteError` toast: keep it.**

## Out of scope
- The full RLS backstop in `.claude/plans/rls.md`. No feed table has RLS today, so the Server Action checks in this plan are the only protection. This plan makes those checks correct but does not replace RLS.
- Reaction pill tap-to-add (follow-up, see above).
- Adding photos in the edit post modal (intentionally not supported).
- Adding a "draft/unpublished" state to posts. The post row still exists for a short time before its photos are attached (see Risks).
- ~~The `access.ts` exposure problem described in Risks~~: now done as step 0 (see decisions).

## Current state
Each item below was checked against current `main`. Line numbers match the files as they are now.

**Access helpers**
- `src/utils/supabase/auth.ts` has `getAuthUser()`, which is cached per request and per token.
- `src/utils/actions/users.ts:37` has `getUserAccess(babyId)`. It returns the `baby_access` row, or `[]` when the user is not a member.
- `src/utils/actions/circles.ts:102` has `getUserCircleIds`.
- `src/utils/actions/access.ts:7` has `assertIsAdmin`.
- None of these helpers check that a child id (post, story, comment, poll, option or highlight) belongs to `babyId`, or that the caller can see it.
- Visibility rule, copied from `withVisibility`/`getPosts` in `posts.ts:192-286`: the item must have `baby_id = babyId`, and the caller must be an admin or share at least one circle with the item. An item with no circle is visible to admins only.
- Comments have one more rule (`comments.ts:123-124`): the comment is visible to admins, to its author, or to anyone whose circles overlap `comment.circle_ids`.

**Item 1: unguarded reads**
- `views.ts:34` `getPostViews` has no auth, admin or ownership check. The batched version at `:62` is admin-gated.
- `post_stats.ts:16` `getPostStats` has no checks. It fans out to `getReactions`, `getPostViews`, `getPollWithResults` and a comment count, none of which are checked.
- `users.ts:90` `getNicknamesByBaby` is exported from a `'use server'` file, so it is a public endpoint. It has no auth check and caches by `babyId` alone.

**Item 2: IDOR (access is checked on `babyId` only, never on the child id)**
- `comments.ts`:
  - `addComment` (16-30) inserts on any `postId`.
  - `updateComment` (55-76) is limited to the author, so the cross-baby risk is low, but it still does not validate the post.
  - **`deleteComment` (78-99): an admin of baby A skips the `user_id` filter, so they can delete any comment in any baby** by passing B's `postId`/`commentId`.
  - `getComments` (101-133) reads comments of any post.
- `reactions.ts`:
  - `addReaction` (14-51) works on any `postId`.
  - `getReactions` (81) has **no check at all**.
  - `getReactionsForPosts` (116) has no check.
- `polls.ts`:
  - `createPoll` (21) attaches a poll to any `postId`.
  - **`updatePoll` (50-88) counts votes and then deletes `poll_options` by `pollId` alone. The `polls` update is scoped to `post_id`, but the options delete runs even when that update matched 0 rows**, so an admin of A can wipe the options of B's poll.
  - `deletePoll` (90) is scoped to `pollId` and `postId` but not to the baby.
  - `votePoll` (109-128) is item 5.
  - `getPollWithResults` (138) has no check.
  - `getPollsForPosts` (176) has no check.
- `views.ts:15` `markPostViewed` works on any `postId`.
- `comment_reactions.ts:15` `addCommentReaction` works on any `commentId`. `getCommentReactionsForComments` (80) has no check.
- `story_reactions.ts:15` `addStoryReaction` works on any `storyId`. `getStoryReactionsForStories` (80) has no check.
- `stories.ts`:
  - `updateStory` (120-181) runs its `stories` update scoped to the baby, then **deletes and reinserts `stories_circles` by `storyId` only**, even when the update matched nothing.
  - `markStoryViewed` (314) works on any story.
  - `getStoryViews` (334) checks admin but does not check that the story belongs to `babyId`.
  - `createStory` does not validate its `circleIds`.
- `posts.ts`:
  - `updatePost` (93-154) has the same problem as `updateStory`, with `posts_circles` at 125-138.
  - `attachPostPhotos` (156) does not validate `postId`.
  - `deletePost` (355) reads the photo paths and removes storage objects *before* its baby-scoped delete. The storage damage is limited because the bucket is scoped to `babyId`, but the check should still come first.
  - `createPost` and `updatePost` do not validate `circleIds`.
- `story_highlights.ts`:
  - `createHighlight` (97) accepts a story from another baby, and `clearStoryExpiry` (88) is by id only, so this can make another baby's story never expire.
  - `addStoryToHighlight` (127) does not validate the highlight or the story.
  - `removeStoryFromHighlight` (160) does not validate the highlight.
  - `getHighlights` does not filter `story.baby_id`.
- Batch loaders that are exported as public endpoints only because they live in `'use server'` files:
  - `getCommentsForPosts`
  - `getReactionsForPosts`
  - `getPollsForPosts`
  - `getPostViewsForPosts`
  - `getCommentReactionsForComments`
  - `getStoryReactionsForStories`

  They are only called server-side today, from `posts.ts`, `comments.ts` and `stories.ts`.

**Item 3: highlight crash**
- `story_highlights.ts:62-67` pushes `StoryWithUrl` objects without `reactions` or `viewed`.
- `story_viewer.tsx:443-448` renders `StoryReactionPicker` with `story.reactions`, and `story_reaction_picker.tsx:56` reads `initialReactions.myEmoji`, which crashes.
- `pnpm typecheck` passes today, so `storyRow` (line 55) is being inferred loosely enough that tsc misses the missing fields.

**Item 4: nested buttons**
- In `poll_voter.tsx:47`, each option is a `<button>`, and `PollVoteCount` (`:82`) renders a `PopoverTrigger` button inside it. That is invalid HTML and causes double activation and accessibility problems.

**Item 5: vote stuffing**
- `votePoll` upserts `(poll_id, option_id)` without checking that the option belongs to the poll.
- `supabase/migrations/20260723190838_create_polls.sql:46` has separate foreign keys on `option_id` and `poll_id`, so the database allows mismatched pairs. A user can vote on poll X with an option from poll Y and inflate Y's count. The unique key is `(poll_id, user_id)`, so one user can stuff one vote into every other poll's options.

**Item 6: no server-side validation**
- `addReaction`, `addCommentReaction` and `addStoryReaction` accept any `emoji` string. It is stored, and it is put into the push body (`newReaction.body` and similar).
- `addComment` and `updateComment` do not trim the body, reject empty bodies or cap the length. The body goes into the push body at `comments.ts:50`.
- These have no length caps:
  - post caption (`createPost`/`updatePost`)
  - story caption and group label (`createStory`/`updateStory`)
  - poll question and option labels (`assertValidOptions` only trims and counts)
  - highlight name (`createHighlight`/`renameHighlight`)

**Item 7: publish ordering**
- `create_post_modal.tsx:77-84` calls `createPost`, which inserts the post and then **sends the push and optional email right away** (`posts.ts:60-86`), before any photo is uploaded.
- Then `createPoll` runs. If it throws, `setPostCreated(true)` never runs, so a retry calls `createPost` again with the same `postId`, gets a primary key conflict, and shows "publish error" forever. Meanwhile the post exists and its recipients have already been notified.

**Item 8: modal dismissal during uploads**
- `src/components/modal.tsx:32` always closes on Escape, backdrop click and the X button.
- Cancel is enabled while `isPending` in `create_post_modal.tsx:293-298` and `create_story_modal.tsx:221-227`. Closing unmounts the form while `upload.onUpload()` keeps going, and the user gets no feedback.
- `use-supabase-upload.ts:149-213` uploads files in parallel with `Promise.all` and reports no progress.

**Item 9: story viewer**
- (a) `stories.ts:307` sorts groups by `allViewed`. `story_tray.tsx:16-18` targets groups by **index**, and `StoryViewer` reads `groups[target.index]` (`story_viewer.tsx:62-68`). After `onChanged` refetches (for example after a reaction), viewed state changes the order and the viewer jumps to a different group. Also, the reset effect (`:157-171`) depends on the `story` object, so every refetch creates a new object and resets the views, picker and editing state and calls `markStoryViewed` again.
- (b) `paused` (`:93`) does not include `highlightPickerOpen`, so the 5-second photo timer advances while the admin is typing a highlight name, and the reset effect then closes the picker. The keydown handler (`:139-145`) also runs while the focus is in the highlight input, so arrow keys navigate and Escape closes the viewer.
- (c) The Prev and Next buttons (`:421-435`) are inside the tap zone, which handles `onPointerUp`. Their `onClick` calls `stopPropagation`, but `pointerup` has already bubbled to the zone, so a mouse click advances twice. On Prev the click lands in the left zone, on Next in the right zone.

## Approach
1. **Shared feed access helpers.** Add `src/utils/feed-access.ts` with **no `'use server'` directive**, so the helpers cannot be called as endpoints. They are built only on `getAuthUser`, `getUserAccess` and `getUserCircleIds`, and they copy the existing `withVisibility` rule. Each `find*` helper returns `null`, and each `assert*` wrapper throws `actionError('unauthorized')`. A missing item and a hidden item give the same error, so callers can't probe whether an id exists. Read actions that return empty data today keep doing that by using the `find*` form. Every listed action calls the matching helper first.
2. **Batch loaders out of `'use server'` files.** Move the six batch loaders into a non-action module, so only already-verified ids reach them. This avoids adding one visibility query per loader per feed page, which matters given the recent concurrency work in `feed-concurrency-overload.md`.
3. **Polls.**
   - Check that the option belongs to the poll in `votePoll`.
   - Add a composite foreign key so the database also rejects mismatched votes.
4. **Validation.** Add one shared module with length limits and an emoji whitelist, and apply it in the actions.
5. **Publishing.**
   - Split notifications out of `createPost` into a new `publishPost` action.
   - The modal tracks three steps separately: created, poll created, published.
   - It calls `publishPost` last, once photos and the poll are attached.
6. **Modal and progress.**
   - Add a `dismissible` prop to `Modal`.
   - Disable Cancel while pending.
   - Have the upload hook report a completed count so the modal can show "Uploading 2 of 5…".
7. **Small UI fixes**: the highlight data, the poll row markup, and the viewer's targeting, pausing and pointer handling.

Alternative considered for item 7: add a `posts.notified_at` column so `publishPost` is idempotent on the server. Rejected as unnecessary for now. Only admins can call it, admins can already create posts that notify everyone, and the modal's `published` state plus `isPending` prevents double sends.

## Data and migrations
- **One migration (item 5)**: `supabase/migrations/<timestamp>_poll_votes_option_matches_poll.sql`. Create it with `mise run db_migration_new poll_votes_option_matches_poll`.
  ```sql
  -- Expected to affect 0 rows; run the SELECT first (see Risks).
  DELETE FROM public.poll_votes v USING public.poll_options o
    WHERE v.option_id = o.id AND o.poll_id <> v.poll_id;
  ALTER TABLE ONLY public.poll_options
    ADD CONSTRAINT poll_options_id_poll_id_key UNIQUE (id, poll_id);
  ALTER TABLE ONLY public.poll_votes DROP CONSTRAINT poll_votes_option_id_fkey;
  ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_option_id_poll_id_fkey
    FOREIGN KEY (option_id, poll_id) REFERENCES public.poll_options(id, poll_id) ON DELETE CASCADE;
  ```
  - `updatePoll` deletes and reinserts options, but only when there are no votes, so it is not affected.
  - `ON DELETE CASCADE` keeps the current behavior.
- Regenerate `src/utils/supabase/database.types.ts` with `mise run update_types` after `mise run db_push`. Only the `Relationships` metadata changes.
- No new tables, columns or storage buckets. RLS: none (see `rls.md`).

## Access and security
New helpers in `src/utils/feed-access.ts` (no `'use server'`):

| Helper | Rule |
|---|---|
| `getFeedViewer(babyId)` | Returns `{ userId, isAdmin, circleIds: Set<string> }`, or `null` if the caller is not logged in or not a member. Uses `getAuthUser` + `getUserAccess` + `getUserCircleIds`. |
| `assertMember(babyId)` / `assertAdmin(babyId)` | Throw `unauthorized`. `assertAdmin` replaces nothing. `assertIsAdmin` stays, because it is used outside the feed. |
| `findVisiblePost(postId, babyId)` / `assertPostVisible` | One query: `posts.select('id, created_by, posts_circles(circle_id)').eq('id').eq('baby_id').maybeSingle()`. The post is visible if the caller is an admin or a circle overlaps. Returns `{ viewer, post: { id, created_by, circleIds } }`. |
| `findVisibleStory` / `assertStoryVisible` | Same rule on `stories` + `stories_circles`. Returns `created_by` too. |
| `assertCommentVisible(commentId, babyId)` | Loads `post_comments` with `post_id, user_id, circle_ids, posts!inner(baby_id, posts_circles(circle_id))`. Requires the parent post to be visible **and** the comment to be visible (admin, author, or `circle_ids` overlap, as in `comments.ts:124`). |
| `assertPollVisible(pollId, babyId)` | `polls` → `posts!inner(...)`, with the parent post visible. Returns `{ poll: { id, post_id } }`. |
| `assertOptionInPoll(optionId, pollId)` | `poll_options` `.eq('id').eq('poll_id')`. |
| `assertHighlightInBaby(highlightId, babyId)` | `story_highlights` `.eq('id').eq('baby_id')`. |
| `assertCirclesInBaby(circleIds, babyId)` | `circles` `.in('id').eq('baby_id')`. The count must equal the number of unique ids. |

Where each check is applied:
- **Member + post visible:** `addComment`, `getComments`, `addReaction`, `getReactions`, `markPostViewed`, `getPollWithResults`. The read actions return empty or `null` instead of throwing.
- **Member + comment visible:** `addCommentReaction`, `updateComment` (author filter kept), and `deleteComment`. For `deleteComment`, admins of *that* baby can still delete any comment on a visible post, and other users only their own.
- **Member + story visible:** `addStoryReaction`, `markStoryViewed`.
- **Member + poll visible + option in poll:** `votePoll`.
- **Admin + post in baby:** `getPostViews`, `getPostStats` (checked once up front, then the inner calls), `updatePost`, `attachPostPhotos`, `deletePost` (before the storage removal), `createPoll`, `publishPost`. For an admin, "visible" is the same as `baby_id` matching.
- **Admin + poll in baby, with `poll.post_id === postId`:** `updatePoll` (before the vote count and the options delete), `deletePoll`.
- **Admin + story in baby:** `updateStory`, `getStoryViews`, `createHighlight` (before the insert and `clearStoryExpiry`).
- **Admin + highlight in baby + story in baby:** `addStoryToHighlight`, `removeStoryFromHighlight`. `clearStoryExpiry` also gets `.eq('baby_id', babyId)`.
- **Admin + `assertCirclesInBaby`:** `createPost`, `updatePost`, `createStory`, `updateStory`.
- **`getHighlights`**: also skip any `storyRow` whose `baby_id !== babyId`, as defense in depth.
- **`getNicknamesByBaby`**: return `{}` unless `getUserAccess(babyId)` is a membership row. This check runs **before** the TTL cache lookup, so the cache can't serve another baby's data. Its callers (`inventory.ts`, `bug_reports.ts`, and the feed) already run as members, so their behavior is unchanged.
- **Batch loaders**: move them to `src/utils/feed-loaders.ts` (no `'use server'`). Their only callers, `attachInteractionData` in `posts.ts`, `getComments` and `getActiveStories`, already pass ids filtered by visibility. Document that contract in a comment at the top of the file. `getPostViewsForPosts` keeps its admin check.
- `removeReaction`, `removeCommentReaction` and `removeStoryReaction` only delete the caller's own row. Their member check is kept, and no ownership helper is needed.
- No service-role use is added. No new public endpoints. Push recipients still come from `getVisibleUserIds`, using the **circles stored in the database** rather than client input (`publishPost` reads them from `posts_circles`).

## Steps
Do the steps in order and make one Conventional Commit per step, each followed by its `CHANGELOG.md` commit. Run `pnpm typecheck && pnpm lint` before each commit.

0. **`fix(security): stop exposing access helpers as server actions`** (open question 1, decided)
   - Files: `src/utils/actions/access.ts`
   - Remove `'use server'`. All importers are `'use server'` action files or route handlers.

1. **`fix(feed): attach reactions and viewed to highlight stories`** (item 3)
   - Files: `src/utils/actions/story_highlights.ts`
   - In `getHighlights`, annotate `storyRow` explicitly as `(Tables<'stories'> & { stories_circles: { circle_id: string }[] }) | null` so tsc catches missing fields.
   - Collect the visible story ids across all highlights, then call `getStoryReactionsForStories(ids, babyId)` once. Getting `viewed` needs a `getViewedStoryIds` equivalent. Either export a small helper from a non-action module, or inline the query (`story_views` `.eq('user_id').in('story_id')`). Because `StoryWithUrl` requires `viewed`, set it from the query result.
   - The `getStoryReactionsForStories` import stays where it is until step 4 moves it.
   - Also skip rows where `storyRow.baby_id !== babyId`.
2. **`fix(feed): split poll option row into vote button and voters trigger`** (item 4)
   - Files: `src/app/baby/[babyId]/feed/_components/poll_voter.tsx`
   - Each option becomes a row container, for example a `div`, with two **sibling** elements: the vote `<button>` (label + percent bar), and the `PollVoteCount` Popover trigger, or the plain "0" span.
   - Remove the `stopPropagation` workaround.
   - Layout follows `## Design`.
3. **`feat(feed): add feed access helpers`** (item 2, groundwork)
   - Files: new `src/utils/feed-access.ts`
   - Implement the helpers listed above. Each one creates a Pino child logger: `logger.child({ function: '<name>', babyId, ... })`.
   - Use `Tables<>` types.
   - Nothing calls the helpers yet, so the app is unchanged.
4. **`refactor(feed): move batch interaction loaders out of server-action files`** (item 2)
   - Files: new `src/utils/feed-loaders.ts`; `comments.ts`, `reactions.ts`, `polls.ts`, `views.ts`, `comment_reactions.ts`, `story_reactions.ts`, `posts.ts`, `stories.ts`, `story_highlights.ts`
   - Move the six `*For*` loaders without changing their logic. Keep the `ReactionsData`/`PollWithResults`/`PostViewsData` types where they are now, or re-export them, so client type imports keep working.
   - Update the imports.
5. **`fix(feed): require admin and post ownership for post views and stats`** (item 1)
   - Files: `views.ts`, `post_stats.ts`, `users.ts`
   - `getPostViews` and `getPostStats` call `getAuthUser()` and `assertAdmin`/`findVisiblePost`, and return empty data if either fails.
   - `getNicknamesByBaby` gets the membership check described above.
6. **`fix(feed): verify post/comment ownership in comment and reaction actions`** (item 2)
   - Files: `comments.ts`, `reactions.ts`, `comment_reactions.ts`, `views.ts`
   - Apply the helpers to `addComment`, `updateComment`, `deleteComment`, `getComments`, `addReaction`, `getReactions`, `addCommentReaction` and `markPostViewed`.
   - In `addReaction`/`addCommentReaction`, reuse the `created_by`/`user_id` the helper returns for the notification, instead of querying it again.
7. **`fix(feed): verify poll ownership and option membership`** (items 2 + 5, action side)
   - Files: `polls.ts`
   - `createPoll`, `updatePoll` (check before the vote count and the delete), `deletePoll`, `getPollWithResults`, and `votePoll` (`assertPollVisible` + `assertOptionInPoll`).
8. **`fix(db): enforce poll vote option belongs to poll`** (item 5, database side)
   - Files: the new migration; `src/utils/supabase/database.types.ts` (regenerated)
   - Run the pre-check from Risks first. Apply the migration only after the reviewer's green flag, as CLAUDE.md requires.
9. **`fix(feed): verify ownership in post, story and highlight mutations`** (item 2)
   - Files: `posts.ts`, `stories.ts`, `story_highlights.ts`
   - `updatePost`, `attachPostPhotos`, `deletePost` (check before touching storage), `updateStory`, `markStoryViewed`, `getStoryViews`, `addStoryReaction` (in `story_reactions.ts`), `createHighlight`, `addStoryToHighlight`, `removeStoryFromHighlight`, and `clearStoryExpiry` scoping.
   - `assertCirclesInBaby` in `createPost`, `updatePost`, `createStory` and `updateStory`.
   - After this step, grep `src/utils/actions/` for `(postId|storyId|commentId|pollId|optionId|highlightId)` parameters and confirm that each action calls a helper.
10. **`fix(feed): validate reactions, comments and text lengths server-side`** (item 6)
    - Files: new `src/utils/feed-validation.ts` (no `'use server'`); the reaction, comment, post, story, poll and highlight actions; `messages/en.json`, `messages/fr.json`
    - The module exports:
      - `FEED_LIMITS = { comment: 2000, postCaption: 2000, storyCaption: 500, groupLabel: 50, pollQuestion: 200, pollOption: 100, highlightName: 50 }`
      - `assertReactionEmoji(emoji)`, a whitelist against `REACTIONS`
      - `normalizeText(value, max, { required })`, which trims, rejects empty text when `required`, and throws `textTooLong` when over `max`. It returns `null` for empty optional text.
    - Apply the comment limit in `addComment`/`updateComment` (with `required`), the captions and labels in the post and story actions, and the poll limits inside `assertValidOptions` and on the question.
    - Use `normalizeText` with `required` in `createHighlight` and `renameHighlight`.
    - In `addComment`, truncate the body used in the push body to about 140 characters with `…`.
    - Optional, no visual change: add matching `maxLength` attributes on the related inputs.
11. **`fix(feed): publish post notifications after photos and poll are attached`** (item 7)
    - Files: `posts.ts`, `create_post_modal.tsx`
    - `createPost` no longer notifies or emails, and drops its `sendEmail` parameter.
    - New `publishPost(postId, babyId, sendEmail)`:
      - checks `assertAdmin` + `assertPostVisible`
      - reads the circle ids from `posts_circles` and the caption from `posts`
      - runs the current notify and email code unchanged
    - Modal: keep separate `postCreated`, `pollCreated` and `published` state. In `handleConfirm`:
      1. If `!postCreated`, call `createPost`, then `setPostCreated(true)` right away.
      2. If the poll is enabled and `!pollCreated`, call `createPoll`, then `setPollCreated(true)`. On failure, show a toast and return; the retry resumes here.
      3. Upload and attach the photos (current logic).
      4. If every upload succeeded and `!published`, call `publishPost`, then `setPublished(true)`. If some uploads failed, do **not** publish: the post stays un-notified and the modal offers "Retry failed uploads"; `publishPost` runs once the retry succeeds (decision on open question 2).
    - The "uploads failed" flow keeps its retry button; it no longer implies the post was published.
12. **`feat(ui): non-dismissible modal and upload progress while publishing`** (item 8)
    - Files: `src/components/modal.tsx`, `src/utils/actions/use-supabase-upload.ts`, `create_post_modal.tsx`, `create_story_modal.tsx`, `messages/en.json`, `messages/fr.json`
    - `Modal` gets `dismissible?: boolean` (default `true`). When it is `false`, `onOpenChange(false)` is ignored, so Escape, the backdrop and the X button do nothing, and the X button is disabled.
    - The upload hook exposes `uploadProgress: { done: number; total: number } | null`. It is set at the start of `onUpload` and incremented as each `Promise.all` member settles.
    - Both modals pass `dismissible={!isPending}` and disable Cancel while `isPending`.
    - The confirm button and the progress line show `feed.postForm.uploadProgress` while files upload, then `publishing`. Placement and display follow `## Design`.
13. **`fix(feed): story viewer targets groups by key and pauses during highlight picker`** (item 9a + 9b)
    - Files: `story_tray.tsx`, `story_viewer.tsx`
    - `ViewerTarget` becomes `{ kind: 'group'; key: string; storyId?: string } | { kind: 'highlight'; id: string }`.
    - The tray sets `key: group.key` / `id: highlight.id`.
    - The viewer resolves the group with `groups.find(g => g.key === target.key)` and the highlight with `highlights.find(h => h.id === target.id)`, and closes if the group is gone.
    - The deep-link initializer in `story_tray.tsx:101-104` uses `key`.
    - The reset effect depends on `story?.id` (plus `babyId`, `isAdmin`, `isHighlight`), not on `story`.
    - Add `highlightPickerOpen` to `paused`.
    - The keydown handler returns early when `e.target` is an `HTMLInputElement`, an `HTMLTextAreaElement` or `isContentEditable`.
    - This makes the "close after edit because the group may move" workaround (`:338-344`) unnecessary, but keep it to keep the change small.
14. **`fix(feed): stop story nav buttons from triggering tap zones`** (item 9c)
    - Files: `story_viewer.tsx`
    - Add `onPointerDown`/`onPointerUp` handlers that call `e.stopPropagation()` on the Prev and Next buttons, and keep the `onClick` handler.

After everything is verified: mark this plan `## Status: implemented` and move it to `.claude/plans/done/`.

## Translations
- `serverErrors.textTooLong`: en "This text is too long." / fr "Ce texte est trop long."
- `serverErrors.commentRequired`: en "The comment can't be empty." / fr "Le commentaire ne peut pas être vide."
- `serverErrors.invalidReaction`: en "Unknown reaction." / fr "Réaction inconnue."
- `feed.postForm.uploadProgress`: en "Uploading {current} of {total}…" / fr "Envoi {current} sur {total}…". `current = min(done + 1, total)`; the designer may reword it.
- Optional: `feed.postForm.pollCreateError`, used when the poll fails after the post was created. en "The post was created but the poll couldn't be added. Retry to add it." / fr "Le post est créé mais le sondage n'a pas pu être ajouté. Réessayez pour l'ajouter."
- Story modal: reuse the `feed.postForm` key through its existing `tShared`.

## Design
Scope: item 4 (poll option row), item 8 (locked modal + progress) and the item 7 follow-on (what the post modal looks like once the post exists). Everything else in this plan has no visual change. No new components, no new tokens, no new z-index values. The app has dark mode (`settings/_components/theme_card.tsx`). Everything below uses the existing `landing-*`, `primary`, `muted-foreground` and `destructive` tokens, which already switch with the theme. The Copy table below supersedes the wording in `## Translations` where they overlap (`uploadProgress`, `pollCreateError`).

### User flow
**Poll (any member)**
1. Sees a poll in a post → each option is one rounded row: the option text on the left, "40% · 2 ▾" on the right behind a thin divider, and a soft bar behind the whole row showing the share.
2. Taps the option text area → votes (or changes vote). The row gets a primary border, a check icon before the label, and a primary-tinted bar.
3. Taps the "40% · 2 ▾" area → a popover lists who voted for that option. No vote is cast.
4. An option with 0 votes shows a plain "0%" with no divider or chevron. Tapping anywhere on that row votes.

**Create post (admin)**
1. Fills the form and taps Publish → the modal locks: fields, Cancel and the X are disabled, and Escape and backdrop clicks do nothing. The button reads "Publishing…" with a spinner.
2. Photos upload → the button reads "Uploading 2 of 5…" and a thin progress bar fills along the top edge of the footer. Each file in the Dropzone list already shows "Uploading…" / "Uploaded" on its own.
3. All good → "Publishing…" briefly, then the modal closes and the feed refreshes (as today).
4. Some uploads failed → the modal unlocks. An inline notice at the top of the body says those files weren't uploaded and the post isn't shared yet (nobody is notified until every file is uploaded). Text fields stay read-only. Failed files show their error in the Dropzone. The footer shows "Close" and "Retry failed uploads".
5. Poll failed (post exists, not yet published) → the modal unlocks. An inline notice explains. The poll section stays editable, including "Remove poll". Other fields are read-only. The button reads "Finish publishing".

**Create story (admin)**: same lock. With a single file, the button reads "Uploading…" (no counter), then "Publishing…". The story row is only created after the upload succeeds, so a failure leaves nothing on the server: the modal unlocks with the existing `storyForm.publishError` toast and every field is editable again. No read-only state is needed for stories.

### Screens

#### Poll option row (`poll_voter.tsx`)
Wireframe (mobile, 375px, inside the post card):
```
 ▥ Who ate the most apples?
┌──────────────────────────────────┬──────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░│░░░░░░░░░░│  ← bar behind the whole row (60%)
│ ✓ Grandma Mireille               │ 60% · 3 ▾│  ← my vote: check + primary border
└──────────────────────────────────┴──────────┘
┌──────────────────────────────────┬──────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░│░░░░░░░░░░│
│ Uncle Paul, who said he'd only   │ 40% · 2 ▾│  ← long label wraps, never truncates
│ have one                         │          │
└──────────────────────────────────┴──────────┘
┌─────────────────────────────────────────────┐
│ Baby himself                             0% │  ← 0 votes: plain text, whole row votes
└─────────────────────────────────────────────┘
```
- Layout:
  - Row container `div`: `relative flex items-stretch min-h-11 rounded-xl border overflow-hidden`, with `border-primary` when it's my vote, else `border-landing-border`. The list keeps `space-y-1.5`.
  - The percent bar is a decorative `div aria-hidden`, placed as the **first child of the row container**: `absolute inset-y-0 left-0 pointer-events-none transition-[width] duration-300 motion-reduce:transition-none`, with `bg-primary/15` if mine, else `bg-landing-background`. It sits on the row rather than inside the vote button so that 100% means the full row width and the bar still reads as the option's background behind both halves. The two siblings after it get `relative`, which paints them above the bar by DOM order, so no `z-index` is needed (`docs/z-index.md`).
  - Vote `<button>`: `relative flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left cursor-pointer disabled:opacity-50 disabled:cursor-wait`. Label `text-sm break-words`, with no truncation because French labels are longer. When mine: lucide `Check` `h-4 w-4 shrink-0 text-primary` before the label, and the label is `font-medium`. When not mine, no icon.
  - Voters trigger (`PopoverTrigger`, only when count > 0): `relative shrink-0 min-w-11 flex items-center justify-end gap-1 px-3 border-l border-landing-border/70 text-xs tabular-nums whitespace-nowrap text-landing-muted hover:text-landing-foreground hover:bg-landing-background/60 cursor-pointer`. Content: `voteCount` + lucide `ChevronDown` `h-3 w-3`. The chevron and divider signal "opens something", separate from voting. It fills the row height, so it is at least 44×44px.
  - Count = 0: a plain `span` with the same padding and min width, but no border, no chevron, and `aria-hidden` (the result is already in the vote button's sr-only text). It shows `zeroPercent`.
  - Both interactive elements: `focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50`. The ring is inset because the row clips with `overflow-hidden`.
  - Larger screens: unchanged (the post card width caps it).
- Components: `Popover`/`PopoverTrigger`/`PopoverContent` from `src/components/ui/popover.tsx` (already `z-[70]`). Popover content: `align="end" className="w-auto max-w-[min(18rem,calc(100vw-2rem))] p-2"`. Names stay `text-xs text-landing-foreground` but wrap normally: drop `whitespace-nowrap`, which overflows at 375px when several relatives voted. Remove both `stopPropagation` calls.
- Typography and color: DM Sans (the default UI font) throughout. The question keeps `text-sm font-semibold` and its `BarChart3` icon. No Fraunces here. The selected label drops `text-primary` (the border and check carry the state), which improves contrast on the tinted bar.
- Interactions: tapping the vote button calls `vote(option.id)` as today. While `pending`, every vote button is disabled; the voter triggers stay usable. Tapping the trigger only opens the popover. Keyboard: in each row, Tab goes to the vote button, then the trigger. Enter/Space does each one's own action. Escape closes the popover and returns focus to the trigger (Base UI default).

#### Modal shell (`src/components/modal.tsx`)
- With `dismissible={false}`, the X stays visible in place (no layout shift) but is `disabled`, with `disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-landing-muted`. It keeps its `aria-label`. Escape and backdrop clicks are ignored silently (no shake, no toast).

#### Create post modal: footer and fields while pending
Wireframe (mobile):
```
┌─ ⊕ New post ─────────────────────── (x) ┐   ← X dimmed, disabled
│  PHOTOS / VIDEOS                         │
│  [img] IMG_201.jpg   Uploaded            │   ← existing Dropzone per-file status
│  [img] IMG_202.jpg   Uploading…          │
│  …                                       │
│  CAPTION (OPTIONAL)        (dimmed)      │
│  …                                       │
├━━━━━━━━━━━━━━━━━━━━━━────────────────────┤   ← 4px progress bar on the footer's top edge (2/5)
│        [ Cancel ]  [◌ Uploading 2 of 5… ]│   ← Cancel dimmed, disabled
└──────────────────────────────────────────┘
```
- Footer layout: keep `flex justify-end gap-2 px-5 py-3.5 border-t bg-landing-background`, and add `relative flex-wrap` (with the longer French label, Cancel wraps to its own line instead of overflowing).
- Progress bar: a `div aria-hidden` at `absolute inset-x-0 top-0 h-1 bg-landing-border`, with an inner `h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none` at `done / total * 100%`. Render it only while `uploadProgress` is non-null and `total > 1`, so in practice only in the post modal.
- Confirm button label while `isPending`, first match wins:
  1. uploading and `total > 1` → `uploadProgress`
  2. uploading and `total === 1` → `uploadingOne`
  3. otherwise → `publishing`
  
  Keep the `Loader2` spinner, adding `motion-reduce:animate-none`. The button sizes to its content.
- Cancel/Close: `disabled={isPending}`, using the existing `Button` disabled styling.
- Fields: wrap every field block **below the Dropzone** in a `<fieldset disabled={…} className="min-w-0 space-y-4 disabled:opacity-60">`. Native fieldset `disabled` disables every input, the checkbox and the Select trigger button. Also pass `disabled` to the Base UI `Select` so its own state matches. The Dropzone stays outside the fieldset: it already hides the per-file remove buttons while `loading`. If it accepts a `disabled` prop, pass `isPending`; otherwise leave it (see Questions).
- Story modal: same footer and fieldset, no progress bar. The label goes `uploadingOne` → `publishing`.

#### Create post modal: after the post exists (item 7 decision)
**Decision: yes, make fields read-only once they have been sent**, because edits would be silently ignored on retry.
- Once `postCreated`: caption, date, "Visible to" and "Send an email" are disabled (same fieldset, `disabled:opacity-60`). Split the post modal into two fieldsets: one for these four (`disabled={isPending || postCreated}`), one for the poll section (`disabled={isPending || pollCreated}`).
- The poll section stays editable until `pollCreated`, so a poll failure can be fixed, retried, or skipped with "Remove poll".
- The Dropzone stays usable (retry failed files, or remove a failing one). It is the only thing a retry acts on.
- Inline notice as the first child of the `p-5 space-y-4` body, `role="status"`: `flex gap-2 rounded-2xl border border-landing-border bg-landing-background p-3 text-sm text-landing-foreground`, with lucide `Info` `h-4 w-4 shrink-0 mt-0.5 text-primary` (warm, not alarming). Show one notice at a time, first match wins:
  1. poll failed (`postCreated && pollEnabled && !pollCreated`) → `pollCreateError`
  2. some uploads failed (`postCreated && !published && failedCount > 0`) → `uploadsFailedNotice`. The existing toast stays too; the notice persists after the toast disappears.
  3. any other state where `postCreated` and the modal is still open → `lockedNotice`
- Footer labels: the secondary button keeps the existing `close`/`cancel` switch on `postCreated`. Primary: existing `retryUploads` when uploads failed; `finishPublishing` when `postCreated && !published` otherwise; `publish` otherwise.

### States
- Loading:
  - Poll vote: vote buttons `disabled` (`opacity-50`, `cursor-wait`) while `pending`, and the options group gets `aria-busy={pending}`. No spinner (fast round-trip).
  - Modals: locked modal, spinner + phase label, progress bar for multi-file posts, per-file status in the Dropzone.
- Empty: a poll with no votes shows every row at "0%" with no bars and no extra message. A post with no files skips the uploading phase: the label goes straight to "Publishing…".
- Error:
  - Vote fails: today it only logs. Add `toast.error(t('voteError'))` (sonner, existing pattern) and keep the previous state.
  - Post, create fails before anything exists: existing `publishError` toast; the modal unlocks with all fields editable.
  - Post, poll fails: toast + inline `pollCreateError` notice + "Finish publishing".
  - Post, uploads fail: existing toast + inline notice + Dropzone per-file errors + "Retry failed uploads".
  - Post, `publishPost` fails: `publishError` toast + `lockedNotice` + "Finish publishing".
  - Story: existing `storyForm.publishError` toast; the modal unlocks with all fields editable.
- Success: the modal closes and the feed refreshes, with no extra toast (the post appearing is the feedback, as today). Vote: check icon, primary border and updated bars.
- Offline / slow: the lock and the counter are the slow-network design. The counter only advances as files settle, so on a slow connection it stays on "Uploading 1 of 5…" alongside the per-file "Uploading…" lines, and the user can't close the modal by accident mid-upload. A network failure shows up as per-file errors plus the retry state above. No timeout UI in this round.

### Copy
| Key | English | French |
|-----|---------|--------|
| feed.poll.voteCount | {percent}% · {count} | {percent} % · {count} |
| feed.poll.zeroPercent | 0% | 0 % |
| feed.poll.resultSr | {percent}%, {count, plural, =0 {no votes} one {# vote} other {# votes}} | {percent} %, {count, plural, =0 {aucun vote} one {# vote} other {# votes}} |
| feed.poll.votersLabel | See who voted for “{option}” | Voir qui a voté pour « {option} » |
| feed.poll.voteError | Your vote couldn't be saved. Please try again. | Votre vote n'a pas pu être enregistré. Réessayez. |
| feed.postForm.uploadProgress | Uploading {current} of {total}… | Envoi {current} sur {total}… |
| feed.postForm.uploadingOne | Uploading… | Envoi en cours… |
| feed.postForm.finishPublishing | Finish publishing | Terminer la publication |
| feed.postForm.lockedNotice | This post has already been created. To change its text, date or visibility, close this window and use Edit on the post. | Ce post a déjà été créé. Pour modifier le texte, la date ou la visibilité, fermez cette fenêtre puis utilisez « Modifier » sur le post. |
| feed.postForm.pollCreateError | The post was created but the poll couldn't be added. Try again, or remove the poll to publish without it. | Le post est créé mais le sondage n'a pas pu être ajouté. Réessayez, ou retirez le sondage pour publier sans. |
| feed.postForm.uploadsFailedNotice | {count, plural, one {# file wasn't} other {# files weren't}} uploaded. The post isn't shared yet: nobody is notified until every file is uploaded. Retry below. | {count, plural, one {# fichier n'a pas pu être envoyé} other {# fichiers n'ont pas pu être envoyés}}. Le post n'est pas encore partagé : personne n'est prévenu tant que tous les fichiers ne sont pas envoyés. Réessayez ci-dessous. |

Notes:
- In `fr.json`, put a narrow no-break space (U+202F) before `%`, written literally.
- `{percent}` is the already-rounded integer, passed as a number. `current = min(done + 1, total)`, as in the plan.
- The story modal reads the `postForm` keys through its existing `tShared`.
- `poll_voter.tsx` reads the new `feed.poll` namespace with `useTranslations('feed.poll')`.

### Accessibility
- Poll:
  - Wrap the options in a `role="group"` with `aria-labelledby` pointing to the question's `<p id>`.
  - Vote button: `aria-pressed={isMine}`. Its accessible name is the visible label plus a `sr-only` span with `resultSr` (for example "Grandma Mireille, 60%, 3 votes"). The `Check` icon is `aria-hidden`: `aria-pressed` carries the state for screen readers, and the icon is the non-color cue for sighted users, along with the border.
  - Voters trigger: `aria-label={votersLabel}`. The numbers are already in the vote button's sr-only text, so they aren't repeated. The chevron is `aria-hidden`.
  - Both targets are at least 44px tall (`min-h-11` on the row), and the trigger is at least 44px wide (`min-w-11`). The real boxes are large enough, so the `touch-target` utility isn't needed here.
  - Contrast: the label is `text-landing-foreground` on `bg-primary/15` or `bg-landing-background`, the same pairings as today.
- Modal:
  - The disabled X and Cancel keep their accessible names and are announced as unavailable.
  - Add one visually hidden `role="status" aria-live="polite"` span in the footer whose text mirrors the button's phase (`publishing` / `uploadProgress` / `uploadingOne`), because changes to a button's label are not reliably announced. The inline notice is also `role="status"`.
  - Focus: a natively `disabled` confirm button drops focus to `<body>` when it is pressed. While pending, keep the confirm button focusable with `aria-disabled="true"` and an early return in `handleConfirm`, instead of `disabled`. The other disabled states (form invalid) can keep `disabled`.
  - Reduced motion: the progress bar's width transition and the spinner use `motion-reduce:` variants, as specified above.
  - The fieldset's `disabled` gives every input and the Select trigger native disabled semantics.

### Questions
- ~~Open question 2~~ decided: wait. Copy updated to "not shared yet". Original note: `uploadsFailedNotice` assumes `publishPost` runs after the first pass ("The post is published without them"). If you choose to wait instead, this needs a "not shared yet" wording.
- ~~Vote error toast~~ decided: keep `feed.poll.voteError`.
- Should the Dropzone itself be disabled while uploading (no adding files mid-upload)? It already hides the per-file remove buttons. I did not check whether it accepts a `disabled` prop; the builder can pass it if it exists, otherwise it's a follow-up.

## Risks and open questions
- **Destructive cleanup in the migration (item 5)**: the `DELETE` removes votes whose option doesn't belong to their poll. Before applying, run this read-only check and confirm the result is 0: `SELECT count(*) FROM poll_votes v JOIN poll_options o ON o.id = v.option_id WHERE o.poll_id <> v.poll_id`. If it is not 0, those votes were stuffed and are safe to drop.
- **Open question 1 — decided: fixed first as step 0.** `src/utils/actions/access.ts` is a `'use server'` file, so `getEmailsForUserIds` (**service role**), `getVisibleUserIds`, `getAllBabyMemberIds` and `getBabyAdminIds` are all callable endpoints with no auth check. Any visitor who knows user ids can get their email addresses, and user ids are exposed in comment and reaction payloads. All of its importers are server-side, so dropping the directive, or moving the helpers to a non-action module, is a small separate fix. Should this be its own plan or fix, done before this one?
- **Open question 2 — decided: wait for all uploads.** Original question: when some uploads fail, should `publishPost` still run after the first pass (proposed, matching the current "the post is published without them" text), or wait until all uploads succeed or the user closes? Waiting risks never notifying if the tab is closed.
- **Open question 3 — decided: approved as proposed.** Original question: are the proposed length limits right? (Comment and post caption 2000, story caption 500, poll question 200, option 100, group label and highlight name 50.)
- Between `createPost` and `publishPost`, the post exists without photos. Posts aren't on the realtime relay (`realtime-relay.ts:5`), so only someone refreshing at that moment would see it. This is not a regression, and a draft flag is out of scope.
- If the user closes the modal after `createPost` but before `publishPost` (for example after a poll failure), the post exists but nobody is notified. That is acceptable for admin-only creation.
- Each child-id action now runs one extra small query. The batch feed path is unchanged because the loaders stay unchecked behind a server-only boundary.
- Drift from CLAUDE.md: Server Actions live in `src/utils/actions/`, not `app/actions/`. There is no `@/utils/supabase/client`. Only `NEXT_PUBLIC_COMMIT_SHA` is a build arg. `REACTIONS` has 6 emojis, while `comment-reactions.md` says 5.

## How to verify
Use two babies (A and B), an admin of A who is not a member of B, a viewer of A in circle "Family", and a viewer of A in no circle. Find ids through the network tab, then replay the Server Action calls with a modified body (Next action POST), or call the actions from a temporary server route on a local dev build.

1. Item 1:
   - As the viewer of A, call `getPostViews` and `getPostStats` on an A post: you get empty data.
   - As the admin of A, call them with a B `postId`: you get empty data.
   - As the admin of A, the stats modal still shows real data.
   - `getNicknamesByBaby(B)` as A's admin returns `{}`.
2. Item 2:
   - As the admin of A, `deleteComment(B-commentId, B-postId, A)`: rejected, and the comment still exists.
   - `updatePoll(B-pollId, …, A)`: rejected, and B's options are intact.
   - `createHighlight(A, 'x', B-storyId)`: rejected, and B's story still has its `expires_at`.
   - `updatePost`/`updateStory` with a B id: rejected, and B's circles are unchanged.
   - As the viewer of A in no circle, `addComment`, `addReaction` and `getComments` on a Family-only A post: rejected or empty.
   - As the Family viewer, these work.
3. Item 3:
   - Add a story to a highlight and open the highlight from the tray: there is no crash, the reaction picker works, and its counts match.
   - `pnpm typecheck` fails if `reactions` is removed from the pushed object (spot-check, then revert).
4. Item 4:
   - Tapping an option votes. Tapping "% · count" opens the voter names without voting.
   - The DOM has no `button` inside a `button`.
   - Keyboard Tab reaches both elements.
5. Item 5:
   - `votePoll(pollX, A, optionOfPollY)` is rejected by the action.
   - With the action check bypassed (direct SQL insert), the database rejects it with an FK error.
6. Item 6:
   - `addReaction(post, A, '💩')` is rejected.
   - An empty or whitespace-only comment is rejected.
   - A 3000-character comment is rejected.
   - A long comment's push notification body is truncated.
   - A 300-character poll question is rejected.
7. Item 7:
   - Create a post with 3 photos and a poll. The push and email arrive only after the modal finishes, and the notification opens a post that already has its photos.
   - Force `createPoll` to fail (for example a temporary throw). The retry does not hit a primary key conflict, the poll is added, and the notification is sent once.
8. Item 8:
   - While uploading 5 files: Escape, a backdrop click, the X button and Cancel do nothing, and the progress counts up to 5.
   - After it finishes, the modal closes as before. Repeat for a story.
9. Item 9:
   - (a) Open the second tray group and react. The viewer stays on the same group and story, and the "seen by" line does not flicker or reset.
   - (b) Open the highlight picker on a photo story and type. The story does not advance, and the arrow and Escape keys stay in the input.
   - (c) With a mouse at desktop width, click Next once: it advances exactly one story. Do the same for Prev.
