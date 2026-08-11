import { getLocale, getTranslations } from "next-intl/server";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getInventoryItems } from "@/utils/actions/inventory";
import InventoryItemModal from "./_components/inventory_item_modal";
import InventoryList from "./_components/inventory_list";
import { Reveal } from "@components/reveal";
import { compareItemKinds, DEFAULT_ITEM_KINDS } from "@utils/inventory_kind";
import { formatCurrency } from "@utils/formatting";

export default async function InventoryPage({
  params,
}: {
  params: Promise<{ babyId: string }>;
}) {
  const { babyId } = await params;
  const locale = await getLocale();
  const t = await getTranslations('inventory');

  await assertPageAccess(babyId, 'inventory');

  const items = await getInventoryItems(babyId);

  const totalSpent = items.reduce((sum, item) => sum + (item.price_paid ?? 0), 0);
  // Datalist suggestions for the "Type d'article" field: the built-in
  // defaults plus any custom kind a family has already typed in.
  const kindOptions = Array.from(new Set([...DEFAULT_ITEM_KINDS, ...items.map((item) => item.kind)])).sort(compareItemKinds);
  // Sub-type suggestions (the "size" field) are scoped per kind so picking
  // "Repas" doesn't autocomplete clothing sizes like "0/3 mois".
  const subtypesByKind: Record<string, string[]> = {};
  for (const item of items) {
    if (!item.size) continue;
    const list = subtypesByKind[item.kind] ?? (subtypesByKind[item.kind] = []);
    if (!list.includes(item.size)) list.push(item.size);
  }
  for (const list of Object.values(subtypesByKind)) list.sort();
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
                {t('eyebrow')}
              </p>
              <h1 className="mt-1 font-display text-3xl font-semibold">
                {t('title')}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-landing-muted sm:text-base">
                {t('subtitle')}
              </p>
              {totalSpent > 0 && (
                <p className="mt-3 text-sm font-semibold text-landing-foreground">
                  {t('totalSpent', { amount: formatCurrency(totalSpent, locale) })}
                </p>
              )}
            </div>
            <div className="flex shrink-0">
              <InventoryItemModal babyId={babyId} kindOptions={kindOptions} subtypesByKind={subtypesByKind} sources={sources} />
            </div>
          </div>
        </Reveal>

        <InventoryList babyId={babyId} items={items} kindOptions={kindOptions} subtypesByKind={subtypesByKind} sources={sources} />
      </div>
    </div>
  );
}
