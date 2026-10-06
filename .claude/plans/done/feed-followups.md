# Feed follow-ups: action surface and publish flow

## Status: implemented

Shipped 2026-10-06, reviewer approved round 1. storage.ts and notify.ts are no longer server-action files; linkPostPhotos/copyStoryPhotoToLibrary/nextUnsortedPosition moved to src/utils/albums-internal.ts; createPost/createPoll roll back partial inserts; publishPost email step can't fail after the push; Dropzone gained a `disabled` prop (also hides remove buttons); 0-vote poll row votes on tap.
Follow-ups: Dropzone root stays tabbable while disabled (pass `disabled` to useDropzone); lost-response retries can still duplicate; album/anecdote modals don't pass `disabled` yet; `src/utils/supabase/server.ts` still has `"use server"`; consider installing `server-only`; submitBugReport has no size/MIME check on screenshots; hard-coded push title.

Originally approved by the user on 2026-10-06.

Approved by the user on 2026-10-06 (small fixes, scope approved directly).

## Part A: unauthenticated service-role actions

1. `src/utils/actions/storage.ts`: `removeStorageObjects`, `copyStorageObject`,
   `ensureBabyBucket`, `ensureBugReportsBucket` run on the service role with no
   auth check. Every importer is a server-action file (albums, posts, stories,
   anecdotes, bug_reports), so drop `'use server'` with an explanatory comment
   (same approach as db3d95b for `access.ts`).
2. `src/utils/actions/albums.ts`: `linkPostPhotos` and `copyStoryPhotoToLibrary`
   are exported actions with no auth check, only called from `posts.ts` and
   `stories.ts`. Move them (and `nextUnsortedPosition`) to a non-action module
   `src/utils/albums-internal.ts`, matching `feed-loaders.ts`.
3. `src/utils/actions/notify.ts`: `notifyUsers` (service role, arbitrary
   babyId/targets/content, no auth) is only imported by server-action files.
   Drop `'use server'` with an explanatory comment.
4. Audit every `'use server'` file for other exported functions that use the
   admin client without an auth check, and report them.

## Part B: publish-flow follow-ups

5. Retry-safe creates: `createPoll` deletes the poll row if the `poll_options`
   insert fails; `createPost` deletes the post row if the `posts_circles` insert
   fails. Both rethrow the original error, so the modal's retry (same postId)
   creates them again cleanly.
6. `publishPost`: the push goes out before the email step, so an email failure
   made the action throw and a retry re-sent the push. Wrap the email block in
   try/catch with `contextLogger.error`.
7. `create_post_modal.tsx` / `create_story_modal.tsx`: add a `disabled` prop to
   `src/components/dropzone.tsx` (no drop/click handlers, disabled input, no
   remove buttons) and pass `isPending`.
8. `poll_voter.tsx`: a 0-vote row shows "0%" outside the vote button, so tapping
   it does not vote. Render the "0%" inside the vote button (still `aria-hidden`,
   the sr-only result text stays) so the whole row votes, per the Design section
   of `.claude/plans/done/journal-review-fixes.md` ("Tapping anywhere on that row
   votes").
