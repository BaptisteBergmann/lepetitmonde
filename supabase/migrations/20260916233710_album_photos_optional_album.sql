-- Photos can now be uploaded without an album ("unsorted") and assigned to
-- one later. album_photos previously derived baby_id transitively through
-- albums.baby_id, which stops working once album_id can be null, so baby_id
-- is added directly to album_photos and backfilled from the existing rows'
-- album before album_id is relaxed.

ALTER TABLE "public"."album_photos"
    ADD COLUMN "baby_id" uuid;

UPDATE "public"."album_photos" AS "ap"
SET "baby_id" = "a"."baby_id"
FROM "public"."albums" AS "a"
WHERE "a"."id" = "ap"."album_id";

ALTER TABLE "public"."album_photos"
    ALTER COLUMN "baby_id" SET NOT NULL;

ALTER TABLE ONLY "public"."album_photos"
    ADD CONSTRAINT "album_photos_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."album_photos"
    ALTER COLUMN "album_id" DROP NOT NULL;
