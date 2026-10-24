-- Invitation links become single-use and revocable (security finding M7).
--
-- `used_at` / `used_by` are written by the service role when a link is redeemed, with one
-- conditional UPDATE (WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now()) so
-- two parallel redemptions can't both win. `revoked_at` is set by a baby admin.
--
-- `used_by` points at public.users (not auth.users) so the admin list can embed the redeemer's
-- name. Signup creates the profile row before consuming the link, so the FK always holds.
--
-- Purely additive: all columns are nullable with no backfill, so existing unexpired links stay
-- usable once and code that ignores the columns keeps working. No grant or RLS change here
-- (invitations RLS is batch B3 of .claude/plans/rls.md).
ALTER TABLE "public"."invitations"
    ADD COLUMN "used_at" timestamp with time zone,
    ADD COLUMN "used_by" "uuid",
    ADD COLUMN "revoked_at" timestamp with time zone;

ALTER TABLE "public"."invitations"
    ADD CONSTRAINT "invitations_used_by_fkey" FOREIGN KEY ("used_by")
    REFERENCES "public"."users"("id") ON DELETE SET NULL;
