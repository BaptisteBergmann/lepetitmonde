'use client'

import { useMemo, useState } from "react";
import { Search, Shirt } from "lucide-react";
import { Tables } from "@utils/supabase/database.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import InventoryItemModal from "./inventory_item_modal";

type InventoryItem = Tables<'inventory_items'>;

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
  const [query, setQuery] = useState("");

  // Grouped by garment name rather than size: with one card per size (the
  // original layout) a full wardrobe spans a dozen-plus cards to scroll
  // through. Grouping by garment keeps it to one card per item type, with
  // sizes as chips inside — far fewer cards, and each one fits a phone width.
  const groups = useMemo(() => {
    const grouped = new Map<string, InventoryItem[]>();
    for (const item of items) {
      const group = grouped.get(item.name);
      if (group) group.push(item);
      else grouped.set(item.name, [item]);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b, "fr"));
  }, [items]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map(([name, groupItems]) => {
        const visibleItems = onlyMissing
          ? groupItems.filter((item) => item.quantity_target != null && item.quantity_target > item.quantity_owned)
          : groupItems;
        return { name, groupItems, visibleItems };
      })
      .filter(({ name, visibleItems }) => visibleItems.length > 0 && (q === "" || name.toLowerCase().includes(q)));
  }, [groups, onlyMissing, query]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-landing-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
            className="h-4 w-4 rounded border-landing-border accent-primary cursor-pointer"
          />
          Afficher uniquement ce qu&apos;il reste à acheter
        </label>

        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-landing-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer un vêtement…"
            className="pl-8"
          />
        </div>
      </div>

      {visibleGroups.length === 0 ? (
        <p className="py-8 text-center text-sm text-landing-muted">Aucun article ne correspond.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleGroups.map(({ name, groupItems, visibleItems }) => {
            const totalOwned = groupItems.reduce((sum, item) => sum + item.quantity_owned, 0);
            const subtotal = groupItems.reduce((sum, item) => sum + (item.price_paid ?? 0), 0);

            return (
              <Card key={name} className="border-landing-border bg-landing-surface">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="font-display text-sm font-semibold flex items-center gap-2 min-w-0">
                      <Shirt className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{name}</span>
                    </CardTitle>
                    <span className="shrink-0 text-xs font-semibold text-landing-muted">
                      {totalOwned} au total{subtotal > 0 && ` · ${formatPrice(subtotal)}`}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5 pt-0">
                  {visibleItems.map((item) => {
                    const reste = item.quantity_target != null && item.quantity_target > item.quantity_owned
                      ? item.quantity_target - item.quantity_owned
                      : 0;

                    return (
                      <InventoryItemModal
                        key={item.id}
                        babyId={babyId}
                        categories={categories}
                        sources={sources}
                        item={item}
                        trigger={
                          <button
                            type="button"
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs cursor-pointer transition-colors ${
                              reste > 0
                                ? "border-landing-camel/50 bg-landing-camel/10 hover:bg-landing-camel/20"
                                : "border-landing-border bg-landing-background hover:bg-landing-surface"
                            }`}
                          >
                            <span className="text-landing-muted">{item.category}</span>
                            <span className="font-semibold text-landing-foreground">{item.quantity_owned}</span>
                            {reste > 0 && <span className="font-semibold text-landing-camel">+{reste}</span>}
                          </button>
                        }
                      />
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
