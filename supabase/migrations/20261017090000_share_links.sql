-- Share links: photo selections, hashed tokens, single-use links, visit log
-- (see .claude/plans/share-links.md).
--
-- Additive only: :latest and :prod share one database and :prod still inserts
-- album_shares with just album_id/created_by/expires_at, so every new column is
-- nullable or defaulted. The NOT NULL tightening is a later migration, after
-- :prod runs the new code.

-- baby_id lets share rows be scoped (and later RLS-covered) without a join.
ALTER TABLE "public"."album_shares"
    ADD COLUMN "baby_id" uuid,
    ADD COLUMN "token_hash" text,
    ADD COLUMN "kind" text DEFAULT 'album' NOT NULL,
    ADD COLUMN "label" varchar(100),
    ADD COLUMN "single_use" boolean DEFAULT false NOT NULL,
    ADD COLUMN "opened_at" timestamptz;

ALTER TABLE ONLY "public"."album_shares"
    ADD CONSTRAINT "album_shares_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."album_shares"
    ADD CONSTRAINT "album_shares_kind_check" CHECK ("kind" IN ('album', 'photos'));

-- A 'photos' share points at no album.
ALTER TABLE "public"."album_shares" ALTER COLUMN "album_id" DROP NOT NULL;

UPDATE "public"."album_shares" s
   SET "baby_id" = a."baby_id"
  FROM "public"."albums" a
 WHERE a."id" = s."album_id";

-- Old links used the row id as the token: hash it so they keep resolving.
-- Built-in sha256(), no pgcrypto needed.
UPDATE "public"."album_shares"
   SET "token_hash" = encode(sha256(convert_to("id"::text, 'UTF8')), 'hex');

CREATE UNIQUE INDEX "album_shares_token_hash_key" ON "public"."album_shares" ("token_hash");
CREATE INDEX IF NOT EXISTS "album_shares_baby_id_idx" ON "public"."album_shares" ("baby_id");
CREATE INDEX IF NOT EXISTS "album_shares_album_id_idx" ON "public"."album_shares" ("album_id");

-- Fixed set of photos for kind = 'photos'. Deleting a photo drops it from every selection.
CREATE TABLE "public"."album_share_photos" (
  "share_id" uuid NOT NULL,
  "photo_id" uuid NOT NULL,
  "position" integer DEFAULT 0 NOT NULL
);
ALTER TABLE "public"."album_share_photos" OWNER TO "postgres";
ALTER TABLE ONLY "public"."album_share_photos"
    ADD CONSTRAINT "album_share_photos_pkey" PRIMARY KEY ("share_id", "photo_id");
ALTER TABLE ONLY "public"."album_share_photos"
    ADD CONSTRAINT "album_share_photos_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "public"."album_shares"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."album_share_photos"
    ADD CONSTRAINT "album_share_photos_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "public"."album_photos"("id") ON DELETE CASCADE;
CREATE INDEX "album_share_photos_photo_id_idx" ON "public"."album_share_photos" ("photo_id");

-- One row per page open (written by the service role from the public page).
CREATE TABLE "public"."album_share_accesses" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "share_id" uuid NOT NULL,
  "accessed_at" timestamptz DEFAULT now() NOT NULL,
  "ip" inet,
  "user_agent" varchar(512)
);
ALTER TABLE "public"."album_share_accesses" OWNER TO "postgres";
ALTER TABLE ONLY "public"."album_share_accesses"
    ADD CONSTRAINT "album_share_accesses_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."album_share_accesses"
    ADD CONSTRAINT "album_share_accesses_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "public"."album_shares"("id") ON DELETE CASCADE;
CREATE INDEX "album_share_accesses_share_id_accessed_at_idx" ON "public"."album_share_accesses" ("share_id", "accessed_at" DESC);

-- RLS from birth on the two new tables. The baseline's default privileges
-- grant anon on new tables, so revoke it explicitly.
ALTER TABLE "public"."album_share_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."album_share_accesses" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."album_share_photos", "public"."album_share_accesses" FROM "anon";

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."album_share_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."album_share_photos" TO "service_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."album_share_accesses" TO "authenticated";
GRANT ALL ON TABLE "public"."album_share_accesses" TO "service_role";

CREATE POLICY "album_share_photos_select_admin" ON "public"."album_share_photos"
    FOR SELECT TO "authenticated"
    USING (EXISTS (SELECT 1 FROM "public"."album_shares" s WHERE s."id" = "share_id" AND "public"."is_baby_admin"(s."baby_id")));
CREATE POLICY "album_share_photos_insert_admin" ON "public"."album_share_photos"
    FOR INSERT TO "authenticated"
    WITH CHECK (EXISTS (SELECT 1 FROM "public"."album_shares" s WHERE s."id" = "share_id" AND "public"."is_baby_admin"(s."baby_id")));
CREATE POLICY "album_share_photos_delete_admin" ON "public"."album_share_photos"
    FOR DELETE TO "authenticated"
    USING (EXISTS (SELECT 1 FROM "public"."album_shares" s WHERE s."id" = "share_id" AND "public"."is_baby_admin"(s."baby_id")));

-- Read-only for admins; only the service role writes (rows cascade with the share).
CREATE POLICY "album_share_accesses_select_admin" ON "public"."album_share_accesses"
    FOR SELECT TO "authenticated"
    USING (EXISTS (SELECT 1 FROM "public"."album_shares" s WHERE s."id" = "share_id" AND "public"."is_baby_admin"(s."baby_id")));
