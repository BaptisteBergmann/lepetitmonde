-- Tracks the digest window for the Gazette cron job (null = never sent, so
-- the first run covers the last 7 days rather than every post ever made).
ALTER TABLE "public"."babies" ADD COLUMN "last_gazette_sent_at" timestamp with time zone;
