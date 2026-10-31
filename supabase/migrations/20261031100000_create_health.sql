-- Health: birth date and sex, growth measurements, vaccinations.
-- See .claude/plans/health.md.
--
-- Additive only (new type, tables, policies); no existing table is touched.
-- These tables have had RLS and a full revoke since creation (babies itself has no RLS yet,
-- which is why birth date and sex live in baby_health_profiles and not on babies).
-- Reads: baby members (the app narrows further through page settings).
-- Writes: baby admins only, enforced here and in the app.
-- The baseline's default privileges grant ALL to anon/authenticated on every new table,
-- so each table revokes everything first and grants back only what the app needs.

CREATE TYPE "public"."baby_sex" AS ENUM ('female', 'male');

-- ---------------------------------------------------------------------------
-- baby_health_profiles: one row per baby
-- ---------------------------------------------------------------------------
CREATE TABLE "public"."baby_health_profiles" (
  "baby_id" uuid NOT NULL,
  "birth_date" date,
  "sex" "public"."baby_sex",
  -- Which national vaccine schedule the page shows. Text + CHECK, not an enum: the list grows.
  "vaccine_schedule" text DEFAULT 'fr' NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid,
  CONSTRAINT "baby_health_profiles_pkey" PRIMARY KEY ("baby_id"),
  CONSTRAINT "baby_health_profiles_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE CASCADE,
  CONSTRAINT "baby_health_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  CONSTRAINT "baby_health_profiles_birth_date_range" CHECK ("birth_date" IS NULL OR "birth_date" >= DATE '2000-01-01'),
  CONSTRAINT "baby_health_profiles_vaccine_schedule_check" CHECK ("vaccine_schedule" IN ('fr', 'ca_qc'))
);

ALTER TABLE "public"."baby_health_profiles" OWNER TO "postgres";

ALTER TABLE "public"."baby_health_profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."baby_health_profiles" FROM "anon", "authenticated";
-- No DELETE: the profile is upserted, and goes away with the baby (cascade).
GRANT SELECT, INSERT ON TABLE "public"."baby_health_profiles" TO "authenticated";
-- Column-level UPDATE: policies can't see OLD values, so this is what stops an admin
-- moving a profile to another baby.
GRANT UPDATE ("birth_date", "sex", "vaccine_schedule", "updated_at", "updated_by")
    ON TABLE "public"."baby_health_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."baby_health_profiles" TO "service_role";

CREATE POLICY "baby_health_profiles_select_member" ON "public"."baby_health_profiles"
    FOR SELECT TO "authenticated" USING ("public"."is_baby_member"("baby_id"));
CREATE POLICY "baby_health_profiles_insert_admin" ON "public"."baby_health_profiles"
    FOR INSERT TO "authenticated"
    WITH CHECK ("public"."is_baby_admin"("baby_id") AND "updated_by" = "auth"."uid"());
CREATE POLICY "baby_health_profiles_update_admin" ON "public"."baby_health_profiles"
    FOR UPDATE TO "authenticated"
    USING ("public"."is_baby_admin"("baby_id"))
    WITH CHECK ("public"."is_baby_admin"("baby_id") AND "updated_by" = "auth"."uid"());

-- ---------------------------------------------------------------------------
-- growth_measurements: one row per measuring session, up to three metrics
-- ---------------------------------------------------------------------------
CREATE TABLE "public"."growth_measurements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "baby_id" uuid NOT NULL,
  "measured_on" date NOT NULL,
  "weight_g" integer,
  "length_mm" integer,                  -- recumbent length < 24 months, standing height after
  "head_circumference_mm" integer,
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid,
  CONSTRAINT "growth_measurements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "growth_measurements_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE CASCADE,
  CONSTRAINT "growth_measurements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  CONSTRAINT "growth_measurements_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  CONSTRAINT "growth_measurements_has_value" CHECK (num_nonnulls("weight_g", "length_mm", "head_circumference_mm") > 0),
  CONSTRAINT "growth_measurements_weight_range" CHECK ("weight_g" IS NULL OR "weight_g" BETWEEN 300 AND 40000),
  CONSTRAINT "growth_measurements_length_range" CHECK ("length_mm" IS NULL OR "length_mm" BETWEEN 200 AND 1400),
  CONSTRAINT "growth_measurements_head_range" CHECK ("head_circumference_mm" IS NULL OR "head_circumference_mm" BETWEEN 200 AND 650),
  CONSTRAINT "growth_measurements_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500)
);

ALTER TABLE "public"."growth_measurements" OWNER TO "postgres";

CREATE INDEX "growth_measurements_baby_date_idx" ON "public"."growth_measurements" USING btree ("baby_id", "measured_on" DESC);

ALTER TABLE "public"."growth_measurements" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."growth_measurements" FROM "anon", "authenticated";
GRANT SELECT, INSERT, DELETE ON TABLE "public"."growth_measurements" TO "authenticated";
GRANT UPDATE ("measured_on", "weight_g", "length_mm", "head_circumference_mm", "note", "updated_at", "updated_by")
    ON TABLE "public"."growth_measurements" TO "authenticated";
GRANT ALL ON TABLE "public"."growth_measurements" TO "service_role";

CREATE POLICY "growth_measurements_select_member" ON "public"."growth_measurements"
    FOR SELECT TO "authenticated" USING ("public"."is_baby_member"("baby_id"));
CREATE POLICY "growth_measurements_insert_admin" ON "public"."growth_measurements"
    FOR INSERT TO "authenticated"
    WITH CHECK ("public"."is_baby_admin"("baby_id") AND "created_by" = "auth"."uid"()
        AND ("updated_by" IS NULL OR "updated_by" = "auth"."uid"()));
CREATE POLICY "growth_measurements_update_admin" ON "public"."growth_measurements"
    FOR UPDATE TO "authenticated"
    USING ("public"."is_baby_admin"("baby_id"))
    WITH CHECK ("public"."is_baby_admin"("baby_id") AND "updated_by" = "auth"."uid"());
CREATE POLICY "growth_measurements_delete_admin" ON "public"."growth_measurements"
    FOR DELETE TO "authenticated" USING ("public"."is_baby_admin"("baby_id"));

-- ---------------------------------------------------------------------------
-- vaccinations: shots given
-- ---------------------------------------------------------------------------
CREATE TABLE "public"."vaccinations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "baby_id" uuid NOT NULL,
  "vaccine_code" text NOT NULL,         -- validated in the app against VACCINES (vaccine-schedule.ts)
  "vaccine_label" text,                 -- required when vaccine_code = 'other'
  "dose_number" smallint,
  "given_on" date NOT NULL,
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid,
  CONSTRAINT "vaccinations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vaccinations_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE CASCADE,
  CONSTRAINT "vaccinations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  CONSTRAINT "vaccinations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  -- Text, not an enum: the French list changes (2025 replaced MenC with MenACWY and added MenB).
  CONSTRAINT "vaccinations_code_format" CHECK ("vaccine_code" ~ '^[a-z0-9_]{1,40}$'),
  CONSTRAINT "vaccinations_other_has_label" CHECK ("vaccine_code" <> 'other' OR "vaccine_label" IS NOT NULL),
  CONSTRAINT "vaccinations_label_length" CHECK ("vaccine_label" IS NULL OR char_length("vaccine_label") BETWEEN 1 AND 100),
  CONSTRAINT "vaccinations_dose_range" CHECK ("dose_number" IS NULL OR "dose_number" BETWEEN 1 AND 10),
  CONSTRAINT "vaccinations_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500)
);

ALTER TABLE "public"."vaccinations" OWNER TO "postgres";

CREATE INDEX "vaccinations_baby_date_idx" ON "public"."vaccinations" USING btree ("baby_id", "given_on" DESC);
-- One record per (vaccine, dose): a double tap or a duplicate MCP call fails with 23505,
-- which the app reports as duplicateDose.
CREATE UNIQUE INDEX "vaccinations_one_per_dose" ON "public"."vaccinations" ("baby_id", "vaccine_code", "dose_number")
  WHERE "dose_number" IS NOT NULL AND "vaccine_code" <> 'other';

ALTER TABLE "public"."vaccinations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."vaccinations" FROM "anon", "authenticated";
GRANT SELECT, INSERT, DELETE ON TABLE "public"."vaccinations" TO "authenticated";
GRANT UPDATE ("vaccine_code", "vaccine_label", "dose_number", "given_on", "note", "updated_at", "updated_by")
    ON TABLE "public"."vaccinations" TO "authenticated";
GRANT ALL ON TABLE "public"."vaccinations" TO "service_role";

CREATE POLICY "vaccinations_select_member" ON "public"."vaccinations"
    FOR SELECT TO "authenticated" USING ("public"."is_baby_member"("baby_id"));
CREATE POLICY "vaccinations_insert_admin" ON "public"."vaccinations"
    FOR INSERT TO "authenticated"
    WITH CHECK ("public"."is_baby_admin"("baby_id") AND "created_by" = "auth"."uid"()
        AND ("updated_by" IS NULL OR "updated_by" = "auth"."uid"()));
CREATE POLICY "vaccinations_update_admin" ON "public"."vaccinations"
    FOR UPDATE TO "authenticated"
    USING ("public"."is_baby_admin"("baby_id"))
    WITH CHECK ("public"."is_baby_admin"("baby_id") AND "updated_by" = "auth"."uid"());
CREATE POLICY "vaccinations_delete_admin" ON "public"."vaccinations"
    FOR DELETE TO "authenticated" USING ("public"."is_baby_admin"("baby_id"));
