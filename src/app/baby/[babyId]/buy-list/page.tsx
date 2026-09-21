import { getBuyListItems } from "@/utils/actions/inventory";
import { assertPageAccess } from "@/utils/actions/page_settings";
import BuyList from "./_components/buy_list";

export default async function BuyListPage({
  params,
}: {
  params: Promise<{ babyId: string }>;
}) {
  const { babyId } = await params;

  await assertPageAccess(babyId, 'buy-list');

  const items = await getBuyListItems(babyId);

  return (
    <div className="text-landing-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <BuyList babyId={babyId} initialItems={items} />
      </div>
    </div>
  );
}
