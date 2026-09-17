# Albums page mobile overflow — plan

## Context

Reported bug: on the Albums page (`/baby/[babyId]/albums`), content near the top
of the page extends beyond the phone screen width (horizontal scroll/overflow
on mobile).

## Investigation findings

Grepped the whole layout chain (`src/app/globals.css`, `src/app/layout.tsx`)
and confirmed: **there is no `overflow-x: hidden` anywhere in the app**, on
`html`, `body`, or any layout wrapper. That means any single element that's
even a few pixels too wide, anywhere in the page tree, makes the *entire
page* horizontally scrollable — there's no containment to limit the damage
to one section.

Three candidates were found; none is a confirmed smoking gun from static
code alone, so **step 1 of implementation is to reproduce in devtools**
(narrow viewport, inspect `document.documentElement.scrollWidth` vs
`clientWidth`, walk up from whichever element is actually wider) before
touching code.

### Candidate 1 (most likely) — decorative hero blur circle

`src/app/baby/[babyId]/albums/page.tsx` lines 30–36:

```tsx
<div className="bg-landing-background text-landing-foreground">
  <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
    <div
      aria-hidden
      className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
    />
    ...
```

The circle is `h-72 w-72` (288px), centered on the inner `max-w-4xl`
container, whose real width on mobile is `100vw - 32px` (`px-4` both sides).
On any viewport narrower than ~320px this box already exceeds the container.
Even when the box technically fits, `blur-3xl` (64px blur radius) paints
well past the element's own box — and with no `overflow-hidden` on any
ancestor, that paint region can register as real scrollable content.

**This exact pattern is duplicated verbatim on 4 other pages** — `feed/page.tsx`
(~L40–45), `guess/page.tsx`, `calendar/page.tsx`, `anecdotes/page.tsx` — so if
it's the culprit, all five need the same fix, and the bug likely isn't
actually Albums-specific (worth confirming with the user whether Feed/
Calendar/etc. show the same overflow).

### Candidate 2 — header title truncation

`src/app/_header/header.tsx` (fixed header) renders `SiteTitle`
(`src/app/_header/site_title.tsx`) inside a `flex items-center gap-2 sm:gap-4
min-w-0` row. `SiteTitle`'s root `Link` is `className="flex shrink-0 items-center
gap-2 ..."`, wrapping an inner `<span className="... truncate">`. Because the
`Link` itself is `shrink-0`, the truncate span never gets forced narrower
than its content — so a long baby name + app name combo can push the header
wider than the viewport. This would affect **every page**, not just Albums.

### Candidate 3 (probably not it) — Feed's story tray

`src/app/baby/[babyId]/feed/_components/story_tray.tsx` (L94, L116) is a
horizontal-scroll bubble carousel (`flex gap-3 overflow-x-auto`) at the top
of the Feed page. It already declares its own `overflow-x-auto`, so it's
self-contained and shouldn't leak page-level overflow — flagged only in case
the repro is actually on Feed, not Albums.

## Fix plan

1. **Reproduce first.** Open Albums (and Feed, to check if it's shared) at a
   narrow width (320px/375px) in devtools, confirm which element(s) actually
   have `scrollWidth > clientWidth` on `<html>`/`<body>`. Don't blind-fix all
   three candidates without confirming at least the primary one.
2. **Contain the decorative hero circle.** Add `overflow-hidden` to the outer
   `bg-landing-background` wrapper (the one enclosing the `relative
   mx-auto max-w-4xl ...` container) on all five pages that share this
   pattern: `albums/page.tsx`, `feed/page.tsx`, `guess/page.tsx`,
   `calendar/page.tsx`, `anecdotes/page.tsx`. The circle is purely decorative
   (`aria-hidden`, `pointer-events-none`), so clipping it is visually safe —
   it just won't bleed past the page edge anymore. One-line change × 5 files.
3. **Fix header truncation.** In `src/app/_header/site_title.tsx`, remove
   `shrink-0` from the root `Link` (or move it to just the icon/logo element
   if one exists inside) so the `truncate` span can actually shrink below its
   content width when space is tight. Verify with a long baby name at 320px.
4. **Add a defensive safety net.** Since the app has zero horizontal-overflow
   containment anywhere today, add `overflow-x-hidden` on `<body>` in
   `src/app/layout.tsx` (or `html, body { overflow-x: hidden }` in
   `globals.css`) regardless of which specific element turns out to be the
   root cause. This is a one-line, low-risk addition that prevents this whole
   class of bug from resurfacing elsewhere; it doesn't fix a bad layout, it
   just stops a bad layout from breaking the whole page's scroll.
5. **Verify manually** at 320px (iPhone SE) and 375px (iPhone 12/13) widths
   on Albums, Feed, Calendar, Guess, and Anecdotes: no horizontal scroll, hero
   circle still visible but clipped at the edge, header title truncates with
   `…` instead of overflowing.

## File list

**Edited:**
- `src/app/baby/[babyId]/albums/page.tsx`
- `src/app/baby/[babyId]/feed/page.tsx`
- `src/app/baby/[babyId]/guess/page.tsx`
- `src/app/baby/[babyId]/calendar/page.tsx`
- `src/app/baby/[babyId]/anecdotes/page.tsx`
- `src/app/_header/site_title.tsx`
- `src/app/layout.tsx` (or `src/app/globals.css`)

## Git workflow

Per CLAUDE.md, small independently-verified commits:
1. `fix(layout): contain decorative hero blur within page bounds` (step 2, all 5 pages)
2. `fix(header): allow site title to truncate on narrow viewports` (step 3)
3. `fix(layout): prevent page-level horizontal scroll` (step 4, the defensive net)

Each followed by its own `CHANGELOG.md` update commit.
