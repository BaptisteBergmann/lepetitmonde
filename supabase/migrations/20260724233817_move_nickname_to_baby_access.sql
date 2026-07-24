ALTER TABLE "public"."baby_access" ADD COLUMN "nickname" character varying;

UPDATE "public"."baby_access" ba
SET "nickname" = u."nickname"
FROM "public"."users" u
WHERE ba."user_id" = u."id";

ALTER TABLE "public"."users" DROP COLUMN "nickname";
