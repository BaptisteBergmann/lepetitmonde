-- Lets a post's or story's photo also show up on the Photos page
-- (album_photos, album_id null = "unsorted") without a separate upload.
--
-- source_post_id: the mirrored row shares the post's actual storage object
-- (see linkPostPhotos in albums.ts) — ON DELETE CASCADE so deleting the
-- post removes the Photos-page entry too, since the storage it points at
-- is gone at the same time (posts.ts's deletePost already removes it).
--
-- source_story_id: the mirrored row points at an independent *copy* of the
-- story's media (see copyStoryPhotoToLibrary in albums.ts), made precisely
-- so the Photos-page entry survives the story disappearing (expiry via
-- pruneExpiredStories, or an explicit delete) — ON DELETE SET NULL, purely
-- an informational backlink, never a reason to remove the copy.
ALTER TABLE "public"."album_photos"
    ADD COLUMN "source_post_id" uuid,
    ADD COLUMN "source_story_id" uuid;

ALTER TABLE ONLY "public"."album_photos"
    ADD CONSTRAINT "album_photos_source_post_id_fkey" FOREIGN KEY ("source_post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."album_photos"
    ADD CONSTRAINT "album_photos_source_story_id_fkey" FOREIGN KEY ("source_story_id") REFERENCES "public"."stories"("id") ON DELETE SET NULL;

ALTER TABLE "public"."album_photos"
    ADD CONSTRAINT "album_photos_single_source_chk" CHECK ("source_post_id" IS NULL OR "source_story_id" IS NULL);
