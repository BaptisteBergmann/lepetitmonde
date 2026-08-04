CREATE TYPE "public"."item_condition" AS ENUM ('new', 'secondhand');

CREATE TABLE "public"."inventory_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "baby_id" uuid NOT NULL,
  "category" text NOT NULL,
  "name" text NOT NULL,
  "detail" text,
  "quantity_owned" integer DEFAULT 0 NOT NULL,
  "quantity_target" integer,
  "price_paid" numeric(10,2),
  "purchased_from" text,
  "condition" "public"."item_condition",
  "position" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid
);

ALTER TABLE "public"."inventory_items" OWNER TO "postgres";

ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

CREATE INDEX "inventory_items_baby_id_idx" ON "public"."inventory_items" USING btree ("baby_id");

GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";
