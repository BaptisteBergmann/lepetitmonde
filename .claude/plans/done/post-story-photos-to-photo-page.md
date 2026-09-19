# Mirror post/story media onto the Photos page

## Status: implemented

Shipped across `af68e94` (source_post_id/source_story_id migration + link/copy actions), `ef4649b` (mirroring wired into createPost/createStory), and `3b8fab1` (server-generated thumbnails for post/story images). No deviations found.

## Context

Photos and videos currently live in three disconnected places:

- **Posts** (`posts` / `post_photos`) — media attached to a feed post, stored at `posts/${postId}/${filename}`.
- **Stories** (`stories`) — one media file per story, stored at `stories/${storyId}/${filename}`, subject to expiry/pruning (`pruneExpiredStories` in `stories.ts`) unless `expires_at` is null (duration "never", or once added to a `story_highlights` collection).
- **Photos page** (`/baby/[babyId]/albums`, "All Photos" tab) — backed by `album_photos`, which already supports photos with no album (`album_id IS NULL`, the "unsorted" bucket), stored at `photos/${babyId}/${filename}` when uploaded directly via "Add photos".

The ask: creating a post or a story should also make its media show up on the Photos page, without a separate "Add photos" upload — **and** a story's Photos-page copy must survive the story itself disappearing (expiry, or an explicit delete), confirmed by the user. Posts don't have this requirement: if a post is explicitly deleted, its Photos-page copy is fine to go with it (confirmed — deleting a post is a deliberate action, unlike a story just expiring).

That difference in requirements means posts and stories need **two different mechanisms**, not one shared one:

## Design: link for posts, copy for stories

### Posts → link (no storage duplication)

`album_photos` gets a new nullable FK column `source_post_id → posts(id) ON DELETE CASCADE`. When `attachPostPhotos` runs, it also inserts a companion `album_photos` row per photo that points at the **same** `storage_path`/`thumbnail_path` as the `post_photos` row — no second upload, no doubled storage. Because the FK cascades, deleting the post deletes the mirrored row automatically (consistent with the confirmed behavior: post gone → its Photos-page entry gone too).

Since the storage object is shared between `post_photos` and this mirrored `album_photos` row, deleting *only* the Photos-page entry (via `deletePhoto`) must not delete the storage — see the delete-guard fix below.

### Stories → copy (independent, survives the story)

For stories, `attachPostPhotos`'s trick doesn't work: the whole point is that the Photos-page copy must outlive the story, including past expiry when `pruneExpiredStories` deletes the story's own storage object. So `createStory` instead makes a **real server-side copy** of the story's media (and thumbnail, if any) into `photos/${babyId}/${storyId}/...`, using Supabase Storage's server-side `copy()` (admin client, no re-upload from the browser — it's a storage-to-storage copy, not a download+upload round trip) and inserts a *new, independent* `album_photos` row pointing at the copy.

That row still gets a `source_story_id → stories(id)` column, but as `ON DELETE SET NULL`, not `CASCADE` — purely informational (e.g. a future "originally from this story" link), never a reason to delete the Photos-page entry. When the story is deleted or expires, the mirrored row just loses that backlink and otherwise keeps existing normally, like any other Photos-page photo.

Trade-off, explicit: this does duplicate storage for every story's media (up to 500MB per the modal's `maxFileSize`) — accepted per the user's confirmation that durability matters more than storage here. Posts are unaffected by this cost since they use the link approach.

## Required delete-guard fix (posts only)

`deletePhoto` and `deleteAlbum` in `albums.ts` currently always call `removeStorageObjects` for every `album_photos` row being removed. That's still correct for story-derived rows (their storage is an independent copy — nothing else references it). But it's now unsafe for post-derived rows: deleting a mirrored photo from the Photos page, or deleting an album a mirrored photo was later filed into, must **not** delete storage that the live post is still using.

Fix: both functions select `source_post_id` alongside their existing columns and skip `removeStorageObjects` only when it's set. Rows with `source_story_id` (or no source at all) keep today's unconditional-delete behavior.

## Visibility (explicit scope limitation, flagging for a decision)

`getAllAlbumPhotos` treats any unsorted photo (`album_id IS NULL`) as **admin-only** — `if (!row.albums) return isAdmin`. Both mirrored-post and copied-story photos land as unsorted, so they inherit that rule rather than the originating post's/story's circle visibility. `createPost`/`createStory` already require admin, so the creator always sees their own mirrored photos; the gap is a *non-admin* circle member who can see the post/story in the Feed but won't see its Photos-page copy until an admin files it into a circle-visible album via the existing "add to album" flow.

Defaulting to this (matches the existing "unsorted = admin-only" model, no extra schema) rather than threading circle visibility through, which would need either an `album_photos_circles` join or teaching `getAllAlbumPhotos` to fall back to `posts_circles`/`stories_circles` for sourced rows — a bigger, separable change. Flagging in case the intent is actually "everyone who can see the post/story should see it on Photos too."

## Plan

1. **Migration** `supabase/migrations/<ts>_album_photos_source_link.sql`:
   - `ALTER TABLE album_photos ADD COLUMN source_post_id uuid, ADD COLUMN source_story_id uuid;`
   - `source_post_id → posts(id) ON DELETE CASCADE`.
   - `source_story_id → stories(id) ON DELETE SET NULL`.
   - `CHECK (source_post_id IS NULL OR source_story_id IS NULL)` (a row is never both).
   - Regenerate `database.types.ts` (`mise exec -- supabase gen types ...`, per project convention).

2. **`src/utils/actions/storage.ts`**: add `copyStorageObject(babyId, fromPath, toPath)` — thin wrapper around the admin client's `supabase.storage.from(babyId).copy(fromPath, toPath)`, mirroring the existing `removeStorageObjects` shape.

3. **`src/utils/actions/albums.ts`**:
   - Add `linkPostPhotos(postId, babyId, files: { storagePath, thumbnailPath, mimeType }[])` — inserts `album_photos` rows with `album_id: null`, `source_post_id: postId`, and the **exact** `storage_path`/`thumbnail_path` passed in (no folder-prefixing, unlike `insertPhotoRows`), appended after whatever's already unsorted (same position-counting logic as `insertPhotoRows`). No admin check — caller already did one.
   - Add `copyStoryPhotoToLibrary(storyId, babyId, file: { storagePath, thumbnailPath, mimeType })` — calls `copyStorageObject` for the media (and the thumbnail, if present) into `photos/${babyId}/${storyId}/...`, then inserts one `album_photos` row (`album_id: null`, `source_story_id: storyId`, position appended) pointing at the copies.
   - `deletePhoto`: select `source_post_id` alongside existing columns; skip `removeStorageObjects` only when it's set.
   - `deleteAlbum`: same — partition fetched photos by `source_post_id` before calling `removeStorageObjects`, only on the ones without it.

4. **`src/utils/actions/posts.ts`**: at the end of `attachPostPhotos` (after the `post_photos` insert succeeds), call `linkPostPhotos(postId, babyId, files-with-resolved-paths)` and add `revalidatePath(\`/baby/${babyId}/albums\`)`. `deletePost` needs no new code (cascade handles the mirrored row) but gets the same `revalidatePath` added so the Photos page is fresh next time it's opened.

5. **`src/utils/actions/stories.ts`**: at the end of `createStory` (after circle-linking, alongside its existing `revalidatePath`), call `copyStoryPhotoToLibrary(storyId, babyId, { storagePath: media_path, thumbnailPath: thumbnail_path, mimeType })` and add `revalidatePath(\`/baby/${babyId}/albums\`)`. No changes needed to `pruneExpiredStories` or `deleteStory` — the `ON DELETE SET NULL` FK means the mirrored row is untouched either way; add the same `revalidatePath` to `deleteStory` for consistency.

6. **Thumbnail fix, needed so mirrored grid entries aren't full-size loads** — `create_post_modal.tsx` and `create_story_modal.tsx` currently only set `thumbnailFilename` for video uploads (via client-side `captureVideoThumbnail`); they never read `newlyUploaded.thumbnails`/`upload.finalThumbnails`, even though `/api/upload` already generates a server-side thumbnail for every image upload (the fix from `.claude/plans/done/albums-performance.md`, currently only consumed by `add_photos_modal.tsx`). Today this silently means every *image* in a post/story loads full-size in the feed too (`post_card.tsx:130` already does `photo.thumbnailUrl ?? photo.url` — it's just never populated). Fix both modals to merge in `finalThumbnails`/`finalContentTypes` for non-video files the same way `add_photos_modal.tsx` already does. This both fixes that pre-existing feed inefficiency and ensures the new Photos-page entries (linked or copied) get real thumbnails instead of the full original — and for stories specifically, the copy step (step 5) also needs to copy that thumbnail object, not just the media.

## Verification

- Create a post with 2 photos + 1 video as admin → confirm all 3 appear on `/baby/[babyId]/albums` "All Photos" immediately, `album_id: null`.
- Create a story (duration 24h) → confirm its photo appears on Photos too, at a *different* storage path than the story's own (`photos/${babyId}/${storyId}/...` vs `stories/${storyId}/...`).
- As a non-admin circle member who can see that post/story in the Feed, open Photos → confirm the mirrored entries are *not* shown (documented limitation above).
- Delete the post from the Feed → confirm its photos disappear from Photos (cascade) and the storage objects are actually gone.
- Let (or simulate, by backdating `expires_at`) the 24h story expire → confirm the story disappears from the Feed/tray but its Photos-page copy **remains**, and still renders (proves it was a real independent copy, not a broken link).
- Manually delete a story that hasn't expired → same check: Photos-page copy survives.
- From the Photos page, delete a post-derived mirrored photo → confirm only the Photos entry disappears; reload the Feed and confirm the original post still shows that photo untouched.
- Assign a post-derived mirrored photo to an album, then delete that album → confirm the album and the `album_photos` row are gone, but the original post's photo (storage + feed rendering) is untouched.
- Upload a fresh `.heic`/iPhone photo via a new post → confirm `post_photos.thumbnail_path` gets populated and the Photos-page grid entry loads a small thumbnail, not the multi-MB original.

## File list

**New:**
- `supabase/migrations/<ts>_album_photos_source_link.sql`

**Edited:**
- `src/utils/actions/storage.ts`
- `src/utils/actions/albums.ts`
- `src/utils/actions/posts.ts`
- `src/utils/actions/stories.ts`
- `src/app/baby/[babyId]/feed/_components/create_post_modal.tsx`
- `src/app/baby/[babyId]/feed/_components/create_story_modal.tsx`
- `src/utils/supabase/database.types.ts` (regenerated)
