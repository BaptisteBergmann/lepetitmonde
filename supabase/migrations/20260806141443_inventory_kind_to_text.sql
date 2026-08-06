-- item_kind was a fixed enum, but families want to add their own article
-- types beyond the built-in 8 — Postgres enums can't be extended from the
-- app, so kind becomes free text (same pattern as purchased_from), with
-- existing enum values rewritten to their French display form so old and
-- new rows read consistently as plain text.
ALTER TABLE "public"."inventory_items" ALTER COLUMN "kind" DROP DEFAULT;

ALTER TABLE "public"."inventory_items" ALTER COLUMN "kind" TYPE text USING (
  CASE "kind"::text
    WHEN 'clothing' THEN 'Vêtement'
    WHEN 'feeding' THEN 'Repas'
    WHEN 'bathing' THEN 'Bain'
    WHEN 'room' THEN 'Chambre'
    WHEN 'safety' THEN 'Sécurité'
    WHEN 'transport' THEN 'Transport'
    WHEN 'toy' THEN 'Jouet'
    WHEN 'other' THEN 'Autre'
  END
);

ALTER TABLE "public"."inventory_items" ALTER COLUMN "kind" SET DEFAULT 'Vêtement';

DROP TYPE "public"."item_kind";
