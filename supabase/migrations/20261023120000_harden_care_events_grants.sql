-- The baseline's ALTER DEFAULT PRIVILEGES already gave `authenticated` ALL on every new
-- table, so the column-level UPDATE grant in create_care_events had no effect (a table-wide
-- UPDATE, plus TRUNCATE/REFERENCES/TRIGGER, was still in place). Revoke everything and
-- grant back only what the app needs.
REVOKE ALL ON TABLE "public"."care_events" FROM "authenticated";
GRANT SELECT, INSERT, DELETE ON TABLE "public"."care_events" TO "authenticated";
GRANT UPDATE ("kind", "started_at", "ended_at", "ongoing", "breast_side", "amount_ml", "note", "updated_at", "updated_by")
    ON TABLE "public"."care_events" TO "authenticated";

-- Every update must be attributed to the caller (the app always sets updated_by).
DROP POLICY IF EXISTS "care_events_update_member" ON "public"."care_events";
CREATE POLICY "care_events_update_member" ON "public"."care_events"
    FOR UPDATE TO "authenticated"
    USING ("public"."is_baby_member"("baby_id"))
    WITH CHECK ("public"."is_baby_member"("baby_id") AND "updated_by" = "auth"."uid"());
