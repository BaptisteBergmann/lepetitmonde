ALTER TABLE "public"."guess_questions"
    ADD COLUMN "position" integer NOT NULL DEFAULT 0;

WITH "ranked" AS (
    SELECT "baby_id", "id",
        row_number() OVER (PARTITION BY "baby_id" ORDER BY "created_at" ASC) AS "rn"
    FROM "public"."guess_questions"
)
UPDATE "public"."guess_questions" AS "q"
SET "position" = "ranked"."rn"
FROM "ranked"
WHERE "q"."baby_id" = "ranked"."baby_id" AND "q"."id" = "ranked"."id";
