import { assertPageAccess } from "@/utils/actions/page_settings";
import { getInventoryItems } from "@/utils/actions/inventory";
import InventoryItemModal from "./_components/inventory_item_modal";
import InventoryList from "./_components/inventory_list";
import { Reveal } from "@components/reveal";

export default async function InventoryPage({
  params,
}: {
  params: Promise<{ babyId: string }>;
}) {
  const { babyId } = await params;

  await assertPageAccess(babyId, 'inventory');

  const items = await getInventoryItems(babyId);

  const totalSpent = items.reduce((sum, item) => sum + (item.price_paid ?? 0), 0);
  const categories = Array.from(new Set(items.map((item) => item.category))).sort();
  const sources = Array.from(
    new Set(items.map((item) => item.purchased_from).filter((source): source is string => Boolean(source)))
  ).sort();

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <Reveal className="border-b border-landing-border pb-6 mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-landing-camel uppercase">
                Page — Ce qu&apos;on a, ce qu&apos;il faut
              </p>
              <h1 className="mt-1 font-display text-3xl font-semibold">
                Inventaire
              </h1>
              <p className="mt-2 max-w-xl text-sm text-landing-muted sm:text-base">
                Suivez ce que vous possédez déjà, ce qu&apos;il reste à acheter, et combien vous avez dépensé.
              </p>
              {totalSpent > 0 && (
                <p className="mt-3 text-sm font-semibold text-landing-foreground">
                  Total dépensé : {totalSpent.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                </p>
              )}
            </div>
            <div className="flex shrink-0">
              <InventoryItemModal babyId={babyId} categories={categories} sources={sources} />
            </div>
          </div>
        </Reveal>

        <InventoryList babyId={babyId} items={items} categories={categories} sources={sources} />
      </div>
    </div>
  );
}
