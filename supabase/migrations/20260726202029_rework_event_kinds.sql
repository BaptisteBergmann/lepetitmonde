ALTER TYPE "public"."event_kind" RENAME VALUE 'custom' TO 'occasion';
ALTER TYPE "public"."event_kind" RENAME VALUE 'milestone' TO 'life_stage';
ALTER TYPE "public"."event_kind" ADD VALUE 'medical';

ALTER TYPE "public"."notification_type" RENAME VALUE 'new_milestone' TO 'new_life_stage';

ALTER TABLE "public"."events" ALTER COLUMN "kind" SET DEFAULT 'occasion';
ALTER TABLE "public"."events" ADD COLUMN "event_time" time without time zone;
