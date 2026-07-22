ALTER TABLE "public"."post_photos"
    ADD COLUMN "mime_type" character varying;

-- Backfill existing rows as images: post_photos predates video uploads, so
-- everything already stored is a photo.
UPDATE "public"."post_photos" SET "mime_type" = 'image/jpeg' WHERE "mime_type" IS NULL;
