---
tags: [lepetitmonde/feature]
---

# Inventory

Up: [[Le petit monde]] · Route: `/baby/[babyId]/inventory` · Code: `inventory/`, `actions/inventory.ts`, `inventory-core.ts`, `inventory_kind.ts`

An admin page to track baby clothes and gear: what the family owns versus how many they want.

- Each item has a name, an optional detail, a size (for clothes an age range such as "Newborn" or "0/3 mois") and a free-text kind (Vêtement, Repas, Bain, Chambre, Sécurité, Transport, Jouet... or a custom one) with an icon. The list can be grouped by size or by kind.
- Each item has `quantity_owned` and an optional `quantity_target`; the gap is what still needs buying and feeds the [[Buy list]].
- Purchases record price, shop and condition (`new` / `secondhand`), giving a running spend total.
- [[MCP server]] tools: `list_inventory`, `update_inventory_quantities`.

Table: `inventory_items`.
