CREATE TABLE "public"."bug_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT auth.uid() NOT NULL,
  "description" text NOT NULL,
  "page_url" character varying,
  "user_agent" character varying,
  "screenshot_path" character varying
);

ALTER TABLE "public"."bug_reports" OWNER TO "postgres";

ALTER TABLE ONLY "public"."bug_reports"
    ADD CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."bug_reports"
    ADD CONSTRAINT "bug_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

GRANT ALL ON TABLE "public"."bug_reports" TO "anon";
GRANT ALL ON TABLE "public"."bug_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."bug_reports" TO "service_role";
