-- Simplify todo_items to a plain ordered checklist (see .claude/plans/todo.md):
-- a done flag + manual position instead of notes/due dates/completion audit.
-- The table was created moments earlier and holds no rows yet, so the NOT NULL
-- position column needs no backfill.
ALTER TABLE "public"."todo_items"
    DROP COLUMN "notes",
    DROP COLUMN "due_date",
    DROP COLUMN "done_at",
    DROP COLUMN "done_by",
    ADD COLUMN "done" boolean DEFAULT false NOT NULL,
    ADD COLUMN "position" integer NOT NULL;
