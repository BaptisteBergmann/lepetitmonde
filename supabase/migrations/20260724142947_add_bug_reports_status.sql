CREATE TYPE "public"."bug_report_status" AS ENUM (
    'new',
    'reviewed',
    'fixed'
);

ALTER TABLE "public"."bug_reports"
    ADD COLUMN "status" "public"."bug_report_status" DEFAULT 'new'::"public"."bug_report_status" NOT NULL;
