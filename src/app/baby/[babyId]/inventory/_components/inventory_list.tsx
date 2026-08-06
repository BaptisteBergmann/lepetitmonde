'use client'

import { useMemo, useState } from "react";
import { Search, Package, Tag } from "lucide-react";
import { Tables } from "@utils/supabase/database.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ITEM_KINDS, ITEM_KIND_LABEL, ITEM_KIND_ICON, ItemKind } from "@utils/inventory_kind";
import InventoryItemModal from "./inventory_item_modal";

type InventoryItem = Tables<'inventory_items'>;

type ViewMode = 'article' | 'type';

function formatPrice(amount: number) {
  return amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export default function InventoryList({
  babyId,
  items,
  sizes,
  sources,
}: {
  babyId: string;
  items: InventoryItem[];
  sizes: string[];
  sources: string[];
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('article');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [selectedKinds, setSelectedKinds] = useState<Set<ItemKind>>(new Set());
  const [query, setQuery] = useState("");
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(new Set());

  const toggleKind = (kind: ItemKind) => {
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const toggleTitle = (key: string) => {
    setExpandedTitles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Two ways to slice the same rows: cards per article with the size/type as
  // chips (fewer cards, best for "how many pyjamas total"), or cards per type
  // with articles as chips (best for "what's left to get for the bathroom").
  const groups = useMemo(() => {
    const filtered = selectedKinds.size === 0 ? items : items.filter((item) => selectedKinds.has(item.kind));
    const groupKey = (item: InventoryItem) => (viewMode === 'article' ? item.name : item.kind);

    const grouped = new Map<string, InventoryItem[]>();
    for (const item of filtered) {
      const group = grouped.get(groupKey(item));
      if (group) group.push(item);
      else grouped.set(groupKey(item), [item]);
    }

    const entries = Array.from(grouped.entries());
    return viewMode === 'article'
      ? entries.sort(([a], [b]) => a.localeCompare(b, "fr"))
      : entries.sort(([a], [b]) => ITEM_KINDS.indexOf(a as ItemKind) - ITEM_KINDS.indexOf(b as ItemKind));
  }, [items, viewMode, selectedKinds]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map(([key, groupItems]) => {
        const visibleItems = groupItems.filter((item) => {
          if (onlyMissing && !(item.quantity_target != null && item.quantity_target > item.quantity_owned)) return false;
          if (q === "") return true;
          // The search box always matches article names, regardless of
          // whether the article is the card title (par article) or a chip
          // label inside a type card (par type).
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
          onClick={() => setViewMode('article')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
            viewMode === 'article' ? "bg-primary text-primary-foreground" : "text-landing-muted hover:text-landing-foreground"
          }`}
        >
          <Package className="h-3.5 w-3.5" />
          Par article
        </button>
        <button
          type="button"
          onClick={() => setViewMode('type')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
            viewMode === 'type' ? "bg-primary text-primary-foreground" : "text-landing-muted hover:text-landing-foreground"
          }`}
        >
          <Tag className="h-3.5 w-3.5" />
          Par type
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
            placeholder="Filtrer un article…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wider text-landing-muted">Type</span>
        <button
          type="button"
          onClick={() => setSelectedKinds(new Set())}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
            selectedKinds.size === 0
              ? "border-primary bg-primary text-primary-foreground"
              : "border-landing-border bg-landing-background text-landing-muted hover:text-landing-foreground"
          }`}
        >
          Tous
        </button>
        {ITEM_KINDS.map((k) => {
          const active = selectedKinds.has(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleKind(k)}
              aria-pressed={active}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-landing-border bg-landing-background text-landing-muted hover:text-landing-foreground"
              }`}
            >
              {ITEM_KIND_LABEL[k]}
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
            const GroupIcon = viewMode === 'article' ? Package : ITEM_KIND_ICON[key as ItemKind];
            const title = viewMode === 'article' ? key : ITEM_KIND_LABEL[key as ItemKind];

            return (
              <Card key={key} className="border-landing-border bg-landing-surface">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="font-display text-sm font-semibold flex items-center gap-2 min-w-0">
                      <GroupIcon className="h-4 w-4 text-primary shrink-0" />
                      <button
                        type="button"
                        onClick={() => toggleTitle(key)}
                        title={title}
                        className={`min-w-0 flex-1 cursor-pointer text-left ${
                          expandedTitles.has(key) ? "whitespace-normal break-words" : "truncate"
                        }`}
                      >
                        {title}
                      </button>
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
                    const chipLabel = viewMode === 'article' ? (item.size ?? ITEM_KIND_LABEL[item.kind]) : item.name;

                    return (
                      <InventoryItemModal
                        key={item.id}
                        babyId={babyId}
                        sizes={sizes}
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
