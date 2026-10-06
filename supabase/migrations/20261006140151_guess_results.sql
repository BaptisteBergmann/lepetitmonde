-- Pronostic results (see .claude/plans/guess-validation-leaderboard.md).
-- Additive only. Points are computed at read time from these columns, so
-- nothing derived is stored and deleting/overriding a guess can't leave
-- stale scores behind.
--
-- resolved_at IS NOT NULL means the question is closed and its results are
-- visible to every member. correct_answer uses the same JSON shape as
-- guesses.answer for the question's type.
ALTER TABLE "public"."guess_questions"
    ADD COLUMN "correct_answer" jsonb,
    ADD COLUMN "resolved_at" timestamptz;

-- is_correct: null = automatic match; true/false = admin override (only
-- meaningful for free-text questions). is_funny is a badge, never points.
ALTER TABLE "public"."guesses"
    ADD COLUMN "is_correct" boolean,
    ADD COLUMN "is_funny" boolean DEFAULT false NOT NULL;
