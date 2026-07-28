-- Lets members opt out of the weekly Gazette digest email the same way they
-- opt out of any other notification type, via the existing sparse
-- notification_preferences table (see 20260723132603_notification_preferences.sql).
ALTER TYPE "public"."notification_type" ADD VALUE 'gazette_digest';
