-- share_links revoked only `anon`; the baseline's ALTER DEFAULT PRIVILEGES still gave
-- `authenticated` ALL (incl. TRUNCATE/REFERENCES/TRIGGER) on both new tables. Grant back
-- only what the app uses with the user's session:
--   album_share_photos   — admins attach (INSERT), read and detach (DELETE) photos; never updated.
--   album_share_accesses — admins read the visit log; writes and pruning go through the service role.
-- FK cascades from album_shares run as the table owner, so they don't need these grants.
REVOKE ALL ON TABLE "public"."album_share_photos", "public"."album_share_accesses" FROM "authenticated";
GRANT SELECT, INSERT, DELETE ON TABLE "public"."album_share_photos" TO "authenticated";
GRANT SELECT ON TABLE "public"."album_share_accesses" TO "authenticated";
