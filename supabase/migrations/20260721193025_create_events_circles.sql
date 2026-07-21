CREATE TABLE "public"."events_circles" (
  "event_id" uuid NOT NULL,
  "circle_id" uuid NOT NULL
);

ALTER TABLE "public"."events_circles" OWNER TO "postgres";

ALTER TABLE ONLY "public"."events_circles"
    ADD CONSTRAINT "events_circles_pkey" PRIMARY KEY ("event_id", "circle_id");

ALTER TABLE ONLY "public"."events_circles"
    ADD CONSTRAINT "events_circles_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."events_circles"
    ADD CONSTRAINT "events_circles_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;

GRANT ALL ON TABLE "public"."events_circles" TO "anon";
GRANT ALL ON TABLE "public"."events_circles" TO "authenticated";
GRANT ALL ON TABLE "public"."events_circles" TO "service_role";

ALTER TABLE "public"."events" DROP COLUMN "circle_id";
