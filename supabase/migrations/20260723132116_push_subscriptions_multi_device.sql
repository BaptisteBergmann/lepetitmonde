-- push_subscriptions previously had no unique key besides its own auto id,
-- so "subscribing" the same browser twice just inserted a second row, and
-- unsubscribing deleted every row for the user (all devices at once, not
-- just the current one). Add `endpoint` (unique per browser subscription)
-- so upserts and deletes can target one specific device.

ALTER TABLE "public"."push_subscriptions"
    ADD COLUMN "endpoint" "text",
    ADD COLUMN "device_label" character varying,
    ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL;

UPDATE "public"."push_subscriptions"
SET "endpoint" = "subscription" ->> 'endpoint';

-- Existing rows predating this column may collide/duplicate on endpoint if
-- the same device subscribed more than once under the old behavior; keep
-- only the most recent row per endpoint before enforcing uniqueness.
DELETE FROM "public"."push_subscriptions" a
USING "public"."push_subscriptions" b
WHERE a."endpoint" = b."endpoint"
  AND a."id" < b."id";

ALTER TABLE "public"."push_subscriptions" ALTER COLUMN "endpoint" SET NOT NULL;

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");
