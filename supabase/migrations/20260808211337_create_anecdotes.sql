CREATE TABLE "public"."anecdotes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "baby_id" uuid NOT NULL,
  "created_by" uuid DEFAULT auth.uid(),
  "content" character varying NOT NULL,
  "happened_at" timestamptz DEFAULT now() NOT NULL,
  "photo_path" character varying,
  "photo_thumbnail_path" character varying,
  "photo_mime_type" character varying
);

ALTER TABLE "public"."anecdotes" OWNER TO "postgres";

ALTER TABLE ONLY "public"."anecdotes"
    ADD CONSTRAINT "anecdotes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."anecdotes"
    ADD CONSTRAINT "anecdotes_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."anecdotes"
    ADD CONSTRAINT "anecdotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

GRANT ALL ON TABLE "public"."anecdotes" TO "anon";
GRANT ALL ON TABLE "public"."anecdotes" TO "authenticated";
GRANT ALL ON TABLE "public"."anecdotes" TO "service_role";

-- Same "no circle = hidden, admin-only" rule as posts_circles/stories_circles.
CREATE TABLE "public"."anecdotes_circles" (
  "anecdote_id" uuid NOT NULL,
  "circle_id" uuid NOT NULL
);

ALTER TABLE "public"."anecdotes_circles" OWNER TO "postgres";

ALTER TABLE ONLY "public"."anecdotes_circles"
    ADD CONSTRAINT "anecdotes_circles_pkey" PRIMARY KEY ("anecdote_id", "circle_id");

ALTER TABLE ONLY "public"."anecdotes_circles"
    ADD CONSTRAINT "anecdotes_circles_anecdote_id_fkey" FOREIGN KEY ("anecdote_id") REFERENCES "public"."anecdotes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."anecdotes_circles"
    ADD CONSTRAINT "anecdotes_circles_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;

GRANT ALL ON TABLE "public"."anecdotes_circles" TO "anon";
GRANT ALL ON TABLE "public"."anecdotes_circles" TO "authenticated";
GRANT ALL ON TABLE "public"."anecdotes_circles" TO "service_role";

ALTER TYPE "public"."notification_type" ADD VALUE 'new_anecdote';
