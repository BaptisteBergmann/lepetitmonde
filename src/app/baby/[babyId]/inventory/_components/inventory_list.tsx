'use client'

import { useMemo, useState } from "react";
import { Search, Shirt, Ruler } from "lucide-react";
import { Tables } from "@utils/supabase/database.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import InventoryItemModal from "./inventory_item_modal";

type InventoryItem = Tables<'inventory_items'>;

type ViewMode = 'garment' | 'size';

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
  const [viewMode, setViewMode] = useState<ViewMode>('garment');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) => {
      const next = new Set(prev);
      if (next.has(size)) next.delete(size);
      else next.add(size);
      return next;
    });
  };

  // Two ways to slice the same rows: cards per garment with sizes as chips
  // (fewer cards, best for "how many pyjamas total"), or cards per size with
  // garments as chips (best for "what's left to get for 3/6 mois"). Building
  // groups via a Map preserves each key's first-appearance order, which for
  // "size" cards tracks the position items were entered in (usually
  // chronological) rather than an alphabetical sort that would scramble it.
  const groups = useMemo(() => {
    const filtered = selectedSizes.size === 0 ? items : items.filter((item) => selectedSizes.has(item.category));
    const groupKey = (item: InventoryItem) => (viewMode === 'garment' ? item.name : item.category);

    const grouped = new Map<string, InventoryItem[]>();
    for (const item of filtered) {
      const group = grouped.get(groupKey(item));
      if (group) group.push(item);
      else grouped.set(groupKey(item), [item]);
    }

    const entries = Array.from(grouped.entries());
    return viewMode === 'garment' ? entries.sort(([a], [b]) => a.localeCompare(b, "fr")) : entries;
  }, [items, viewMode, selectedSizes]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map(([key, groupItems]) => {
        const visibleItems = groupItems.filter((item) => {
          if (onlyMissing && !(item.quantity_target != null && item.quantity_target > item.quantity_owned)) return false;
          if (q === "") return true;
          // The search box always matches garment names, regardless of
          // whether the garment is the card title (par vêtement) or a chip
          // label inside a size card (par taille).
          return item.name.toLowerCase().includes(q);
        });
        return { key, groupItems, visibleItems };
      })
      .filter(({ visibleItems }) => visibleItems.length > 0);
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
      <div className="inline-flex rounded-full border border-landing-border bg-landing-background p-1">
        <button
          type="button"
          onClick={() => setViewMode('garment')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
            viewMode === 'garment' ? "bg-primary text-primary-foreground" : "text-landing-muted hover:text-landing-foreground"
          }`}
        >
          <Shirt className="h-3.5 w-3.5" />
          Par vêtement
        </button>
        <button
          type="button"
          onClick={() => setViewMode('size')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
            viewMode === 'size' ? "bg-primary text-primary-foreground" : "text-landing-muted hover:text-landing-foreground"
          }`}
        >
          <Ruler className="h-3.5 w-3.5" />
          Par taille
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-landing-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
            className="h-4 w-4 rounded border-landing-border accent-primary cursor-pointer"
          />
          Reste à acheter
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

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wider text-landing-muted">Tailles</span>
        <button
          type="button"
          onClick={() => setSelectedSizes(new Set())}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
            selectedSizes.size === 0
              ? "border-primary bg-primary text-primary-foreground"
              : "border-landing-border bg-landing-background text-landing-muted hover:text-landing-foreground"
          }`}
        >
          Toutes
        </button>
        {categories.map((c) => {
          const active = selectedSizes.has(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggleSize(c)}
              aria-pressed={active}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-landing-border bg-landing-background text-landing-muted hover:text-landing-foreground"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>

      {visibleGroups.length === 0 ? (
        <p className="py-8 text-center text-sm text-landing-muted">Aucun article ne correspond.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleGroups.map(({ key, groupItems, visibleItems }) => {
            const totalOwned = groupItems.reduce((sum, item) => sum + item.quantity_owned, 0);
            const subtotal = groupItems.reduce((sum, item) => sum + (item.price_paid ?? 0), 0);

            return (
              <Card key={key} className="border-landing-border bg-landing-surface">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="font-display text-sm font-semibold flex items-center gap-2 min-w-0">
                      {viewMode === 'garment'
                        ? <Shirt className="h-4 w-4 text-primary shrink-0" />
                        : <Ruler className="h-4 w-4 text-primary shrink-0" />}
                      <span className="truncate">{key}</span>
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
                    const chipLabel = viewMode === 'garment' ? item.category : item.name;

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
                            <span className="text-landing-muted">{chipLabel}</span>
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
