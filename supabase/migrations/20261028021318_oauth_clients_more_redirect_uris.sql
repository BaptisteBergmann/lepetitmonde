-- Gemini's web app registers several user-bound redirect URIs on
-- oauth-redirect.googleusercontent.com in one request, more than the original cap of 5.

ALTER TABLE "public"."oauth_clients" DROP CONSTRAINT "oauth_clients_redirect_uris_check";
ALTER TABLE "public"."oauth_clients"
    ADD CONSTRAINT "oauth_clients_redirect_uris_check" CHECK (cardinality("redirect_uris") BETWEEN 1 AND 10);
