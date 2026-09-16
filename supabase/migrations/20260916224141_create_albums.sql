CREATE TABLE "public"."albums" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "baby_id" uuid NOT NULL,
  "created_by" uuid DEFAULT auth.uid(),
  "name" character varying NOT NULL
);

ALTER TABLE "public"."albums" OWNER TO "postgres";

ALTER TABLE ONLY "public"."albums"
    ADD CONSTRAINT "albums_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."albums"
    ADD CONSTRAINT "albums_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."albums"
    ADD CONSTRAINT "albums_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

GRANT ALL ON TABLE "public"."albums" TO "anon";
GRANT ALL ON TABLE "public"."albums" TO "authenticated";
GRANT ALL ON TABLE "public"."albums" TO "service_role";

-- Same "no circle assigned = hidden, admin-only" visibility rule as
-- posts_circles/events_circles: enforced in app code (see albums.ts),
-- mirrored later as an RLS policy per .claude/plans/rls.md.
CREATE TABLE "public"."albums_circles" (
  "album_id" uuid NOT NULL,
  "circle_id" uuid NOT NULL
);

ALTER TABLE "public"."albums_circles" OWNER TO "postgres";

ALTER TABLE ONLY "public"."albums_circles"
    ADD CONSTRAINT "albums_circles_pkey" PRIMARY KEY ("album_id", "circle_id");

ALTER TABLE ONLY "public"."albums_circles"
    ADD CONSTRAINT "albums_circles_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."albums_circles"
    ADD CONSTRAINT "albums_circles_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;

GRANT ALL ON TABLE "public"."albums_circles" TO "anon";
GRANT ALL ON TABLE "public"."albums_circles" TO "authenticated";
GRANT ALL ON TABLE "public"."albums_circles" TO "service_role";

CREATE TABLE "public"."album_photos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "album_id" uuid NOT NULL,
  "storage_path" character varying NOT NULL,
  "thumbnail_path" character varying,
  "mime_type" character varying NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE "public"."album_photos" OWNER TO "postgres";

ALTER TABLE ONLY "public"."album_photos"
    ADD CONSTRAINT "album_photos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."album_photos"
    ADD CONSTRAINT "album_photos_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE CASCADE;

GRANT ALL ON TABLE "public"."album_photos" TO "anon";
GRANT ALL ON TABLE "public"."album_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."album_photos" TO "service_role";

-- Bearer-token public share link, same trust model as `invitations`: whoever
-- holds the id can read the album (while it's within expires_at and not
-- revoked) without any baby_access/circles_access row of their own.
CREATE TABLE "public"."album_shares" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "album_id" uuid NOT NULL,
  "created_by" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz
);

ALTER TABLE "public"."album_shares" OWNER TO "postgres";

ALTER TABLE ONLY "public"."album_shares"
    ADD CONSTRAINT "album_shares_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."album_shares"
    ADD CONSTRAINT "album_shares_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."album_shares"
    ADD CONSTRAINT "album_shares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

GRANT ALL ON TABLE "public"."album_shares" TO "anon";
GRANT ALL ON TABLE "public"."album_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."album_shares" TO "service_role";
