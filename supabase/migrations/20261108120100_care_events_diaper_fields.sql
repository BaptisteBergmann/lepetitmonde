-- Diaper changes: typed columns for the diaper kind. See .claude/plans/diaper-changes.md.
-- Additive only. RLS and the anon revoke on care_events already apply.

CREATE TYPE "public"."diaper_poop_color" AS ENUM ('black', 'green', 'yellow', 'brown', 'red', 'white');
CREATE TYPE "public"."diaper_poop_texture" AS ENUM ('liquid', 'seedy', 'soft', 'formed', 'hard');

ALTER TABLE "public"."care_events"
  ADD COLUMN "pee" boolean,
  ADD COLUMN "poop" boolean,
  ADD COLUMN "poop_color" "public"."diaper_poop_color",
  ADD COLUMN "poop_texture" "public"."diaper_poop_texture",
  ADD CONSTRAINT "care_events_diaper_fields" CHECK ("kind" <> 'diaper' OR (
    "pee" IS NOT NULL AND "poop" IS NOT NULL AND ("pee" OR "poop")
    AND "ended_at" IS NULL AND NOT "ongoing"
    AND "breast_side" IS NULL AND "amount_ml" IS NULL
    AND ("poop" OR ("poop_color" IS NULL AND "poop_texture" IS NULL))
  )),
  -- Covers the other kinds so their existing per-kind CHECKs stay untouched.
  ADD CONSTRAINT "care_events_diaper_columns_only_diaper" CHECK ("kind" = 'diaper' OR (
    "pee" IS NULL AND "poop" IS NULL AND "poop_color" IS NULL AND "poop_texture" IS NULL
  ));

-- Column-level UPDATE: without this the web edit fails while MCP (service role) still works.
GRANT UPDATE ("pee", "poop", "poop_color", "poop_texture")
    ON TABLE "public"."care_events" TO "authenticated";
