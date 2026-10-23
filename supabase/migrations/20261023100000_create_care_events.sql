-- Baby tracker: one polymorphic care_events table (sleep, breastfeed, bottle).
-- See .claude/plans/baby-tracker.md.
--
-- Additive only (new types, table, policies). RLS is on from creation: members of the
-- baby can read and write. The admin-only default for the tracker page is enforced in
-- the app (page_settings), not here, so the defaults can't drift between TS and SQL.
-- All timestamps are timestamptz (UTC); localization happens in the app.

CREATE TYPE "public"."care_event_kind" AS ENUM ('sleep', 'breastfeed', 'bottle');
CREATE TYPE "public"."breast_side" AS ENUM ('left', 'right', 'both');

CREATE TABLE "public"."care_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "baby_id" uuid NOT NULL,
  "kind" "public"."care_event_kind" NOT NULL,
  "started_at" timestamptz NOT NULL,
  "ended_at" timestamptz,                 -- null = no end recorded (point-in-time, or ongoing)
  "ongoing" boolean DEFAULT false NOT NULL, -- true = timer running (start now / stop)
  "breast_side" "public"."breast_side",   -- breastfeed only
  "amount_ml" integer,                    -- bottle only
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid,
  CONSTRAINT "care_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "care_events_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE CASCADE,
  CONSTRAINT "care_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  CONSTRAINT "care_events_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  -- generic
  CONSTRAINT "care_events_end_after_start" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at"),
  CONSTRAINT "care_events_ongoing_has_no_end" CHECK (NOT "ongoing" OR "ended_at" IS NULL),
  CONSTRAINT "care_events_max_24h" CHECK ("ended_at" IS NULL OR "ended_at" - "started_at" <= interval '24 hours'),
  CONSTRAINT "care_events_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500),
  -- per kind
  CONSTRAINT "care_events_sleep_fields" CHECK ("kind" <> 'sleep' OR ("breast_side" IS NULL AND "amount_ml" IS NULL)),
  CONSTRAINT "care_events_breastfeed_fields" CHECK ("kind" <> 'breastfeed' OR ("breast_side" IS NOT NULL AND "amount_ml" IS NULL)),
  CONSTRAINT "care_events_bottle_fields" CHECK ("kind" <> 'bottle' OR ("breast_side" IS NULL AND NOT "ongoing" AND ("amount_ml" IS NULL OR "amount_ml" BETWEEN 1 AND 1000)))
);

ALTER TABLE "public"."care_events" OWNER TO "postgres";

CREATE INDEX "care_events_baby_started_idx" ON "public"."care_events" USING btree ("baby_id", "started_at" DESC);
-- At most one running timer per kind per baby: two parents tapping "start sleep" at once
-- -> the second insert fails with 23505, and the action treats that as "already running".
CREATE UNIQUE INDEX "care_events_one_ongoing_per_kind" ON "public"."care_events" ("baby_id", "kind") WHERE "ongoing";

ALTER TABLE "public"."care_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."care_events" FROM "anon";
GRANT SELECT, INSERT, DELETE ON TABLE "public"."care_events" TO "authenticated";
-- Column-level UPDATE: policies can't see OLD values, so this is what stops a member
-- moving a row to another baby or rewriting who created it.
GRANT UPDATE ("kind", "started_at", "ended_at", "ongoing", "breast_side", "amount_ml", "note", "updated_at", "updated_by")
    ON TABLE "public"."care_events" TO "authenticated";
GRANT ALL ON TABLE "public"."care_events" TO "service_role";

CREATE POLICY "care_events_select_member" ON "public"."care_events"
    FOR SELECT TO "authenticated" USING ("public"."is_baby_member"("baby_id"));
CREATE POLICY "care_events_insert_member" ON "public"."care_events"
    FOR INSERT TO "authenticated"
    WITH CHECK ("public"."is_baby_member"("baby_id") AND "created_by" = "auth"."uid"()
        AND ("updated_by" IS NULL OR "updated_by" = "auth"."uid"()));
CREATE POLICY "care_events_update_member" ON "public"."care_events"
    FOR UPDATE TO "authenticated"
    USING ("public"."is_baby_member"("baby_id"))
    WITH CHECK ("public"."is_baby_member"("baby_id") AND ("updated_by" IS NULL OR "updated_by" = "auth"."uid"()));
CREATE POLICY "care_events_delete_member" ON "public"."care_events"
    FOR DELETE TO "authenticated" USING ("public"."is_baby_member"("baby_id"));

-- Realtime: add to the publication if it exists (it's managed by hand elsewhere).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."care_events";
  END IF;
END $$;
