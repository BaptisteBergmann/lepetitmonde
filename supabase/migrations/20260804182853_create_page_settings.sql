CREATE TABLE "public"."page_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "baby_id" uuid NOT NULL,
  "page_id" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "required_role" "public"."role" DEFAULT 'viewer' NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE "public"."page_settings" OWNER TO "postgres";

ALTER TABLE ONLY "public"."page_settings"
    ADD CONSTRAINT "page_settings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."page_settings"
    ADD CONSTRAINT "page_settings_baby_id_page_id_key" UNIQUE ("baby_id", "page_id");

ALTER TABLE ONLY "public"."page_settings"
    ADD CONSTRAINT "page_settings_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE CASCADE;

GRANT ALL ON TABLE "public"."page_settings" TO "anon";
GRANT ALL ON TABLE "public"."page_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."page_settings" TO "service_role";
