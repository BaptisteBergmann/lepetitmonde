---
tags: [lepetitmonde/architecture, ui]
---

# UI system

Up: [[Le petit monde]] · See also [[z-index]], [[Coding conventions]]

- **Tailwind CSS v4** (`src/app/globals.css`, `@tailwindcss/postcss`), `tw-animate-css` for animations.
- **Shadcn UI** primitives in `src/components/ui/` (`components.json`, base color `neutral`), built on **Base UI** (`@base-ui/react`).
- **Lucide** icons. Each page's icon is set in `PAGE_REGISTRY` ([[Page settings]]).
- `cn()` in `src/utils/utils.ts` (clsx + tailwind-merge) for every conditional class.
- Toasts with **sonner**; confirmations through `confirm_provider.tsx` (`useConfirm`).
- Theme helpers in `src/utils/theme.ts`.
- Hand-rolled touch interactions: pull-to-refresh, the pinch/swipe `photo_lightbox.tsx`, the story viewer's tap zones, `reveal.tsx` scroll fades.
- Layout: a fixed site header (`app/_header/`), and on mobile a bottom bar with 4 tabs plus a "More" menu.

## Stacking

Every `z-index` comes from the shared scale in [[z-index]]: `z-0`/`z-10` local, `z-40` floating chrome, `z-50` header only, `z-[60]` full-screen overlays, `z-[70]` anchored popovers, selects and menus.

## Accessibility

Interactive elements must be keyboard reachable and labelled; the reviewer agent checks accessibility on every change.
