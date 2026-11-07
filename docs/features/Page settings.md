---
tags: [lepetitmonde/feature]
---

# Page settings

Up: [[Le petit monde]] · See also [[Authorization]], [[Admin console]]

Each baby has a set of pages. `src/utils/page_registry.ts` (`PAGE_REGISTRY`) is the single source of truth for them: it drives the header nav, the mobile bottom bar and the baby landing page.

| Page | Default | Default role |
|---|---|---|
| [[Feed]] (Journal) | on | viewer |
| [[Baby tracker]] | off | admin |
| [[Health]] | off | admin |
| [[Calendar]] | off | viewer |
| [[Guessing game]] | on | viewer |
| [[Anecdotes]] | off | viewer |
| [[Albums]] | off | viewer |
| [[Inventory]] | off | admin |
| [[Buy list]] | off | viewer |
| [[To-do list]] | off | admin |
| [[Admin console]] | on | admin |

An admin overrides these per baby in the admin console (`display_page_settings.tsx` → `updatePageSetting`), stored in the `page_settings` table. Enforcement is real, not cosmetic: `assertPageAccess(babyId, pageId)` guards every protected page, and the [[Core modules]] check it for [[MCP server]] tools. `getPageSettings` is TTL-cached because the nav calls it on every request.

Page names and descriptions are translated from `pages.<id>.*` messages ([[Internationalization]]).
