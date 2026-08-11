'use client'

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { getDateFnsLocale } from "@utils/formatting";
import { Loader2, Minus, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adjustInventoryOwned, type getBuyListItems } from "@utils/actions/inventory";
import { useBabyRealtime } from "@/utils/hooks/use-baby-realtime";
import { compareItemKinds, getItemKindIcon, ItemKind } from "@utils/inventory_kind";

type BuyListItem = Awaited<ReturnType<typeof getBuyListItems>>[number];

export default function BuyList({
  babyId,
  initialItems,
}: {
  babyId: string;
  initialItems: BuyListItem[];
}) {
  const router = useRouter();
  const t = useTranslations('buyList');
  const tCommon = useTranslations('common');
  const dateFnsLocale = getDateFnsLocale(useLocale());
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Small, infrequently-changing list — a full router.refresh() on any
  // change is cheap and simpler than hand-patching local state.
  useBabyRealtime(babyId, (event) => {
    if (event.table === "inventory_items") router.refresh();
  });

  const groups = useMemo(() => {
    const grouped = new Map<ItemKind, BuyListItem[]>();
    for (const item of initialItems) {
      const group = grouped.get(item.kind);
      if (group) group.push(item);
      else grouped.set(item.kind, [item]);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => compareItemKinds(a, b));
  }, [initialItems]);

  const handleAdjust = async (itemId: string, delta: 1 | -1) => {
    setPendingId(itemId);
    try {
      await adjustInventoryOwned(babyId, itemId, delta);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert(t('adjustError'));
    } finally {
      setPendingId(null);
    }
  };

  if (initialItems.length === 0) {
    return (
      <div className="text-center py-12 text-landing-muted border border-dashed border-landing-border rounded-2xl bg-landing-surface">
        <p className="text-sm font-medium">{t('empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([kind, kindItems]) => {
        const KindIcon = getItemKindIcon(kind);
        return (
        <Card key={kind} className="border-landing-border bg-landing-surface">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
              <KindIcon className="h-4.5 w-4.5 text-primary" />
              {kind}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2 divide-y divide-landing-border">
            {kindItems.map((item) => {
              const missing = (item.quantity_target ?? 0) - item.quantity_owned;
              const isPending = pendingId === item.id;
              const atTarget = item.quantity_target != null && item.quantity_owned >= item.quantity_target;

              return (
                <div key={item.id} className="flex items-center gap-3 py-3 px-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-semibold text-landing-foreground">{item.name}</p>
                      {item.size && <span className="text-xs text-landing-muted">{item.size}</span>}
                      {item.detail && <span className="text-xs text-landing-muted">{item.detail}</span>}
                      <Badge variant="outline" className="border-landing-camel text-landing-camel">
                        {t('missing', { count: missing })}
                      </Badge>
                    </div>
                    {item.updatedByName && (
                      <p className="mt-1 text-[10px] text-landing-muted">
                        {t('checkedBy', {
                          name: item.updatedByName,
                          date: tCommon('dateAtTime', {
                            date: format(new Date(item.updated_at), 'd MMM', { locale: dateFnsLocale }),
                            time: format(new Date(item.updated_at), 'HH:mm', { locale: dateFnsLocale }),
                          }),
                        })}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={isPending || item.quantity_owned <= 0}
                      className="h-7 w-7 rounded-lg cursor-pointer"
                      onClick={() => handleAdjust(item.id, -1)}
                      aria-label={t('removeOne')}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={isPending || atTarget}
                      className="h-7 w-7 rounded-lg cursor-pointer"
                      onClick={() => handleAdjust(item.id, 1)}
                      aria-label={t('addOne')}
                    >
                      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
}
