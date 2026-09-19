ALTER TABLE "public"."guess_questions"
    ADD COLUMN "correct_answer" jsonb,
    ADD COLUMN "resolved_at" timestamptz;
