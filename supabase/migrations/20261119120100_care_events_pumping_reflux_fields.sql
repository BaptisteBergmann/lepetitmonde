-- Pumping and reflux: typed columns and CHECKs. See .claude/plans/pumping-and-reflux.md.
-- Additive only. RLS and the anon revoke on care_events already apply.
-- Note: breast_side now means "breast fed from" for breastfeed and "breast pumped" for
-- pumping (nullable there on purpose). Side analytics only read breastfeed rows.

CREATE TYPE "public"."reflux_severity" AS ENUM ('small', 'medium', 'large');

ALTER TABLE "public"."care_events"
  ADD COLUMN "reflux_severity" "public"."reflux_severity",
  ADD CONSTRAINT "care_events_pumping_fields" CHECK ("kind" <> 'pumping' OR (
    "ended_at" IS NULL AND NOT "ongoing"
    AND ("amount_ml" IS NULL OR "amount_ml" BETWEEN 1 AND 1000)
  )),
  ADD CONSTRAINT "care_events_reflux_fields" CHECK ("kind" <> 'reflux' OR (
    "ended_at" IS NULL AND NOT "ongoing" AND "breast_side" IS NULL AND "amount_ml" IS NULL
  )),
  -- Covers the other kinds so their existing per-kind CHECKs stay untouched.
  ADD CONSTRAINT "care_events_reflux_severity_only_reflux" CHECK ("kind" = 'reflux' OR "reflux_severity" IS NULL);

-- Column-level UPDATE: without this the web edit fails while MCP (service role) still works.
GRANT UPDATE ("reflux_severity") ON TABLE "public"."care_events" TO "authenticated";
