import { getBuyListItems } from "@/utils/actions/inventory";
import { assertPageAccess } from "@/utils/actions/page_settings";
import BuyList from "./_components/buy_list";
import { Reveal } from "@components/reveal";

export default async function BuyListPage({
  params,
}: {
  params: Promise<{ babyId: string }>;
}) {
  const { babyId } = await params;

  await assertPageAccess(babyId, 'buy-list');

  const items = await getBuyListItems(babyId);

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <Reveal className="border-b border-landing-border pb-6 mb-8">
          <p className="text-xs font-semibold tracking-[0.16em] text-landing-camel uppercase">
            Page — On y va ensemble
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold">
            Liste d&apos;achats
          </h1>
          <p className="mt-2 max-w-xl text-sm text-landing-muted sm:text-base">
            Ce qu&apos;il reste à acheter. Cochez au fur et à mesure, tout le monde voit la mise à jour en direct.
          </p>
        </Reveal>

        <BuyList babyId={babyId} initialItems={items} />
      </div>
    </div>
  );
}
