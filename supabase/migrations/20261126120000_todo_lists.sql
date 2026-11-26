-- To-do lists: several named lists per baby, items belong to one list.
-- See .claude/plans/todo-lists.md.
--
-- Additive: todo_lists is new; todo_items gains list_id and done_at, and position widens
-- from integer to double precision (so an item can be inserted between two others).
-- todo_items itself gets no RLS here: the app-wide RLS rollout owns that table.
-- todo_lists has RLS and a full revoke from creation, like the health tables: the baseline's
-- default privileges grant ALL to anon/authenticated on every new table.
-- To-do is admin-only in the app, so every policy uses is_baby_admin.

CREATE TABLE "public"."todo_lists" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "baby_id" uuid NOT NULL,
  "name" text NOT NULL,
  "position" double precision NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid,
  CONSTRAINT "todo_lists_pkey" PRIMARY KEY ("id"),
  -- Target of the composite FK from todo_items: an item can't point at another baby's list.
  CONSTRAINT "todo_lists_id_baby_id_key" UNIQUE ("id", "baby_id"),
  CONSTRAINT "todo_lists_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE CASCADE,
  CONSTRAINT "todo_lists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  CONSTRAINT "todo_lists_name_length" CHECK (char_length("name") BETWEEN 1 AND 60)
);

ALTER TABLE "public"."todo_lists" OWNER TO "postgres";

CREATE INDEX "todo_lists_baby_position_idx" ON "public"."todo_lists" USING btree ("baby_id", "position");

ALTER TABLE "public"."todo_lists" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."todo_lists" FROM "anon", "authenticated";
GRANT SELECT, INSERT, DELETE ON TABLE "public"."todo_lists" TO "authenticated";
-- Column-level UPDATE: policies can't see OLD values, so this is what stops an admin
-- moving a list to another baby.
GRANT UPDATE ("name", "position") ON TABLE "public"."todo_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."todo_lists" TO "service_role";

CREATE POLICY "todo_lists_select_admin" ON "public"."todo_lists"
    FOR SELECT TO "authenticated" USING ("public"."is_baby_admin"("baby_id"));
CREATE POLICY "todo_lists_insert_admin" ON "public"."todo_lists"
    FOR INSERT TO "authenticated"
    WITH CHECK ("public"."is_baby_admin"("baby_id") AND "created_by" = "auth"."uid"());
CREATE POLICY "todo_lists_update_admin" ON "public"."todo_lists"
    FOR UPDATE TO "authenticated"
    USING ("public"."is_baby_admin"("baby_id"))
    WITH CHECK ("public"."is_baby_admin"("baby_id"));
CREATE POLICY "todo_lists_delete_admin" ON "public"."todo_lists"
    FOR DELETE TO "authenticated" USING ("public"."is_baby_admin"("baby_id"));

-- ---------------------------------------------------------------------------
-- todo_items: list_id, done_at, fractional position
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."todo_items"
  ADD COLUMN "list_id" uuid,
  ADD COLUMN "done_at" timestamptz,
  ALTER COLUMN "position" TYPE double precision USING "position"::double precision;

-- Backfill: one list per baby that already has items, named after the old single list.
INSERT INTO "public"."todo_lists" ("baby_id", "name", "position", "created_by")
SELECT DISTINCT ON ("baby_id") "baby_id", 'À faire', 1, "created_by"
FROM "public"."todo_items"
ORDER BY "baby_id", "created_at" ASC;

UPDATE "public"."todo_items" AS i
SET "list_id" = l."id"
FROM "public"."todo_lists" AS l
WHERE l."baby_id" = i."baby_id";

-- The real completion date was never stored (done_at was dropped earlier): best guess.
UPDATE "public"."todo_items" SET "done_at" = "created_at" WHERE "done";

ALTER TABLE "public"."todo_items" ALTER COLUMN "list_id" SET NOT NULL;
ALTER TABLE "public"."todo_items"
  ADD CONSTRAINT "todo_items_list_fkey" FOREIGN KEY ("list_id", "baby_id")
    REFERENCES "public"."todo_lists"("id", "baby_id") ON DELETE CASCADE,
  ADD CONSTRAINT "todo_items_done_at_check" CHECK ("done" = ("done_at" IS NOT NULL));

CREATE INDEX "todo_items_list_position_idx" ON "public"."todo_items" USING btree ("list_id", "position");
