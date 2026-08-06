CREATE TYPE "public"."item_kind" AS ENUM ('clothing', 'feeding', 'bathing', 'room', 'safety', 'transport', 'toy', 'other');

ALTER TABLE "public"."inventory_items" RENAME COLUMN "category" TO "size";
ALTER TABLE "public"."inventory_items" ALTER COLUMN "size" DROP NOT NULL;
ALTER TABLE "public"."inventory_items" ADD COLUMN "kind" "public"."item_kind" NOT NULL DEFAULT 'clothing';
