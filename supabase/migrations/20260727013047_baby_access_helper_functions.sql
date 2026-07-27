-- Helper functions for the upcoming RLS policies (see .claude/plans/rls.md).
-- SECURITY DEFINER + a pinned search_path: these run as their owner (bypassing
-- the caller's RLS on baby_access/circles_access, which would otherwise
-- recurse — a policy on baby_access can't query baby_access under RLS to
-- check itself) and never resolve unqualified names through a caller-
-- controlled search_path.

CREATE OR REPLACE FUNCTION "public"."is_baby_member"("target_baby_id" "uuid")
RETURNS boolean
LANGUAGE "sql"
SECURITY DEFINER
STABLE
SET "search_path" = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "public"."baby_access"
    WHERE "baby_id" = "target_baby_id" AND "user_id" = "auth"."uid"()
  );
$$;

CREATE OR REPLACE FUNCTION "public"."is_baby_admin"("target_baby_id" "uuid")
RETURNS boolean
LANGUAGE "sql"
SECURITY DEFINER
STABLE
SET "search_path" = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "public"."baby_access"
    WHERE "baby_id" = "target_baby_id" AND "user_id" = "auth"."uid"() AND "access_level" = 'admin'
  );
$$;

-- Mirrors the "no circle assigned = hidden, admin-only" visibility rule
-- applied in app code (withVisibility() in posts.ts, getEvents() in
-- events.ts): visible to a baby's admins, plus anyone in any of the given
-- circles. target_circle_ids is the caller-supplied set of circles a post/
-- event is tagged with (there's no single FK to join through, since that
-- tagging lives in posts_circles/events_circles join tables).
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
      AND "circle_id" = ANY("target_circle_ids")
  );
$$;

-- Used to gate reads of another user's `users` profile row: true if the
-- caller shares at least one baby (any access level) with target_user_id.
CREATE OR REPLACE FUNCTION "public"."shares_baby_with"("target_user_id" "uuid")
RETURNS boolean
LANGUAGE "sql"
SECURITY DEFINER
STABLE
SET "search_path" = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "public"."baby_access" "a"
    JOIN "public"."baby_access" "b" ON "a"."baby_id" = "b"."baby_id"
    WHERE "a"."user_id" = "auth"."uid"() AND "b"."user_id" = "target_user_id"
  );
$$;

ALTER FUNCTION "public"."is_baby_member"("uuid") OWNER TO "postgres";
ALTER FUNCTION "public"."is_baby_admin"("uuid") OWNER TO "postgres";
ALTER FUNCTION "public"."is_circle_visible"("uuid", "uuid"[]) OWNER TO "postgres";
ALTER FUNCTION "public"."shares_baby_with"("uuid") OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_baby_member"("uuid") TO "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_baby_admin"("uuid") TO "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_circle_visible"("uuid", "uuid"[]) TO "anon", "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."shares_baby_with"("uuid") TO "anon", "authenticated", "service_role";
