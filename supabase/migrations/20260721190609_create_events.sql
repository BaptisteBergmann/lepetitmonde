CREATE TYPE "public"."event_kind" AS ENUM ('custom', 'milestone');

CREATE TYPE "public"."milestone_type" AS ENUM (
  'first_steps', 'first_tooth', 'first_word', 'first_smile', 'first_laugh', 'birthday', 'other'
);

CREATE TABLE "public"."events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "baby_id" uuid NOT NULL,
  "circle_id" uuid,
  "created_by" uuid DEFAULT auth.uid() NOT NULL,
  "event_date" date NOT NULL,
  "kind" "public"."event_kind" NOT NULL DEFAULT 'custom',
  "milestone_type" "public"."milestone_type",
  "title" character varying NOT NULL,
  "description" character varying
);

ALTER TABLE "public"."events" OWNER TO "postgres";

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";
