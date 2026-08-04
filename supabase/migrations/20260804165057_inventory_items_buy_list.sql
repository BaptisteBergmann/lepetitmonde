ALTER TABLE "public"."inventory_items"
  ADD COLUMN "updated_at" timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN "updated_by" uuid;

ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- Multiple family members may tap "acheté" on the same item at nearly the
-- same time, so a plain read-then-write from a server action has a real
-- lost-update race. This clamps quantity_owned into [0, quantity_target]
-- atomically regardless of how many concurrent taps land.
--
-- target_baby_id is required (not just item_id): the calling action only
-- checks that the caller has *some* access to babyId, not that item_id
-- actually belongs to that baby, so without this the WHERE clause would let
-- a member of any baby adjust any other baby's items by guessing/observing
-- an item id.
CREATE OR REPLACE FUNCTION "public"."adjust_inventory_owned"(
  "item_id" uuid, "target_baby_id" uuid, "delta" integer, "actor_id" uuid
)
RETURNS "public"."inventory_items"
LANGUAGE "sql"
AS $$
  UPDATE "public"."inventory_items"
  SET "quantity_owned" = GREATEST(
        0,
        LEAST(COALESCE("quantity_target", "quantity_owned" + "delta"), "quantity_owned" + "delta")
      ),
      "updated_at" = now(),
      "updated_by" = "actor_id"
  WHERE "id" = "item_id" AND "baby_id" = "target_baby_id"
  RETURNING *;
$$;

ALTER FUNCTION "public"."adjust_inventory_owned"(uuid, uuid, integer, uuid) OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."adjust_inventory_owned"(uuid, uuid, integer, uuid) TO "anon", "authenticated", "service_role";
