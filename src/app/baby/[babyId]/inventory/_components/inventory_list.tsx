'use client'

import { useMemo, useState } from "react";
import { Package, Pencil } from "lucide-react";
import { Tables } from "@utils/supabase/database.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import InventoryItemModal from "./inventory_item_modal";
import ReorderInventoryItemButtons from "./reorder_inventory_item_buttons";
import DeleteInventoryItemButton from "./delete_inventory_item_button";

type InventoryItem = Tables<'inventory_items'>;

const CONDITION_LABELS: Record<NonNullable<InventoryItem['condition']>, string> = {
  new: "Neuf",
  secondhand: "Occasion",
};

const CONDITION_STYLES: Record<NonNullable<InventoryItem['condition']>, string> = {
  new: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  secondhand: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

function formatPrice(amount: number) {
  return amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export default function InventoryList({
  babyId,
  items,
  categories,
  sources,
}: {
  babyId: string;
  items: InventoryItem[];
  categories: string[];
  sources: string[];
}) {
  const [onlyMissing, setOnlyMissing] = useState(false);

  // Items already arrive ordered by position; grouping preserves first-appearance
  // order, which is always that category's lowest position since we walk the
  // list in ascending position order.
  const groups = useMemo(() => {
    const grouped = new Map<string, InventoryItem[]>();
    for (const item of items) {
      const group = grouped.get(item.category);
      if (group) group.push(item);
      else grouped.set(item.category, [item]);
    }
    return Array.from(grouped.entries());
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-landing-muted border border-dashed border-landing-border rounded-2xl bg-landing-surface">
        <p className="text-sm font-medium">Aucun article pour le moment.</p>
        <p className="text-xs text-landing-muted mt-1">Cliquez sur &quot;Ajouter un article&quot; pour commencer l&apos;inventaire.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-2 text-sm text-landing-muted cursor-pointer select-none">
        <input
          type="checkbox"
          checked={onlyMissing}
          onChange={(e) => setOnlyMissing(e.target.checked)}
          className="h-4 w-4 rounded border-landing-border accent-primary cursor-pointer"
        />
        Afficher uniquement ce qu&apos;il reste à acheter
      </label>

      <div className="space-y-4">
        {groups.map(([category, categoryItems]) => {
          const visibleItems = onlyMissing
            ? categoryItems.filter((item) => item.quantity_target != null && item.quantity_target > item.quantity_owned)
            : categoryItems;

          if (visibleItems.length === 0) return null;

          const subtotal = categoryItems.reduce((sum, item) => sum + (item.price_paid ?? 0), 0);

          return (
            <Card key={category} className="border-landing-border bg-landing-surface">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
                    <Package className="h-4.5 w-4.5 text-primary" />
                    {category}
                  </CardTitle>
                  {subtotal > 0 && (
                    <span className="text-xs font-semibold text-landing-muted">
                      {formatPrice(subtotal)}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-2 divide-y divide-landing-border">
                {visibleItems.map((item) => {
                  const indexInCategory = categoryItems.findIndex((i) => i.id === item.id);
                  const reste = item.quantity_target != null && item.quantity_target > item.quantity_owned
                    ? item.quantity_target - item.quantity_owned
                    : 0;

                  return (
                    <div key={item.id} className="flex items-start gap-3 py-3 px-6">
                      <ReorderInventoryItemButtons
                        babyId={babyId}
                        itemId={item.id}
                        isFirst={indexInCategory === 0}
                        isLast={indexInCategory === categoryItems.length - 1}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-sm font-semibold text-landing-foreground">
                            {item.name}
                          </p>
                          {item.detail && (
                            <span className="text-xs text-landing-muted">{item.detail}</span>
                          )}
                          {reste > 0 && (
                            <Badge variant="outline" className="border-landing-camel text-landing-camel">
                              reste à acheter : {reste}
                            </Badge>
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-landing-muted">
                          <span>
                            {item.quantity_owned} possédé{item.quantity_owned > 1 ? "s" : ""}
                            {item.quantity_target != null && ` / ${item.quantity_target} souhaité${item.quantity_target > 1 ? "s" : ""}`}
                          </span>
                          {item.price_paid != null && <span className="font-semibold">{formatPrice(item.price_paid)}</span>}
                          {item.condition && (
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${CONDITION_STYLES[item.condition]}`}>
                              {CONDITION_LABELS[item.condition]}
                            </span>
                          )}
                          {item.purchased_from && <span>via {item.purchased_from}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <InventoryItemModal
                          babyId={babyId}
                          categories={categories}
                          sources={sources}
                          item={item}
                          trigger={
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 rounded-lg cursor-pointer"
                              aria-label="Modifier l'article"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          }
                        />
                        <DeleteInventoryItemButton babyId={babyId} itemId={item.id} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
