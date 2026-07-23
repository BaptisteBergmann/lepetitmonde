CREATE TYPE "public"."notification_type" AS ENUM (
    'new_post',
    'new_comment',
    'new_pronostic',
    'new_member',
    'new_reaction',
    'new_milestone'
);

ALTER TYPE "public"."notification_type" OWNER TO "postgres";

-- Sparse opt-out table: the absence of a row means the type is enabled.
-- Keeps new notification types defaulting to "on" for everyone without a
-- backfill migration every time the enum grows.
CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "baby_id" "uuid" NOT NULL,
    "notification_type" "public"."notification_type" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";

ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id", "baby_id", "notification_type");

ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE CASCADE;

GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";

-- Single global quiet-hours window per user (not per baby) — assumes one
-- household timezone (Europe/Paris), no per-user timezone field.
CREATE TABLE IF NOT EXISTS "public"."notification_settings" (
    "user_id" "uuid" NOT NULL,
    "quiet_hours_start" time without time zone,
    "quiet_hours_end" time without time zone
);

ALTER TABLE "public"."notification_settings" OWNER TO "postgres";

ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

GRANT ALL ON TABLE "public"."notification_settings" TO "anon";
GRANT ALL ON TABLE "public"."notification_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_settings" TO "service_role";
