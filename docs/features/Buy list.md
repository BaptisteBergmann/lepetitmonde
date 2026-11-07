---
tags: [lepetitmonde/feature]
---

# Buy list

Up: [[Inventory]] · Route: `/baby/[babyId]/buy-list`

A family-facing view of the [[Inventory]]: every item where `quantity_target > quantity_owned`.

- Any member can tick an item as bought; admins curate the items and targets from the inventory page.
- "Mark bought" is one atomic, clamped SQL update, so two people shopping at once can't lose an update.
- Everyone's list updates live through the [[Realtime]] relay.
- [[MCP server]] tools: `list_buy_list`, `mark_bought`, `add_buy_list_item`, `remove_from_buy_list`.
