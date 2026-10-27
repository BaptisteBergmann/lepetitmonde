-- Personal API tokens for the MCP endpoint (/api/mcp). Only the sha256 of a token is
-- stored; the token itself is shown once at creation. The table is reachable only
-- through the service role: RLS on, no policies, and no grants for anon/authenticated
-- (the baseline's default privileges would otherwise give both of them ALL).

CREATE TABLE IF NOT EXISTS "public"."api_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" character varying(50) NOT NULL,
    "token_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "api_tokens_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "public"."api_tokens" OWNER TO "postgres";

CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "public"."api_tokens" USING "btree" ("token_hash");
CREATE INDEX "api_tokens_user_id_idx" ON "public"."api_tokens" USING "btree" ("user_id");

ALTER TABLE "public"."api_tokens" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."api_tokens" FROM "anon", "authenticated";
GRANT ALL ON TABLE "public"."api_tokens" TO "service_role";

-- A token is only meant for people who administer a baby. When a user stops being an
-- admin of any baby (downgraded, removed, or removed by a cascade), all of their
-- active tokens are revoked. Done in the database so it holds whichever code path
-- changes baby_access. SECURITY DEFINER + pinned search_path, as the is_baby_* helpers.
CREATE OR REPLACE FUNCTION "public"."revoke_api_tokens_on_admin_loss"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = ''
AS $$
BEGIN
  IF OLD."access_level" = 'admin' THEN
    UPDATE "public"."api_tokens"
    SET "revoked_at" = now()
    WHERE "user_id" = OLD."user_id" AND "revoked_at" IS NULL;
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."revoke_api_tokens_on_admin_loss"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."revoke_api_tokens_on_admin_loss"() FROM PUBLIC, "anon", "authenticated";

CREATE TRIGGER "baby_access_revoke_api_tokens_on_downgrade"
AFTER UPDATE OF "access_level" ON "public"."baby_access"
FOR EACH ROW
WHEN (OLD."access_level" = 'admin' AND NEW."access_level" IS DISTINCT FROM OLD."access_level")
EXECUTE FUNCTION "public"."revoke_api_tokens_on_admin_loss"();

CREATE TRIGGER "baby_access_revoke_api_tokens_on_delete"
AFTER DELETE ON "public"."baby_access"
FOR EACH ROW
EXECUTE FUNCTION "public"."revoke_api_tokens_on_admin_loss"();
