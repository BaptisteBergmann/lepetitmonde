# Story creation: survive side-effect failures and retries

## Status: implemented

Shipped 2026-11-10 (4844fb9, 1349231, 4043d74, 7c1bf0d, 0cca8d6, a46232a). Deviations: subtasks 2 and 3 shipped as one commit, so no version leaves stories un-notified. `/api/upload` never reports "already exists", so the modal instead skips re-uploading files that already succeeded and locks the file once `createStory` is sent. The resume path also re-syncs caption, group label and circles (delete stale, then upsert). `expires_at` is not updated on resume. The manual test scenarios were not run.

## Incident (2026-11-10)

Story `8236a0aa-09c7-46ba-8531-72be5a72c14a` ("Workout 💪🏼", a `.mov`) was
created at 14:42:09Z, but nobody was notified.

1. `createStory` inserted the `stories` row and its `stories_circles` links.
2. `copyStoryPhotoToLibrary` copied both storage objects fine, then its
   `album_photos` insert got a **502 from Kong**: PostgREST reset the
   connection (`recv() failed (104: Connection reset by peer)`), a transient
   error.
3. That error was re-thrown, so `createStory` aborted before `notifyUsers`.
4. The client retried with the same story id → `23505 stories_pkey` (and
   "resource already exists" on the re-upload), so the retry could never
   finish the job.

Backfilled by hand the same day: the `album_photos` row was inserted, and 49
inbox rows plus 24 pushes were sent using the same rules as `notifyUsers`
(recipients from `getVisibleUserIdsWith`, preferences, quiet hours, multi-baby
title prefix).

## Root causes

- **The Photos-page mirror is a secondary effect, but its failure is fatal.**
  The story is already committed when it runs, so throwing does not roll
  anything back. It only skips everything after it (the notification and
  `revalidatePath`) and shows the user an error for a story that actually
  exists.
- **`createStory` cannot be retried.** The client reuses the id it generated
  (good), but the server treats a second call as a conflict instead of
  resuming. Posts already solved this: `createPost` resumes a retried post and
  `publishPost` sends the notification as a separate step
  (`src/utils/actions/posts.ts`).

## Fix

### 1. Make the Photos-page copy best-effort (the minimal fix)

In `createStory` (`src/utils/actions/stories.ts`), wrap
`copyStoryPhotoToLibrary` in `try/catch`. On error, log
`contextLogger.error(err, "Error mirroring story to Photos page")` and carry
on. This matches the "never break the triggering action" rule that
`notifyUsers` already follows.

Do the same in `attachPostPhotos` around `linkPostPhotos` (same pattern, same
risk: the `post_photos` rows are committed, then the mirror throws).

### 2. Make `createStory` resumable on retry

When the insert returns `23505` on `stories_pkey`:

- Re-read the row with `.eq('id', story.id).eq('baby_id', story.baby_id)`.
- Require that `created_by` is the caller and that `media_path` matches. If
  not, throw `unauthorized`, so nobody can "resume" someone else's story.
- Reconcile `stories_circles` with an upsert using
  `onConflict: 'story_id,circle_id'` (same as `createPost`'s retry path).
- Then fall through to the side effects. Mirror only when no `album_photos`
  row has `source_story_id = story.id`, and make the storage copy tolerate
  "already exists".

### 3. Never send a notification twice

Resuming must not re-notify people who were already told. Pick one:

- **(Recommended) Split out `publishStory(storyId, babyId)`**, like
  `publishPost`. The client calls it once `createStory` resolves, and
  recipients come from the stored circles. A failed notification can then be
  retried on its own, and the modal's `published` state stops double sends,
  the same way it does for posts.
- Alternative: add `stories.notified_at` and set it in the same action after
  `notifyUsers`. Rejected: this needs a migration, and `notifyUsers` never
  throws, so the column would record attempts, not deliveries.

### 4. Client

The story upload modal should treat a resumed `createStory` as success and
then call `publishStory`. It should keep the same story id across retries
(already the case) and stop re-uploading media that already exists (the
upload route already returns "already exists", so treat that as fine for
retries).

## Refactor worth doing

`createStory`, `attachPostPhotos` and `publishPost` all mix one required
write with several best-effort effects (mirror, notify, revalidate). Add a
small server-only helper in `src/utils/side-effects.ts`:

```ts
export async function bestEffort(log: Logger, label: string, fn: () => Promise<unknown>) {
  try { await fn() } catch (err) { log.error(err, label) }
}
```

Use it for every effect that runs after the required write. Scope it to
these three call sites for now, and don't sweep the whole codebase.

## Tests / verification

- Typecheck and lint.
- Make `copyStoryPhotoToLibrary` throw (temporary env flag or a mocked
  insert) and check that the story is created, the notification is sent, and
  the error is logged.
- Call `createStory` twice with the same id: the second call resolves, there
  is still one `stories` row and one `album_photos` row, and no second
  notification is sent.
- Resuming with another admin's account is rejected.

## Docs

Update the stories feature note in `docs/features/` (retry and publish flow).
