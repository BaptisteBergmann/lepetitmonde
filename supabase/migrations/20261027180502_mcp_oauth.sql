-- OAuth 2.1 for the MCP endpoint: dynamically registered clients and one grant row per
-- approved authorization (single-use code, then the current access/refresh pair). Only
-- sha256 hashes are stored. Both tables are reachable only through the service role:
-- RLS on, no policies, no grants for anon/authenticated (same as api_tokens).

CREATE TABLE IF NOT EXISTS "public"."oauth_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_name" character varying(100) NOT NULL,
    "redirect_uris" "text"[] NOT NULL,
    "token_endpoint_auth_method" "text" NOT NULL,
    "client_secret_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "oauth_clients_redirect_uris_check" CHECK (cardinality("redirect_uris") BETWEEN 1 AND 5),
    CONSTRAINT "oauth_clients_auth_method_check" CHECK ("token_endpoint_auth_method" IN ('none', 'client_secret_post', 'client_secret_basic')),
    CONSTRAINT "oauth_clients_secret_check" CHECK (("token_endpoint_auth_method" = 'none') = ("client_secret_hash" IS NULL))
);

CREATE TABLE IF NOT EXISTS "public"."oauth_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "scope" "text" NOT NULL,
    "resource" "text" NOT NULL,
    "redirect_uri" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "code_challenge" "text" NOT NULL,
    "code_expires_at" timestamp with time zone NOT NULL,
    "code_used_at" timestamp with time zone,
    "access_token_hash" "text",
    "access_expires_at" timestamp with time zone,
    "refresh_token_hash" "text",
    "refresh_expires_at" timestamp with time zone,
    "previous_refresh_token_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "oauth_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "oauth_grants_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "oauth_grants_client_id_fkey" FOREIGN KEY ("client_id")
        REFERENCES "public"."oauth_clients"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."oauth_clients" OWNER TO "postgres";
ALTER TABLE "public"."oauth_grants" OWNER TO "postgres";

CREATE UNIQUE INDEX "oauth_grants_code_hash_key" ON "public"."oauth_grants" USING "btree" ("code_hash");
CREATE UNIQUE INDEX "oauth_grants_access_token_hash_key" ON "public"."oauth_grants" USING "btree" ("access_token_hash");
CREATE UNIQUE INDEX "oauth_grants_refresh_token_hash_key" ON "public"."oauth_grants" USING "btree" ("refresh_token_hash");
CREATE INDEX "oauth_grants_previous_refresh_token_hash_idx" ON "public"."oauth_grants" USING "btree" ("previous_refresh_token_hash");
CREATE INDEX "oauth_grants_user_id_idx" ON "public"."oauth_grants" USING "btree" ("user_id");
CREATE INDEX "oauth_grants_client_id_idx" ON "public"."oauth_grants" USING "btree" ("client_id");

ALTER TABLE "public"."oauth_clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."oauth_grants" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."oauth_clients" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."oauth_grants" FROM "anon", "authenticated";
GRANT ALL ON TABLE "public"."oauth_clients" TO "service_role";
GRANT ALL ON TABLE "public"."oauth_grants" TO "service_role";

-- Same rule as api_tokens: a user who stops administering any baby loses every
-- active OAuth connection too. The existing triggers already call this function.
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

    UPDATE "public"."oauth_grants"
    SET "revoked_at" = now()
    WHERE "user_id" = OLD."user_id" AND "revoked_at" IS NULL;
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."revoke_api_tokens_on_admin_loss"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."revoke_api_tokens_on_admin_loss"() FROM PUBLIC, "anon", "authenticated";
