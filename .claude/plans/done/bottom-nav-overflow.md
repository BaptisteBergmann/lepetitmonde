## Status: implemented

Shipped: 4 tabs + More dropdown in the mobile bottom bar. Deviations: Steps 2 (drawer) and 4 (height sync) skipped as planned; `render={<Link/>}` worked directly, so the `router.push` fallback was not needed.

# Mobile bottom nav without horizontal scroll

Approved by:

## Goal
On mobile, the bottom bar scrolls sideways once a baby has more than about 6 enabled pages.
That happens to admins in particular, who can see up to 10. Cap the bar at a fixed number of
visible slots (about 4) plus a "more" control that opens the remaining pages, so every page
can be reached without scrolling horizontally.

## Out of scope
- Desktop nav (`page_selector.tsx`, `md:` and up). It stays as it is.
- The header account menu (`mobile_menu.tsx`: settings and logout). It stays where it is,
  unless the designer decides to merge it.
- Which pages are enabled or which role can see them (`page_settings`, `getNavAccesses`).
- User-customizable tab order.

## Current state
- **Component**: `src/app/_header/bottom_nav.tsx` (client). It is rendered by
  `src/app/_header/header.tsx` as `{user && <BottomNav accesses={accesses} />}`, with
  `accesses` coming from `getNavAccesses()` (`src/app/_header/get_nav_accesses.ts`).
- **Bar**: `fixed bottom-0 z-40 flex justify-around overflow-x-auto md:hidden`, padded with
  `env(safe-area-inset-bottom)`. Each item is an icon-only `Link` (`min-w-14 flex-1`, h-6 icon)
  with `aria-label={page.name}`. There are no visible text labels and the `<nav>` itself has no
  `aria-label`. The `min-w-14` together with `overflow-x-auto` is what causes the sideways
  scroll when there are many items.
- **Hidden when**: the user has no allowed pages for the current `babyId`, the on-screen
  keyboard is open (the `visualViewport` logic), or the user is on the hub page `/baby/[babyId]`.
- **Items** come from `allowedPages` for the current baby, which is every
  `PAGE_REGISTRY` (`src/utils/page_registry.ts`) entry where `enabled` is true and
  `access_level === 'admin' || access_level === page.role`. The possible pages, with their
  default role and default enabled state:

  | id | icon | default role | default enabled |
  |---|---|---|---|
  | feed | BookOpen | viewer | yes |
  | calendar | CalendarDays | viewer | no |
  | guess | Dices | viewer | yes |
  | anecdotes | Sparkles | viewer | no |
  | albums | Images | viewer | no |
  | inventory | Package | admin | no |
  | buy-list | ShoppingCart | viewer | no |
  | todo | ListChecks | admin | no |
  | tracker | Baby | admin | no |
  | admin | Users | admin (always on, not manageable) | yes |

  The role and enabled state can be overridden per baby in `page_settings`. Viewers therefore
  see 2 to 6 items and admins see 2 to 10.
- **Order**: `getOrderedPages()` (`src/app/_header/page_order.ts`) puts the primary pages
  `['guess', 'feed', 'albums']` in the center and splits the rest symmetrically on either side.
- **Active state**: `pathname === href || pathname.startsWith(href + '/')`, with
  `href = /baby/${babyId}/${page.id}`. Active items use `text-primary`; inactive items use
  `text-muted-foreground`.
- **Labels**: `page.name` is resolved server-side from `pages.<id>.name` in
  `getPageSettings()`. Icons are looked up client-side by id from `PAGE_REGISTRY`, because
  function references can't be passed across the Server to Client boundary (see `types.ts`).
- **Layout coupling**:
  - `src/app/layout.tsx:114` reserves a spacer of `calc(3.25rem + safe-area)` below the
    content.
  - `src/components/bug_report_button.tsx` sits at
    `bottom-[calc(3.75rem+env(safe-area-inset-bottom))]` on mobile.
  - Both values depend on the bar's height, so they must stay in sync with it.
- **Available primitives**:
  - In the app: `DropdownMenu` (`src/components/ui/dropdown-menu.tsx`, Base UI Menu, `z-[70]`),
    `Popover` (`z-[70]`) and `Dialog` (`z-[60]`).
  - There is no Shadcn `Sheet` or `Drawer` component yet. `@base-ui/react` 1.6 does ship
    `drawer` (and `dialog`), so a bottom sheet could be added as
    `src/components/ui/drawer.tsx` without a new dependency.
  - The account menu (`mobile_menu.tsx`) is the existing "Menu icon + DropdownMenu" pattern
    to copy.
- **Doc drift**:
  - The `types.ts` comment says that `mobile_menu.tsx` resolves icons, but it is
    `bottom_nav.tsx` that does.
  - CLAUDE.md mentions `@/utils/supabase/client`, which doesn't exist. This change doesn't
    need it.

## Approach
Keep `bottom_nav.tsx` as the single component.
1. Split `getOrderedPages(allowedPages)` into `visible` and `overflow` using a constant
   `MAX_VISIBLE` (the designer sets the exact number; 4 is the starting point).
   - If the total number of pages is no more than `MAX_VISIBLE + 1`, render them all and show
     no "more" button. This avoids a menu that would contain only one item.
   - Otherwise render `MAX_VISIBLE` links plus a "more" trigger that opens the overflow pages.
2. Choose which pages stay visible: the primary pages (`guess`, `feed`, `albums`) first, then
   registry order. Overflow pages keep registry order. `admin` should go to the overflow
   unless it is the only non-primary page.
3. If the active page is in the overflow, the "more" trigger shows the active state, so the
   user can still see where they are.
4. Remove `overflow-x-auto` and `min-w-14`, so the bar can't scroll again.

The overflow surface (a `DropdownMenu` opening upward, a Base UI `Drawer` bottom sheet, or a
`Dialog`) is the designer's choice.

Alternative considered and not chosen: shrinking the icons so all 10 fit. At 375px wide this
drops below the 44px touch target.

## Data and migrations
- None. `database.types.ts` does not need regenerating.

## Access and security
- No new routes, actions or queries. Overflow items come from the same `allowedPages`, which
  are already filtered server-side by `baby_access` membership and role in `getNavAccesses()`.
- Each page still enforces access itself through `assertPageAccess`, so hiding a page in the
  menu is a convenience, not a security boundary.
- No service-role use.

## Steps
1. **Split helper**: add `splitNavPages(pages, maxVisible)` to `page_order.ts`. It returns
   `{ visible, overflow }` using the rules in Approach 1 and 2, and reuses `getOrderedPages`
   for the visible slice so the primary pages stay centered.
   - Files: `src/app/_header/page_order.ts`
2. **Drawer primitive**: SKIPPED. The design picks the existing `DropdownMenu`.
3. **Bottom nav**:
   - Render the visible links plus the "more" trigger and overflow surface (see Design).
   - Add the active state on the trigger when the current page is in the overflow.
   - Remove `overflow-x-auto` and `min-w-14`.
   - Add `aria-label={t('nav.navigation')}` to `<nav>`.
   - Menu closes on item click (Base UI default `closeOnClick`); no pathname effect needed.
   - Keep the keyboard-hide and hub-page-hide logic unchanged.
   - Files: `src/app/_header/bottom_nav.tsx`
4. **Height sync**: SKIPPED. The design keeps the bar at 52px content height, so
   `layout.tsx` and `bug_report_button.tsx` don't change. Verify visually (How to verify 9).
5. **Doc fix**: correct the `types.ts` comment so it points to `bottom_nav.tsx`.
   - Files: `src/app/_header/types.ts`

Commit each step separately with Conventional Commits, and add a CHANGELOG line after each
commit.

## Translations
- `nav.more`: en "More", fr "Plus". Used as the trigger's visible label.
- Reuse the existing `nav.navigation` for the `<nav>` `aria-label`.
- Visible labels under icons reuse `page.name`. No new keys for that.
- No `a11y.close` needed (the menu has no close button; Escape and outside tap close it).

## Design

### User flow
1. User on a baby page sees the bar: up to 4 page tabs, each icon + label, plus "More" when
   the baby has 6 or more pages.
2. Taps a tab → navigates; tab turns `text-primary`.
3. Taps "More" → a menu opens upward above the trigger, listing the remaining pages.
4. Taps a page in the menu → navigates, menu closes, "More" shows the active state.
5. Taps outside or presses Escape → menu closes, focus returns to "More".

### Screens
#### Bottom bar (mobile, 375px)
Wireframe, 6+ pages (5 equal slots, 75px each):
```
|  [Users ]  [Dices ]  [BookOpen]  [Images]  [Ellipsis] |
|  Inventory  Guess     Journal    Albums     More      |
```
Wireframe, 5 pages or fewer (no More; slots share width equally via flex-1):
```
|   [Dices]    [BookOpen]    [Images]    [Users]  |
|   Guess       Journal       Albums      Admin   |
```

- **Slots**: `MAX_VISIBLE = 4` page tabs plus "More" = at most 5 slots, so each slot is
  75px wide at 375px (and ~64px at 320px). Show all pages inline when the total is 5 or
  fewer (`<= MAX_VISIBLE + 1`), since the "More" button would replace a single item.
- **Which pages are visible**: priority order is the present primary pages (`guess`,
  `feed`, `albums`, in that order), then the remaining pages in `PAGE_REGISTRY` order, with
  `admin` always last in priority. Take the first 4. Pass that slice to `getOrderedPages`
  so primary pages stay centered and non-primary ones flank them. Typical admin result with
  guess+feed+albums+calendar+...: calendar | guess feed albums | More. "More" is always the
  rightmost slot (thumb-friendly, matches platform convention). Positions are fixed
  by role/config, they never swap based on the current page, so the bar is predictable.
  The overflow list keeps `PAGE_REGISTRY` order of everything not visible.
- **Labels**: show a visible label under every icon (including "More"), so non-tech-savvy
  users don't rely on icons alone. `text-[11px] leading-[14px] font-medium`, `truncate`,
  `max-w-full px-0.5`, centered. French names (e.g. "Pronostics", "Inventaire", "Liste
  d'achats") fit about 10 characters at 75px; the rest truncates with ellipsis and the
  full name stays in the `title`-less accessible name (the text itself is the link name).
- **Dimensions**: each tab is `flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 py-1.5`,
  icon `h-6 w-6`, label 14px: content height 12 + 24 + 2 + 14 = 52px, which equals the
  current `3.25rem` spacer in `layout.tsx`, so no layout or bug-button change. Touch target
  is the full slot, 52px tall by at least 64px wide (above 44px). Keep the existing
  `touch-target` utility. Replace `min-w-14` with `min-w-0` and remove `overflow-x-auto`
  (use `overflow-hidden` is not needed; nothing overflows by construction).
- **Safe area**: unchanged: `paddingBottom: max(0.25rem, env(safe-area-inset-bottom))` on
  the `<nav>`. The menu is positioned relative to the trigger, so it clears the safe-area
  padding automatically.
- **Larger screens**: `md:hidden` unchanged. Desktop nav untouched.

#### Tab states
- Default: `text-muted-foreground`, `hover:text-foreground` (as now).
- Active: `text-primary`, label `font-semibold`; add `aria-current="page"`. No background
  or pill (keeps it calm and consistent with today).
- Focus: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset rounded-xl`
  (inset so the ring isn't clipped at the screen edge).
- "More" trigger: same classes as a tab. Active (`text-primary`, label `font-semibold`)
  when the current route belongs to an overflow page. While open (`data-popup-open`):
  `text-foreground`, unless active, then it stays `text-primary`.

#### Overflow menu
Wireframe (opens above the bar, right-aligned to the trigger):
```
                       +-------------------+
                       | [Package] Inventory|
                       | [ListChecks] To-do |
                       | [Baby]  Tracker    |
                       | [Users] Admin  *   |  (* active: text-primary + bg-accent)
                       +-------------------+
 [Cal]  [Guess] [Journal] [Albums]  [ ...  ]
 Cal     Guess   Journal   Albums    More
```
- **Surface decision**: reuse `DropdownMenu` (`src/components/ui/dropdown-menu.tsx`), not a
  Drawer. Reasons: no new primitive or dependency, already `z-[70]`, same pattern as
  `mobile_menu.tsx`, at most 6 short items, and no drawer-maturity risk.
- **Composition**: `DropdownMenu` > `DropdownMenuTrigger` (the "More" button) >
  `DropdownMenuContent side="top" align="end" sideOffset={8}` containing one
  `DropdownMenuItem` per overflow page, rendered as a link via Base UI's `render` prop
  (`render={<Link href={...} />}`), so it's a real anchor with keyboard and long-press
  behaviour.
- **Content overrides**: `DropdownMenuContent` defaults to `w-(--anchor-width)`, which
  would be only 75px; pass `className="w-56"` (14rem, enough for FR names), keeping the
  default `max-h-(--available-height)` + `overflow-y-auto`.
- **Items**: `className="min-h-12 gap-3 px-3 text-base"`, icon `size-5` from
  `ICONS_BY_PAGE_ID` (same icon as the page would have in the bar), label is `page.name`.
  Row height 48px (above 44px). Active item: `text-primary bg-accent/60` +
  `aria-current="page"`. Inactive: default menu styling.
- **Order inside the menu**: registry order, top to bottom (nearest to thumb is the last).
- **Typography and color**: DM Sans (UI text, no Fraunces here), tokens only:
  `text-muted-foreground`, `text-foreground`, `text-primary`, `bg-popover`, `bg-accent`,
  `ring-ring`. Works in dark mode via these tokens, no raw hex.
- **Interactions**: tap opens with the existing `slide-in-from-bottom-2` + fade/zoom from
  `DropdownMenuContent`. Selecting an item closes the menu (Base UI default
  `closeOnClick`) and navigates. Outside tap and Escape close it. While open, Base UI
  makes the rest of the page inert; that's fine.
- **Overlap with bug button**: the bug button sits bottom-left above the bar; the menu is
  right-aligned and `z-[70]` is above the button's `z-40`, so no conflict.

#### Icon
"More" uses `Ellipsis` (horizontal three dots, lucide). Not `Menu`, which is the header
account burger. Its label "More" sits under it like the other tabs.

#### Settings and logout
Stay in the header account menu (`mobile_menu.tsx`). Out of scope; not merged.

### States
- Loading: none. The bar renders from server-provided `accesses`; nothing new fetches.
- Empty: no allowed pages → bar not rendered (unchanged). Exactly one page → one tab,
  no More.
- Error: none new. A navigation failure falls through to the page's own error boundary.
- Success: the new page loads; the tab (or "More") shows `text-primary`.
- Offline / slow: links behave as today (Next prefetch/navigation). No extra state. The
  menu is purely client-side, so it opens instantly offline.
- Hidden: keyboard open and hub page handling unchanged. If the keyboard hides the bar
  while the menu is open, the component returns null and the menu unmounts, which is fine.

### Copy
| Key | English | French |
|-----|---------|--------|
| nav.more | More | Plus |
| nav.navigation (existing) | Navigation | Navigation |

### Accessibility
- `<nav aria-label={t('nav.navigation')}>`. Visible labels now provide the link names, so
  drop the `aria-label={page.name}` on tabs (avoids mismatch between visible and
  accessible name).
- `aria-current="page"` on the active tab and the active menu item.
- The More trigger's accessible name is its visible text "More"/"Plus"; Base UI adds
  `aria-haspopup="menu"` and `aria-expanded`. Icon is `aria-hidden`.
- Keyboard: Enter/Space/ArrowUp opens the menu, arrows move between items, Escape closes and
  returns focus to the trigger (Base UI Menu behaviour). Tab order follows the visual order.
- Contrast: `text-muted-foreground` and `text-primary` on `bg-background/95` as today;
  11px labels are the minimum size, don't go smaller. Active state is conveyed by color
  plus font weight, not color alone.
- Reduced motion: the dropdown animations come from tw-animate-css `data-open:animate-in`;
  add `motion-reduce:animate-none motion-reduce:duration-0` to the Content `className`.
- Z-index: bar `z-40` (floating chrome, unchanged); menu `z-[70]` (anchored floating, set by
  `DropdownMenuContent`). No new values, no `docs/z-index.md` change.

### Questions
- None blocking. Optional follow-up for the user: whether to also expose "Settings" and
  "Log out" in the More menu (not included here, to keep scope tight).
- Planner note: no data or permission impact. Only `splitNavPages` and `bottom_nav.tsx`,
  plus the `types.ts` comment, change.

## Risks and open questions
- **Hidden pages**: some pages become one tap further away. The hub page `/baby/[babyId]`
  still lists every page as a card.
- **Bug button overlap**: the bug-report button floats just above the bar on the left. The
  right-aligned `z-[70]` menu covers it only visually when open, which is fine.
- **Label truncation in French**: long page names truncate at 11px in 75px slots; check
  `pages.*.name` in fr during verification and shorten the message strings if needed.
- **Base UI `render={<Link/>}` on `Menu.Item`**: if it doesn't forward correctly, fall back to
  `onClick={() => router.push(href)}` on the item.

## How to verify
1. Use a narrow viewport (375px) as an admin of a baby with all 10 pages enabled.
   - The bar never scrolls horizontally: in the console, `nav.scrollWidth === nav.clientWidth`.
   - The "more" control opens, lists the remaining pages, and each one navigates there and
     closes the menu.
2. Open an overflow page (for example, Admin) directly. The "more" trigger shows the active
   state, and that item is highlighted in the menu.
3. As a viewer with only feed and guess enabled: 2 items show, with no "more" button.
4. With exactly `MAX_VISIBLE + 1` pages: all of them show inline, with no "more" button.
5. As a viewer of the same baby: admin-only pages (inventory, todo, tracker, admin) appear
   neither in the bar nor in the overflow.
6. On a baby the user has no access to: the bar doesn't render.
7. Focus a text input with the keyboard up: the bar is hidden.
8. On the hub page: the bar is hidden.
9. Check that the bug button isn't covered by the bar and that the bottom of the page content
   isn't hidden behind it (bar height is still 52px + safe area).
10. Check the menu opens above the header when the header is visible, and Escape closes it
    with focus back on "More".
11. Switch to fr: the "Plus" label and the page names are translated and not badly truncated.
12. Dark mode and `prefers-reduced-motion`: menu readable, no animation when reduced.
13. `pnpm typecheck` and `pnpm lint` pass.
