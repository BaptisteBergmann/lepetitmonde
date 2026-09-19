# Z-Index Scale

This app had a recurring bug class: a floating/portaled element (a `Popover`,
`Select`, `DropdownMenu`, or `Dialog`) rendered *underneath* a full-screen
overlay it was opened from, because both portal to `document.body` and
whichever one has the lower `z-index` loses regardless of DOM order once both
have an explicit value. Fixed instances: the story reaction picker
(`f10b508`), `Select`/`DropdownMenu`/`Dialog` inside modals (`7b240d7`), and
the original header-occlusion bug across all full-screen modals (`e5daf55`,
`c8bee1b`).

To stop this from recurring, every `z-index` in this codebase must be one of
the shared tiers below — never a bespoke value picked to "just get above" one
specific neighbor.

| Tier | Value | Use for | Examples |
|---|---|---|---|
| Local raise | `z-0` / `z-10` | Ordering siblings *inside* your own `isolate` stacking context. Never needs to compete with anything outside that container. | Calendar month-grid edge columns (`z-0`) and the focused day cell (`z-10`) in `components/ui/calendar.tsx`; pull-to-refresh background vs. content in `components/pull_to_refresh.tsx`; hero copy over decorative art in `app/_home/landing.tsx` |
| Floating chrome | `z-40` | Persistent floating UI that sits above normal page content but below the header and any overlay. | The floating bug-report button (`components/bug_report_button.tsx`) |
| Site chrome | `z-50` | The fixed site header only. Reserved — nothing else should claim `z-50`. | `app/_header/header.tsx` |
| Full-screen overlay | `z-[60]` | Anything with a `fixed inset-0` backdrop covering the whole viewport. Must outrank the header. | `Dialog` (`components/ui/dialog.tsx`), all custom `*_modal.tsx` components, the story viewer, the photo lightbox |
| Anchored floating content | `z-[70]` | Content that portals to `document.body` and anchors to a trigger element (not full-screen). Must outrank the overlay tier because it can be opened *from inside* a full-screen overlay (e.g. the visibility `Select` inside `create_post_modal`, or the reaction `Popover` inside the story viewer). | `Popover`, `Select`, `DropdownMenu` (`components/ui/*.tsx`) |
| Toasts | *(unmanaged)* | Toast notifications. Sonner sets its own internal z-index far above app content — don't add an app-level `z-index` for these. | `components/ui/sonner.tsx` |

## Rules

1. **Don't invent a new top-level value.** If you're adding a new full-screen
   modal, use `z-[60]`. If you're adding a new anchored popover-style
   component (tooltip, combobox, context menu...), use `z-[70]`.
2. **Anchored floating content is always `z-[70]`, even if today nothing puts
   it inside an overlay.** It's cheap to be consistent up front and expensive
   to rediscover this bug the next time someone nests one.
3. **`z-50` is reserved for the header.** Don't reach for `z-50` as a generic
   "make sure this is on top" value — it isn't top of anything anymore.
4. **Local tiers (`z-0`/`z-10`) only make sense paired with `isolate`** (or
   another new-stacking-context trigger) on an ancestor. Without that, they
   leak into the global stacking order and can collide with the shared tiers
   above.
5. When two elements from the *same* tier can both be open at once (e.g. two
   `z-[60]` overlays, or stacked `Dialog`s), DOM mount order decides the
   winner (later-mounted wins) — that's an acceptable, existing pattern for
   same-tier stacking. It's only a problem across tiers.
