-- Circle hierarchy (see .claude/plans/circle-hierarchy.md).
-- Circles form a tree through circles.parent_circle (max depth 3, same baby), and a
-- user may be a direct member of at most ONE circle per tree. A circle shared with
-- is visible to the members of that circle and of every circle below it.

-- 1. Preflight: the column was never written and every circle has a baby. Stop (don't
--    silently clean up) if that is not true so the data can be looked at first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "public"."circles" WHERE "parent_circle" IS NOT NULL) THEN
    RAISE EXCEPTION 'circle_hierarchy preflight: circles.parent_circle is already used';
  END IF;
  IF EXISTS (SELECT 1 FROM "public"."circles" WHERE "baby_id" IS NULL) THEN
    RAISE EXCEPTION 'circle_hierarchy preflight: circles without baby_id exist';
  END IF;
END $$;

-- 2-3. A composite FK needs a unique target.
ALTER TABLE "public"."circles" ALTER COLUMN "baby_id" SET NOT NULL;
ALTER TABLE "public"."circles" ADD CONSTRAINT "circles_id_baby_id_key" UNIQUE ("id", "baby_id");

-- 4. A parent must belong to the same baby. The column list keeps baby_id from being
--    nulled; it is only a backstop since the delete trigger re-parents children first.
ALTER TABLE "public"."circles" DROP CONSTRAINT "circles_parent_circle_fkey";
ALTER TABLE "public"."circles"
  ADD CONSTRAINT "circles_parent_same_baby_fkey"
  FOREIGN KEY ("parent_circle", "baby_id") REFERENCES "public"."circles"("id", "baby_id")
  ON DELETE SET NULL ("parent_circle");

-- 5-6.
ALTER TABLE "public"."circles"
  ADD CONSTRAINT "circles_parent_not_self" CHECK ("parent_circle" IS DISTINCT FROM "id");
CREATE INDEX "circles_parent_circle_idx" ON "public"."circles" ("parent_circle");
CREATE INDEX IF NOT EXISTS "circles_baby_id_idx" ON "public"."circles" ("baby_id");

-- 9. Every circle at or below the given ones. The depth guard is a safety net.
CREATE OR REPLACE FUNCTION "public"."circle_descendants_or_self"("target_circle_ids" "uuid"[])
RETURNS SETOF "uuid"
LANGUAGE "sql"
SECURITY DEFINER
STABLE
SET "search_path" = ''
AS $$
  WITH RECURSIVE "tree"("id", "depth") AS (
    SELECT "c"."id", 1 FROM "public"."circles" "c" WHERE "c"."id" = ANY("target_circle_ids")
    UNION
    SELECT "c"."id", "t"."depth" + 1
    FROM "public"."circles" "c" JOIN "tree" "t" ON "c"."parent_circle" = "t"."id"
    WHERE "t"."depth" < 10
  )
  SELECT DISTINCT "id" FROM "tree";
$$;

-- 7. Tree integrity: cycles, depth, and "one circle per tree" when a circle moves.
CREATE OR REPLACE FUNCTION "public"."circles_check_hierarchy"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = ''
AS $$
DECLARE
  "parent_depth" integer;
  "subtree_height" integer;
  "new_root" uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW."parent_circle" IS NOT DISTINCT FROM OLD."parent_circle"
     AND NEW."baby_id" IS NOT DISTINCT FROM OLD."baby_id" THEN
    RETURN NEW;
  END IF;

  -- Serialize tree edits (and membership edits, see circles_access_check_tree) per baby.
  PERFORM pg_advisory_xact_lock(hashtextextended('circles:' || NEW."baby_id"::text, 0));

  IF TG_OP = 'UPDATE' AND NEW."baby_id" IS DISTINCT FROM OLD."baby_id" THEN
    IF OLD."parent_circle" IS NOT NULL
       OR EXISTS (SELECT 1 FROM "public"."circles" WHERE "parent_circle" = OLD."id") THEN
      RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'circle_hierarchy_baby';
    END IF;
  END IF;

  IF NEW."parent_circle" IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cycle: walking up from the new parent must never reach this circle.
  IF EXISTS (
    WITH RECURSIVE "up"("id", "parent_circle", "depth") AS (
      SELECT "c"."id", "c"."parent_circle", 1 FROM "public"."circles" "c" WHERE "c"."id" = NEW."parent_circle"
      UNION ALL
      SELECT "c"."id", "c"."parent_circle", "u"."depth" + 1
      FROM "public"."circles" "c" JOIN "up" "u" ON "c"."id" = "u"."parent_circle"
      WHERE "u"."depth" < 10
    )
    SELECT 1 FROM "up" WHERE "id" = NEW."id"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'circle_hierarchy_cycle';
  END IF;

  -- Depth: the moved circle's whole subtree has to fit under the new parent.
  WITH RECURSIVE "up"("id", "parent_circle", "depth") AS (
    SELECT "c"."id", "c"."parent_circle", 1 FROM "public"."circles" "c" WHERE "c"."id" = NEW."parent_circle"
    UNION ALL
    SELECT "c"."id", "c"."parent_circle", "u"."depth" + 1
    FROM "public"."circles" "c" JOIN "up" "u" ON "c"."id" = "u"."parent_circle"
    WHERE "u"."depth" < 10
  )
  SELECT max("depth") INTO "parent_depth" FROM "up";

  WITH RECURSIVE "down"("id", "depth") AS (
    SELECT NEW."id", 1
    UNION ALL
    SELECT "c"."id", "d"."depth" + 1
    FROM "public"."circles" "c" JOIN "down" "d" ON "c"."parent_circle" = "d"."id"
    WHERE "d"."depth" < 10
  )
  SELECT max("depth") INTO "subtree_height" FROM "down";

  IF COALESCE("parent_depth", 0) + COALESCE("subtree_height", 1) > 3 THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'circle_hierarchy_depth';
  END IF;

  -- One circle per tree: nobody may be a direct member of both the moved subtree and
  -- the rest of the destination tree. (A move inside one tree can't trip this, since
  -- the invariant already holds there.)
  WITH RECURSIVE "up"("id", "parent_circle", "depth") AS (
    SELECT "c"."id", "c"."parent_circle", 1 FROM "public"."circles" "c" WHERE "c"."id" = NEW."parent_circle"
    UNION ALL
    SELECT "c"."id", "c"."parent_circle", "x"."depth" + 1
    FROM "public"."circles" "c" JOIN "up" "x" ON "c"."id" = "x"."parent_circle"
    WHERE "x"."depth" < 10
  )
  SELECT "id" INTO "new_root" FROM "up" WHERE "parent_circle" IS NULL;

  IF EXISTS (
    WITH RECURSIVE
      "moved"("id", "depth") AS (
        SELECT NEW."id", 1
        UNION ALL
        SELECT "c"."id", "m"."depth" + 1
        FROM "public"."circles" "c" JOIN "moved" "m" ON "c"."parent_circle" = "m"."id"
        WHERE "m"."depth" < 10
      ),
      "dest"("id", "depth") AS (
        SELECT "new_root", 1
        UNION ALL
        SELECT "c"."id", "d"."depth" + 1
        FROM "public"."circles" "c" JOIN "dest" "d" ON "c"."parent_circle" = "d"."id"
        WHERE "d"."depth" < 10
      )
    SELECT 1
    FROM "public"."circles_access" "a"
    JOIN "public"."circles_access" "b" ON "a"."user_id" = "b"."user_id"
    WHERE "a"."circle_id" IN (SELECT "id" FROM "moved")
      AND "b"."circle_id" IN (SELECT "id" FROM "dest" WHERE "id" NOT IN (SELECT "id" FROM "moved"))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'circle_membership_conflict';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "circles_check_hierarchy_trigger"
  BEFORE INSERT OR UPDATE OF "parent_circle", "baby_id" ON "public"."circles"
  FOR EACH ROW EXECUTE FUNCTION "public"."circles_check_hierarchy"();

-- 8. Deleting a circle moves its children up one level (their depth only shrinks, so
--    the checks above can't fail). SECURITY DEFINER so it works whoever deletes.
CREATE OR REPLACE FUNCTION "public"."circles_reparent_children"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = ''
AS $$
BEGIN
  UPDATE "public"."circles" SET "parent_circle" = OLD."parent_circle" WHERE "parent_circle" = OLD."id";
  RETURN OLD;
END;
$$;

CREATE TRIGGER "circles_reparent_children_trigger"
  BEFORE DELETE ON "public"."circles"
  FOR EACH ROW EXECUTE FUNCTION "public"."circles_reparent_children"();

-- "One circle per tree" for membership rows (insert, or a move through UPDATE circle_id).
CREATE OR REPLACE FUNCTION "public"."circles_access_check_tree"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = ''
AS $$
DECLARE
  "target_baby" uuid;
  "root" uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."circle_id" IS NOT DISTINCT FROM OLD."circle_id" THEN
    RETURN NEW;
  END IF;

  SELECT "baby_id" INTO "target_baby" FROM "public"."circles" WHERE "id" = NEW."circle_id";
  IF "target_baby" IS NULL THEN
    RETURN NEW; -- the circle FK reports the missing circle
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('circles:' || "target_baby"::text, 0));

  WITH RECURSIVE "up"("id", "parent_circle", "depth") AS (
    SELECT "c"."id", "c"."parent_circle", 1 FROM "public"."circles" "c" WHERE "c"."id" = NEW."circle_id"
    UNION ALL
    SELECT "c"."id", "c"."parent_circle", "u"."depth" + 1
    FROM "public"."circles" "c" JOIN "up" "u" ON "c"."id" = "u"."parent_circle"
    WHERE "u"."depth" < 10
  )
  SELECT "id" INTO "root" FROM "up" WHERE "parent_circle" IS NULL;

  IF EXISTS (
    WITH RECURSIVE "tree"("id", "depth") AS (
      SELECT "root", 1
      UNION ALL
      SELECT "c"."id", "t"."depth" + 1
      FROM "public"."circles" "c" JOIN "tree" "t" ON "c"."parent_circle" = "t"."id"
      WHERE "t"."depth" < 10
    )
    SELECT 1 FROM "public"."circles_access" "a"
    WHERE "a"."user_id" = NEW."user_id"
      AND "a"."id" IS DISTINCT FROM NEW."id"
      AND "a"."circle_id" IN (SELECT "id" FROM "tree")
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'circle_membership_same_tree';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "circles_access_check_tree_trigger"
  BEFORE INSERT OR UPDATE OF "circle_id" ON "public"."circles_access"
  FOR EACH ROW EXECUTE FUNCTION "public"."circles_access_check_tree"();

-- Existing data can't conflict (every circle is a root, so a tree is one circle and
-- the primary key already prevents duplicates), but assert it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "public"."circles" WHERE "parent_circle" IS NOT NULL)
     OR EXISTS (
       SELECT 1 FROM "public"."circles_access" GROUP BY "user_id", "circle_id" HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION 'circle_hierarchy: unexpected tree data after migration';
  END IF;
END $$;

-- 10. Same signature; the rule now includes sub-circles of the tagged circles.
CREATE OR REPLACE FUNCTION "public"."is_circle_visible"("target_baby_id" "uuid", "target_circle_ids" "uuid"[])
RETURNS boolean
LANGUAGE "sql"
SECURITY DEFINER
STABLE
SET "search_path" = ''
AS $$
  SELECT "public"."is_baby_admin"("target_baby_id") OR EXISTS (
    SELECT 1 FROM "public"."circles_access"
    WHERE "baby_id" = "target_baby_id"
      AND "user_id" = "auth"."uid"()
      AND "circle_id" IN (SELECT "public"."circle_descendants_or_self"("target_circle_ids"))
  );
$$;

-- 11. The baseline default privileges grant EXECUTE to anon/authenticated on new
--     functions. These are internal: only the owner (definer chain) and service_role.
ALTER FUNCTION "public"."circle_descendants_or_self"("uuid"[]) OWNER TO "postgres";
ALTER FUNCTION "public"."circles_check_hierarchy"() OWNER TO "postgres";
ALTER FUNCTION "public"."circles_reparent_children"() OWNER TO "postgres";
ALTER FUNCTION "public"."circles_access_check_tree"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."circle_descendants_or_self"("uuid"[]) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."circles_check_hierarchy"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."circles_reparent_children"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."circles_access_check_tree"() FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."circle_descendants_or_self"("uuid"[]) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."circles_check_hierarchy"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."circles_reparent_children"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."circles_access_check_tree"() TO "service_role";
