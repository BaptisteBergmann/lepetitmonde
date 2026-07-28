-- Reverts the Gazette feature's schema changes: on reflection, emailing baby
-- photos/captions off the self-hosted server undercuts the whole point of
-- self-hosting, so the feature (built in 20260728135131 / 20260728135159) is
-- being scrapped before it shipped to any real user.

ALTER TABLE "public"."babies" DROP COLUMN "last_gazette_sent_at";

-- Postgres can't drop a single enum value directly, so the type is recreated
-- without it. Safe here: confirmed zero notification_preferences rows use
-- 'gazette_digest' (the toggle was added but never surfaced to end users).
ALTER TYPE "public"."notification_type" RENAME TO "notification_type_old";

CREATE TYPE "public"."notification_type" AS ENUM (
    'new_post',
    'new_comment',
    'new_pronostic',
    'new_member',
    'new_reaction',
    'new_life_stage',
    'circle_access_granted'
);

ALTER TABLE "public"."notification_preferences"
  ALTER COLUMN "notification_type" TYPE "public"."notification_type"
  USING "notification_type"::"text"::"public"."notification_type";

ALTER TABLE "public"."notifications"
  ALTER COLUMN "notification_type" TYPE "public"."notification_type"
  USING "notification_type"::"text"::"public"."notification_type";

DROP TYPE "public"."notification_type_old";
