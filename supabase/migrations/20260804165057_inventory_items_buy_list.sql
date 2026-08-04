ALTER TABLE "public"."inventory_items"
  ADD COLUMN "updated_at" timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN "updated_by" uuid;

ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- Multiple family members may tap "acheté" on the same item at nearly the
-- same time, so a plain read-then-write from a server action has a real
-- lost-update race. This clamps quantity_owned into [0, quantity_target]
-- atomically regardless of how many concurrent taps land.
CREATE OR REPLACE FUNCTION "public"."adjust_inventory_owned"(
  "item_id" uuid, "delta" integer, "actor_id" uuid
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
  WHERE "id" = "item_id"
  RETURNING *;
$$;

ALTER FUNCTION "public"."adjust_inventory_owned"(uuid, integer, uuid) OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."adjust_inventory_owned"(uuid, integer, uuid) TO "anon", "authenticated", "service_role";
