# Diaper changes (pee and poop tracking in Suivi)

Status: approved
Approved by: Baptiste Bergmann, 2026-11-08

## Approved decisions (these override anything below)
- **No dry diapers.** A diaper has pee or poop or both; keep the CHECK. Ignore every "if dry diapers become allowed" note.
- **Single day-summary tile.** The day summary stays at three existing tiles plus one **Diapers** tile reading "4 wet · 2 dirty", in place of the separate Wet and Dirty tiles and the 3 + 2 / `grid-cols-6` layout. Lay the four tiles out in the summary grid and match the loading skeleton. Replace the keys `summary.wet` and `summary.dirty` with `summary.diapers` (label "Diapers" / "Couches") and `summary.diapersValue` ("{wet} wet · {dirty} dirty" / "{wet} mouillées · {dirty} sales").
- **No newborn hints**, in this feature or as phase 2. Inventory decrement stays phase 2.
- **Colours, textures and French labels** ship as designed: black, green, yellow, brown, red, "White / pale"; liquid, seedy, soft, formed, hard. Button order stays Pee / Poop / Both.

## Goal
Let the people who use Suivi (`/baby/[babyId]/tracker`) log a diaper change in one tap (pee, poop or
both) and see wet/dirty counts and the time since the last change. Optional poop colour and texture
give parents something concrete to tell a pediatrician about a newborn.

## Out of scope
- Medical guidance or norms (expected wet diapers per day). Phase 2, see Risks.
- Inventory stock decrement. Phase 2, see Risks.
- Photos of diapers, push/email alerts, diaper size or brand.
- An undo toast after a quick log. A mis-tap is fixed from the day log (edit/delete).
- A new `edit_tracker_entry` MCP tool. MCP has none today for any kind.
- The app-wide RLS rollout (`rls.md`), which someone else owns.

## Current state
- **Table**: `care_events`, one polymorphic row per entry (`20261023100000_create_care_events.sql`,
  hardened in `20261023120000_harden_care_events_grants.sql`). It already has `baby_id`, `started_at`,
  `note` (max 500), `created_by` and `updated_by`. RLS uses `is_baby_member`; `anon` is fully revoked;
  `UPDATE` is granted per column.
- **Point-in-time precedent**: `bottle` has `timed: false`, so `ended_at` stays null.
- **Extension recipe**: the header of `src/utils/care-events.ts` and `done/baby-tracker.md` describe how
  to add a kind, using diaper as the example. `CARE_KIND_CONFIG` is a `Record<CareKind, …>`, so the
  compiler flags missed config.
- **Logic**: `src/utils/care-core.ts` is shared by Server Actions and MCP. Every core calls
  `assertTrackerAccessForUser`, uses a Pino child logger and calls `revalidateTracker`. Validation is in
  `src/utils/care-validation.ts`. `src/utils/actions/care_events.ts` holds thin wrappers that authenticate
  through `getAuthUser()`.
- **UI** (`src/app/baby/[babyId]/tracker/_components/`): `now_panel.tsx` (quick tiles from `CARE_KINDS`,
  `LastFeedCard`), `care_event_modal.tsx` (add/edit/delete, driven by `config.fields`), `care_log.tsx` and
  `kind_ui.ts` (`describeEvent`). The summary tiles are in `tracker/page.tsx`.
- **Analytics**: `src/utils/care-analytics.ts`, `care-analytics-chart.ts` and `tracker/analytics/`.
- **MCP**: `src/app/api/mcp/tools/tracker.ts` and `src/utils/digest-core.ts`, using the service-role client
  with access checked in the cores.
- **Realtime**: the relay subscribes to `care_events` per baby, so new kinds sync with no change.
- **Drift from `CLAUDE.md`**: Server Actions are in `src/utils/actions/`, and the Pino loggers and
  `revalidatePath` live in the cores that the actions wrap.

## Approach
**Add `diaper` as a new `care_event_kind`, not a separate table.** A diaper change is an instant, per-baby,
attributed entry, which `care_events` already models. The day log, edit modal, realtime, access checks, day
navigation, analytics paging and MCP delete all come for free, and the table was designed for this kind.

A separate table would need its own RLS, grants, realtime subscription, cores and a merge into the day log
for no gain. The cost of reusing the table is four nullable columns, guarded by CHECKs.

`pee` and `poop` are two booleans as requested, replacing the `diaper_type` text sketched in
`done/baby-tracker.md`, because wet and dirty counts then fall out directly.

## Data and migrations
Two files, because a new enum value can't be used in the transaction that adds it. No new table, so the
existing RLS and full revoke already apply.

**`20261108120000_add_care_event_kind_diaper.sql`**
```sql
ALTER TYPE "public"."care_event_kind" ADD VALUE 'diaper';
```

**`20261108120100_care_events_diaper_fields.sql`**
```sql
CREATE TYPE "public"."diaper_poop_color" AS ENUM ('black', 'green', 'yellow', 'brown', 'red', 'white');
CREATE TYPE "public"."diaper_poop_texture" AS ENUM ('liquid', 'seedy', 'soft', 'formed', 'hard');

ALTER TABLE "public"."care_events"
  ADD COLUMN "pee" boolean,
  ADD COLUMN "poop" boolean,
  ADD COLUMN "poop_color" "public"."diaper_poop_color",
  ADD COLUMN "poop_texture" "public"."diaper_poop_texture",
  ADD CONSTRAINT "care_events_diaper_fields" CHECK ("kind" <> 'diaper' OR (
    "pee" IS NOT NULL AND "poop" IS NOT NULL AND ("pee" OR "poop")
    AND "ended_at" IS NULL AND NOT "ongoing"
    AND "breast_side" IS NULL AND "amount_ml" IS NULL
    AND ("poop" OR ("poop_color" IS NULL AND "poop_texture" IS NULL))
  )),
  ADD CONSTRAINT "care_events_diaper_columns_only_diaper" CHECK ("kind" = 'diaper' OR (
    "pee" IS NULL AND "poop" IS NULL AND "poop_color" IS NULL AND "poop_texture" IS NULL
  ));

-- Column-level UPDATE: without this the web edit fails while MCP (service role) still works.
GRANT UPDATE ("pee", "poop", "poop_color", "poop_texture")
    ON TABLE "public"."care_events" TO "authenticated";
```
- The second CHECK covers the other kinds, so the three existing per-kind CHECKs stay untouched.
- Enums match `breast_side` on this table and give generated types.
- "Logged by" is the existing `created_by` / `created_by_name`. No new index:
  `care_events_baby_started_idx` serves the new reads.
- **`database.types.ts`**: `update_types` reads the live database, and migrations are applied only after
  reviewer sign-off. The builder hand-edits the types to the expected shape, then runs
  `mise run update_types` after `db push` and commits any difference.
- Apply with `mise exec -- pnpm supabase db push --debug` (the `--debug` flag avoids the known TLS failure),
  using the same `--db-url` as the `db_push` task.

## Access and security
- **No new route, action or endpoint.** The existing `createCareEvent`, `updateCareEvent` and
  `deleteCareEvent` carry the new fields: session via `getAuthUser()`, then
  `assertTrackerAccessForUser` (membership plus tracker page role) in the core.
- **New reads** (`lastDiaper`, range columns) sit inside `getTrackerNowCore` and `getTrackerRangeCore`,
  after the access check and filtered by `baby_id`.
- **RLS**: unchanged. `kind`, `baby_id` and `created_by` remain protected as they are today.
- **Service role**: MCP keeps using it, with no new use. Cores enforce access for `userId`.
- **Analytics privacy**: `CareAnalyticsRow` gains only `pee` and `poop`; no colour, note or author.
- **Stool details are health data**: they are visible only to members allowed on the tracker page, and are
  not added to digests or analytics.

## Steps
Each step is one commit plus its `CHANGELOG.md` follow-up. Run `pnpm typecheck` and `pnpm lint` after each.
No test runner exists in the repo, so pure logic is checked by hand as listed under How to verify.

1. **Migrations and types.** Add both files and hand-sync the types — files: `supabase/migrations/*`,
   `src/utils/supabase/database.types.ts`.
2. **Kind config and validation.** Add `diaper` to `CARE_KINDS` and `CARE_KIND_CONFIG` (`timed: false`,
   `quick: 'diaper'`, `fields: ['diaper', 'note']`, extending the `QuickAction` and `FormField` unions), and
   filter it out of the `NowPanel` tile loop until step 5. Add `POOP_COLORS`, `POOP_TEXTURES` and guards.
   Extend `CareEventInput` and `ValidatedCareFields` with `pee`, `poop`, `poopColor`, `poopTexture`; other
   kinds get null. Add `invalidDiaper` to `CareErrorKey`: rejected if neither flag is set, if a value is
   invalid, or if details come without poop. Add a `case 'diaper'` to `describeEvent`, and the `kinds`,
   `diaper` and `errors.codes.invalidDiaper` messages, so the build stays green — files:
   `src/utils/care-events.ts`, `src/utils/care-validation.ts`, `tracker/_components/kind_ui.ts`,
   `tracker/_components/now_panel.tsx`, `messages/*.json`.
3. **Core writes and reads.** Send the four columns in `updateCareEventCore` (the insert already spreads
   the validated fields). Add `lastDiaper` to `TrackerNow` as the full `CareEvent` (`id`, `pee`, `poop`, `poop_color`, `poop_texture`, not just a time; the details strip needs it). **`getTrackerNowCore` reads results by array
   position (`named[ongoingCount]`, `named[named.length - 1]`)**, so replace that with lookups by id rather
   than appending a query. Add `wetCount` and `dirtyCount` to `computeDayTotals` — files:
   `src/utils/care-core.ts`, `src/utils/care-time.ts`.
4. **Edit modal and day log.** Add the pee/poop controls, with colour and texture shown only when poop is
   on and cleared when it is turned off. The diaper must have at least one flag. The log row reads e.g.
   "Diaper · Poop · Yellow · Soft" — files: `tracker/_components/care_event_modal.tsx`, `kind_ui.ts`.
5. **Quick log and time since last change.** Three actions log immediately at now through `run()`, with no
   second step from the panel's resting state. Keep diaper out of the expand-on-tap tile behaviour, and fix
   the `aria-controls` ternary that assumes bottle or side chooser. Add `announce.*` messages and a
   last-change readout using `Elapsed` — files: `tracker/_components/now_panel.tsx`, `messages/*.json`.
6. **Day summary.** Add wet and dirty totals to the summary, and update `log.emptyTodayHint` — files:
   `tracker/page.tsx`, `messages/*.json`.
7. **Analytics computation.** Add `pee` and `poop` to the range select and to `AnalyticsRow`. Handle
   `diaper` in its own branch **before** `s.logged = true`, so a diaper-only day doesn't count as a zero
   sleep or feed day. Add `diaperCount`, `wetCount`, `dirtyCount` to `DayStats` (a "both" counts once in
   each, once in total). Add `hasDiaper`, `avgWetCount`, `avgDirtyCount` and `diaperLoggedDays` to
   `RangeSummary`, averaged over complete days with at least one diaper. In `weekBucket`, use a separate
   pool of diaper days. Set `TimelineDay.logged` to `logged || diaperCount > 0` and add diaper marks —
   files: `src/utils/care-core.ts`, `care-analytics.ts`, `care-analytics-chart.ts`.
8. **Analytics UI.** Add a `DiaperSection` copied from `BottleSection`, with stacked wet/dirty bars. Pass
   its chart and `buildItems` buckets with `logged` remapped to the diaper flag, so a day with only sleep
   reads "not logged" rather than 0. Add a wet tile, with a trend only when the previous period has at
   least `MIN_COMPARISON_DAYS` diaper days. Change `hasRangeData` and `averagesNote` to count diaper-only
   days. Add diaper marks to `DayTimeline` — files: `tracker/analytics/page.tsx`, `_components/*`.
9. **MCP.** `add_tracker_entry` gains kind `diaper` with `pee`, `poop`, `poopColor`, `poopTexture`.
   `formatEntry` returns them; `formatTotals` and the digest `totals()`, weekly sums and averages gain
   `wetCount` and `dirtyCount`; `get_tracker_status` and the day digest gain `lastDiaper`. Update tool
   descriptions. `list_tracker_entries` and `delete_tracker_entry` then work unchanged — files:
   `src/app/api/mcp/tools/tracker.ts`, `src/utils/digest-core.ts`.
10. **Docs.** Add `docs/features/Diaper changes.md`, linked from `docs/Le petit monde.md` and
    `Baby tracker.md`. Update `Tracker analytics.md` and `architecture/Data model.md` (table line and
    enums) and `architecture/MCP server.md`.
11. **Ship (after reviewer sign-off).** Run `db push`, run `update_types` and commit any diff, push `main`,
    wait for CI, then `mise run portainer_redeploy`. The migrations must land before the new image.

## Translations
Add to `en.json` and `fr.json`, under `tracker`:
- `kinds.diaper` ("Diaper" / "Couche").
- `diaper.pee`, `diaper.poop`, `diaper.both` ("Pee" / "Pipi", "Poop" / "Caca", "Both" / "Les deux").
- `diaper.colors.{black,green,yellow,brown,red,white}`, `diaper.textures.{liquid,seedy,soft,formed,hard}`.
- `form.diaperContents`, `form.poopColor`, `form.poopTexture`, `form.errors.diaperRequired`.
- `errors.codes.invalidDiaper` (also shown by MCP).
- `announce.diaperLogged`, `lastDiaper.title`, `lastDiaper.ago`, `lastDiaper.none`.
- `summary.wet`, `summary.dirty`.
- `analytics.sections.diapers`, `analytics.tiles.wet`, `analytics.metrics.wet`, `analytics.metrics.dirty`,
  `analytics.readout.diaperCount` (plural) with a non-plural weekly `…Avg` variant,
  `analytics.chart.summary.diaper`.
- Update the existing `log.emptyTodayHint`.
- Extra keys required by the design: see the Design > Copy table.

## Design

### User flow
1. Parent opens Suivi at night → sees the three timer tiles (Sleep, Breastfeed, Bottle), then a full-width **Diaper card** with three big buttons (Pee, Poop, Both) and the "Last diaper" readout inside it.
2. Taps **Pee**, **Poop** or **Both** → the tapped button shows a spinner for the round trip, the entry is created at now, the readout resets to "Pee · just now", a screen-reader announcement is made. No dialog, no toast.
3. If the log included poop → a quiet inline strip appears in the same card: "Poop logged at 03:12. [Add colour and texture]". It is optional and never blocks the next tap.
4. Taps **Add colour and texture** → the existing edit modal (`CareEventModal`) opens on that entry, scrolled to the poop details; picks colour and texture, saves → modal closes, the strip disappears, the log row shows the details.
5. Ignores the strip → it disappears after 60 s, on the next log, or on dismiss. The entry stays as logged.
6. Later, taps any diaper row in the day log → same modal in edit mode (change time, contents, colour, texture, note; delete).
7. The other parent's phone receives the entry through realtime → their Diaper card readout, day log and summary update with no action.
8. Manual add (the existing "Add entry" button) → kind picker now has Diaper; choosing it shows contents toggles and time.

### Screens

#### Diaper card (in `NowPanel`)
Wireframe (mobile, 375px):
```
 NOW
 +-----------+-----------+-----------+
 |   (moon)  |  (hand)   |  (milk)   |   existing 3 tiles, h-24, unchanged
 |   Sleep   | Breastfeed|  Bottle   |
 +-----------+-----------+-----------+
 +--------------------------------------+
 | DIAPER          Last: Poop · 2 h ago  |  <- header row
 | +----------+ +----------+ +----------+|
 | |  (drop)  | |  (dot)   | | (both)   ||  h-16 buttons, grid-cols-3
 | |   Pee    | |   Poop   | |  Both    ||
 | +----------+ +----------+ +----------+|
 | Poop logged at 03:12.                 |  <- strip, only after a poop log
 | [Add colour and texture]          (x) |
 +--------------------------------------+
 +--------------------------------------+
 | LAST FEED  ...                       |   existing LastFeedCard
 +--------------------------------------+
```
- Layout: placed directly under the tile grid and above `LastFeedCard`, so it is in the middle third of the phone, reachable by the thumb and clear of the top tiles' expand panels (the side chooser and bottle panel open between the grid and the Diaper card, which pushes the card down, never covers it). The tile grid stays `grid-cols-3`: **diaper is excluded from the tile grid entirely** (not a 4th tile, so the `CARE_KINDS.length >= 4` 2x2 switch is removed and replaced by a filter on timer/feed kinds). The three buttons are `grid grid-cols-3 gap-2`, each `h-16` (64 px, well over 44 px), `rounded-2xl`, icon above label, equal width so the thumb never has to aim. Gap of `gap-2` (8 px) plus the full-width card padding keeps mis-taps low. On `md` the panel is the left 5fr column; the card is the same, nothing changes. When a timer is running (`RunningCard` above the tiles) the Diaper card stays fully usable.
- Components: `Card`/`CardContent` (`@/components/ui/card`, same classes as `LastFeedCard`: `border-landing-border bg-landing-surface`), `Button variant="outline"` for the three actions (same as the tiles), `Loader2` for pending, `Elapsed` for the readout. New component `DiaperCard` in `tracker/_components/diaper_card.tsx` (client, extracted from `now_panel.tsx` to keep that file from growing; it receives `run`, `busy`, `pendingKey`, `state` as props). No new primitive.
- Typography and color: card heading `text-xs font-semibold uppercase tracking-wider text-muted-foreground` like other section labels; readout `text-sm text-muted-foreground`, with the elapsed time `font-semibold text-landing-foreground`. Button label `text-sm font-semibold`. Icon badge uses `CARE_TONE_CLASSES['chart-1']` (**new tone `chart-1`**: add `'chart-1'` to `CareKindConfig['tone']` and `'chart-1': 'bg-chart-1/15 text-chart-1'` to `CARE_TONE_CLASSES`. `chart-1` is the warm amber token, in light and dark, and is the only free hue: chart-4 is sleep, rose is breastfeed, sage is bottle). Kind icon `Baby` (lucide) for the log and form; button icons `Droplet` (pee), `CircleDot` (poop), `Droplets` (both). Icons are decorative; the words carry meaning.
- Interactions: tap logs at now via `run('diaper-pee' | 'diaper-poop' | 'diaper-both', () => createCareEvent(babyId, { kind: 'diaper', pee, poop }), { announce: t('announce.diaperLogged'), errorKey: 'save' })`. While any `run` is in flight, all three get `aria-disabled` (not `disabled`, so focus is not lost), and `run` already returns early on `busy`, which gives a single entry on a double tap. The strip's button opens `CareEventModal` with the new event (the builder takes it from the refreshed `state.lastDiaper`, which therefore must be the full `CareEvent` including `id`, `poop_color`, `poop_texture`; flagged below). Dismiss (x) is `size-11`. No optimistic insert: the existing panel waits for the server and refreshes, keep that.

Strip behaviour (the "no slowdown" rule): it is rendered in reserved flow below the buttons but only after a poop/both log; it never moves the three buttons (they are above it), so a second one-handed tap after a log lands on the same spot. Auto-hide after 60 s with no animation needed; `motion-safe:animate-in fade-in` (tw-animate-css) on appearance only.

#### Edit modal: diaper fields (`care_event_modal.tsx`)
Wireframe (mobile, inside existing `Modal`):
```
 [Baby] Edit entry
 Time
 [ 2026-11-08 03:12            ]
 CONTENTS
 +--------------+ +--------------+
 | [v] Pee      | |    Poop      |     toggle buttons, h-12, multi-select
 +--------------+ +--------------+
 Choose at least one                    <- only when none selected
 POOP COLOUR (optional)
 ( ) Black  ( ) Green  ( ) Yellow       2 cols on 375px, 3 from sm
 ( ) Brown  ( ) Red    ( ) White
 [Clear colour]
 TEXTURE (optional)
 [Liquid] [Seedy] [Soft] [Formed] [Hard]
 [Clear texture]
 NOTE
 [                                 ]
 ----------------------------------------
 [Delete]                [Cancel] [Save]
```
- Layout: same `flex flex-col gap-1.5` field blocks, `labelClass` labels. Field order: kind (add only) / time / contents / colour / texture / note. Colour and texture blocks render only when Poop is on; turning Poop off clears both values immediately (state reset in the handler, no confirmation: they are optional details and re-selecting is 2 taps). When opened from the "Add colour and texture" strip, Poop is already on and the colour block is scrolled into view (`scrollIntoView({ block: 'nearest' })` after mount, skipped under `prefers-reduced-motion` smoothness).
- Components: Contents = two toggle buttons built with `@base-ui/react/toggle` (or `Checkbox`) styled like `ChoiceGroup`'s `Radio.Root` classes (`h-12 rounded-2xl border border-border bg-input/50`, on-state `border-primary bg-primary/15`, and a `Check` icon when on, so it is not colour-only). They are multi-select, so `ChoiceGroup` (a radiogroup) cannot be reused; extract the shared class string into the new file `src/components/toggle_choice.tsx` (`ToggleChoice` and `ToggleChoiceGroup` with `role="group"` and `aria-label`). Colour and texture reuse **`ChoiceGroup`** (single choice) with a new optional prop `layout: 'row' | 'grid'` (`grid` = `grid-cols-2 sm:grid-cols-3`, no `grid-flow-col`) and an optional per-option `swatch` render. The colour options are a swatch dot (`size-4 rounded-full ring-1 ring-border`) plus the word, always both. Swatch classes use existing tokens only: black `bg-foreground`, green `bg-sage`, yellow `bg-chart-1/60`, brown `bg-chart-5`, red `bg-destructive`, white `bg-background` with `ring-foreground/40`. They approximate the colour; the word is what carries the information. "Clear colour" and "Clear texture" are `Button variant="ghost"` (`h-11`), shown only when a value is set (radios cannot be unselected). Kind picker: with 4 kinds, `ChoiceGroup`'s one-row grid is too tight in French ("Allaitement" at ~80 px); use the same new `layout="grid"` (2 columns) for the kind picker.
- Typography and color: as existing form (`text-sm`, `labelClass`, `text-destructive` errors).
- Interactions: validation (`errors.contents`) is shown when the user has touched the toggles or tried to save: "Choose at least one" in `text-sm text-destructive` with `role="alert"`; Save is `disabled` while none is selected (same as other invalid states). The add form starts with nothing selected (no silent default, so a wrong entry is never saved). The server also rejects it (`invalidDiaper` toast as backstop). Changing kind to/from diaper resets diaper fields like `changeKind` does for side/amount. The modal stays at `z-[60]` through the existing `Modal`; nothing here portals, so no new z-index.

#### Day log row (`care_log.tsx`)
Wireframe:
```
 +----------------------------------------------+
 | (Baby)  Diaper · Poop · Yellow · Soft       > |
 |         03:12                                 |
 |         Gentle note text if any               |
 |         By Marie                              |
 +----------------------------------------------+
```
- Same row shell (`CareLogRow`, `min-h-16`), tone badge `chart-1`, `Baby` icon. Title from `describeEvent`: "Diaper · Pee", "Diaper · Poop", "Diaper · Pee and poop", then " · {colour}" and " · {texture}" when set, all words. The title line changes from `truncate` to `line-clamp-2` for all kinds (French "Couche · Pipi et caca · Jaune · Molle" overflows 375px), the row grows. No end time, no duration (like bottle). The aria-label stays `log.editEntry` with the same summary.
- Day summary (`page.tsx`): the `<dl>` becomes `grid-cols-6`; the existing three tiles take `col-span-2`, the new **Wet** and **Dirty** tiles `col-span-3` (a 3 + 2 layout, at every width; five tiles in the 7fr column are too tight on one row). A "both" counts in each. Zero shows `0`, not the em dash (a day with no diaper is a real count).
- Empty day: unchanged component; only `log.emptyTodayHint` is reworded to mention diapers.

#### Last-change readout
Inside the Diaper card header, right-aligned, wraps under the heading on narrow widths. "Last: Poop · 2 h ago" with `Elapsed format="ago"`, so it ticks like `LastFeedCard`. Empty: "No diaper logged yet" in `text-muted-foreground`. The type shown is the contents of the last event (Pee, Poop, Pee and poop). Colour/texture are not shown here (health detail, kept to the log and modal). No suggestion or warning thresholds (norms are phase 2).

#### Analytics: wet/dirty section, tile and chart
- New `DiaperSection` copied from `BottleSection`, heading `SectionHeading kind="diaper"` (extend its kind prop; badge tone `chart-1`). Chart: `InspectBarChart` with **stacked bars**, wet at the bottom, dirty on top, same height (160), no average line unless the total average is shown (average line = average total per day, `avgWetCount + avgDirtyCount`, labelled in text).
- Series styles in `chart_styles.tsx` (`BarStyle` adds `wet` and `dirty`): `wet` = solid `fill-chart-1` (swatch `bg-chart-1`); `dirty` = hatch pattern `fill-chart-5/25` with `stroke-chart-5` (same recipe as `day`, swatch `bg-chart-5/25 bg-[repeating-linear-gradient(45deg,var(--color-chart-5)_0_2px,transparent_2px_6px)]`). So the two series differ by fill vs hatch, not only by colour. Legend via `LegendItem` ("Wet", "Dirty") above the chart.
- Inspect readout and the accessible data table (already provided by `InspectBarChart`) show both counts per bucket as numbers: `cells: [wet, dirty]`, table headers "Wet" and "Dirty".
- Tile (`stat_cards.tsx`): "Wet diapers / day" with the average; trend arrow only with enough comparison days (plan step 8). One tile only, dirty count lives in the section readout. Unlogged days show "Not logged" (existing pattern), never 0.
- 24 h history marks (`day_timeline.tsx`): new mark is an **upward triangle** (`size-2 bg-chart-1 [clip-path:polygon(50%_0,100%_100%,0_100%)]`), distinct from bar (sleep), circle (breast), diamond (bottle). It sits at the bottom of the track (`absolute bottom-0.5 z-10 -translate-x-1/2`, `left: {pct}%`) so it does not collide with feed marks, which are centred. Wet and dirty use the same triangle (the distinction is in the day page, not worth tiny glyphs). Add a legend entry with the same shape (`kinds.diaper`). Marks stay inside the `isolate` track at local `z-0`/`z-10`; the track is `aria-hidden`, so the row `aria-label` summary gains the diaper count (`analytics.timeline.summary` extended with `{diapers}`). The row still being one 44 px+ link (`min-h-11`) is unchanged.

### States
- Loading: `tracker/loading.tsx` skeleton gets one more `Skeleton` block (`h-28 rounded-3xl`) between the tile row and the last-feed card, and the summary skeleton becomes the 3 + 2 grid. Analytics `loading.tsx`: add one section skeleton matching the other chart sections. While a log is pending: tapped button shows `Loader2` in place of its icon (like tiles), the other two are `aria-disabled` and dimmed by the existing disabled styles.
- Empty: readout "No diaper logged yet", buttons enabled. Day log empty hint reworded. Diaper analytics: if the range has no diaper rows, the section shows the same "no data in this period" muted text the other sections use rather than empty bars; a diaper-only day never makes sleep/feed show zero.
- Error: save failure → `toast.error(t('errors.save'))` or `errors.network` for TypeError (existing `run`). Nothing is added on screen, the buttons re-enable; `router.refresh()` in `finally` resyncs. Validation failure in the modal: inline `role="alert"` text plus disabled Save; server `invalidDiaper` as a toast. Stale edit (other parent deleted it): existing `conflict`/`notFound` path closes the modal and refreshes.
- Success: no toast for the quick log (the readout reset and the log row are the feedback, plus the sr-only status). Modal save closes the modal, as today. The details strip is the only added success UI.
- Offline / slow: `useOnline()` false → the existing offline banner shows and the three buttons are `aria-disabled` (a tap does nothing; no queued writes), same as the tiles. On slow network the spinner stays on the tapped button until it resolves; taps are ignored meanwhile. Realtime from the other parent: `TrackerLive` triggers a refresh; the readout, summary tiles and log update in place with no announcement (an unsolicited live region would wake a screen-reader user). If the other parent logs while the strip is showing, the strip is hidden because it no longer matches `state.lastDiaper`.
- If dry diapers become allowed (open question 1): Contents gets a third toggle "Dry" that is mutually exclusive with Pee/Poop (selecting it clears them and hides colour and texture); the Save-disabled rule goes away; the row title reads "Diaper · Dry"; no quick button is added (the card keeps three); Wet/Dirty counts exclude dry; a "diaper count" total would be needed in the summary and chart (a dry diaper counts in none of the stacked series, so show the total in the readout). Server and CHECK change as already noted in the plan.

### Copy
| Key | English | French |
|-----|---------|--------|
| tracker.kinds.diaper | Diaper | Couche |
| tracker.diaper.title | Diaper | Couche |
| tracker.diaper.pee | Pee | Pipi |
| tracker.diaper.poop | Poop | Caca |
| tracker.diaper.both | Both | Les deux |
| tracker.diaper.bothLong | Pee and poop | Pipi et caca |
| tracker.diaper.logPee | Log a pee diaper now | Enregistrer une couche pipi maintenant |
| tracker.diaper.logPoop | Log a poop diaper now | Enregistrer une couche caca maintenant |
| tracker.diaper.logBoth | Log a pee and poop diaper now | Enregistrer une couche pipi et caca maintenant |
| tracker.diaper.detailsPrompt | {type} logged at {time}. | {type} enregistré à {time}. |
| tracker.diaper.addDetails | Add colour and texture | Ajouter couleur et texture |
| tracker.diaper.dismiss | Dismiss | Fermer |
| tracker.diaper.clearColor | Clear colour | Effacer la couleur |
| tracker.diaper.clearTexture | Clear texture | Effacer la texture |
| tracker.diaper.colors.black | Black | Noir |
| tracker.diaper.colors.green | Green | Vert |
| tracker.diaper.colors.yellow | Yellow | Jaune |
| tracker.diaper.colors.brown | Brown | Marron |
| tracker.diaper.colors.red | Red | Rouge |
| tracker.diaper.colors.white | White / pale | Blanc / pâle |
| tracker.diaper.textures.liquid | Liquid | Liquide |
| tracker.diaper.textures.seedy | Seedy | Grumeleux |
| tracker.diaper.textures.soft | Soft | Mou |
| tracker.diaper.textures.formed | Formed | Moulé |
| tracker.diaper.textures.hard | Hard | Dur |
| tracker.form.diaperContents | Contents | Contenu |
| tracker.form.poopColor | Poop colour (optional) | Couleur du caca (facultatif) |
| tracker.form.poopTexture | Texture (optional) | Texture (facultatif) |
| tracker.form.errors.diaperRequired | Choose pee, poop or both. | Choisissez pipi, caca ou les deux. |
| tracker.errors.codes.invalidDiaper | A diaper needs pee, poop or both, and details only apply to poop. | Une couche doit contenir du pipi, du caca ou les deux, et les détails ne concernent que le caca. |
| tracker.announce.diaperLogged | Diaper logged. | Couche enregistrée. |
| tracker.lastDiaper.title | Last change | Dernier change |
| tracker.lastDiaper.ago | {type} · {ago} | {type} · {ago} |
| tracker.lastDiaper.none | No diaper logged yet | Aucune couche enregistrée |
| tracker.summary.wet | Wet | Mouillées |
| tracker.summary.dirty | Dirty | Sales |
| tracker.analytics.sections.diapers | Diapers | Couches |
| tracker.analytics.metrics.wet | Wet | Mouillées |
| tracker.analytics.metrics.dirty | Dirty | Sales |
| tracker.analytics.tiles.wet | Wet / day | Mouillées / jour |
| tracker.analytics.timeline.summary | (append) {diapers} diapers | (ajouter) {diapers} couches |

Plan-listed keys not repeated here (`log.emptyTodayHint`, `analytics.readout.diaperCount`, `analytics.chart.summary.diaper`) are written by the builder in the same tone: the empty hint becomes "Log a sleep, feed or diaper change to get started." / "Enregistrez un sommeil, une tétée ou un change pour commencer."

### Accessibility
- The three quick buttons are real `<button>`s with visible text plus an `aria-label` from `diaper.logPee/Poop/Both` (full action, as the visible word alone is ambiguous out of context). `aria-disabled` + `busy` (not `disabled`) keeps focus and stops double logging. Tab order: tiles, Diaper card buttons, details button, dismiss, last-feed card.
- Success is announced through the existing sr-only `role="status"` (`announce.diaperLogged`). Realtime changes are not announced.
- Targets: quick buttons `h-16`, strip button and dismiss `h-11`/`size-11`, modal toggles and choices `h-12`, clear buttons `h-11`.
- Contents toggles expose pressed/checked state (`aria-pressed` via Base UI Toggle) and show a `Check`; colour options show a text label and a `Check` when selected, never swatch alone; chart series differ by fill vs hatch with a text legend and a data table; the timeline mark has its own shape and the row link carries the count in text.
- Colour contrast: text on `bg-chart-1/15` badge uses the same pattern as the other tones; the `chart-1` mark on `bg-muted/60` is a decorative second cue. Dark mode is defined for `chart-1`, `chart-5`, `sage` in `globals.css`, so the swatches and marks adapt; check `yellow` (chart-1/60) against `bg-input/50` in both modes.
- The details strip is not a modal, steals no focus and has no timeout that removes an action while it is focused (the timer pauses while the strip contains focus). The auto-hide is only a tidy-up, the same action remains in the day log.
- Motion: only `motion-safe:` animations (spinner is already standard, strip fade is `motion-safe:animate-in`).
- Z-index (`docs/z-index.md`): no new value. Diaper card and strip are in normal flow. The modal keeps `z-[60]`. Timeline marks use local `z-0`/`z-10` inside the existing `isolate` track. No popover or portal is added (colour and texture are inline choices, not a Select).

### Questions
1. **`lastDiaper` payload (planner)**: the details strip needs the full `CareEvent` (id, `poop_color`, `poop_texture`, `pee`, `poop`) in `TrackerNow.lastDiaper`, not just a time. Plan step 3 should say so. The `CareEvent` type and its read in `getTrackerNowCore` need the four new columns.
2. **Dry diapers**: design above is provisional (not loggable). Do you want a "Dry" option? If yes, it is a form-only toggle, not a fourth quick button; see the note under States.
3. **Colour list**: "white / pale" is the one label I would change from the plan's `white`, because pale or clay-coloured stool is the one a pediatrician most wants reported. Enum value stays `white`. Is that wording OK? Also the French "Mou/Moulé/Grumeleux" are my wording; confirm they match what you would say.
4. **Should "Both" be first, in the middle, or last?** Designed as Pee / Poop / Both, left to right. Poop is the one where details matter, so it is not placed at an edge reachable by accident.
5. **Wet/dirty tile vs summary**: designed as 3 + 2 tiles in the day summary. If you prefer to keep the summary at three tiles, the alternative is one "Diapers" tile showing "4 wet · 2 dirty".

## Risks and open questions
**Risks**
- **Irreversible enum value**: `ADD VALUE` can't be cleanly removed. The rest of the migration is additive.
- **Older images crash on diaper rows**: `CARE_KIND_CONFIG[event.kind].icon` throws on an unknown kind. If
  the `:prod` stack shares the database with `:latest`, one diaper logged on dev breaks Suivi on prod until
  `:prod` is promoted.
- **Column grant**: a missing `GRANT UPDATE` passes through MCP but fails web edits, so test editing on web.

**Phase 2**
- **Newborn hints**: `done/tracker-analytics.md` excluded norms from analytics. Age-based hints would also
  read `baby_health_profiles`, which is gated by a different page, and need a sourced medical text.
- **Inventory**: `inventory_items` has `quantity_owned` and the `adjust_inventory_owned` RPC, but `name` and
  `kind` are free text, so there is no reliable "diaper" row. It needs a per-baby item link, handling for
  size changes, and reversal on delete. The inventory page role can also differ from the tracker's.

**Open questions**
1. Should a dry diaper (no pee, no poop) be loggable? The plan says no, since all three quick actions imply
   content. Allowing it means relaxing one CHECK and adding a form option.
2. Are the colour list (black, green, yellow, brown, red, white) and texture list (liquid, seedy, soft,
   formed, hard) right for you? They are cheapest to change before the migration.
3. Do the `:latest` and `:prod` stacks share one database? If so, promote `:prod` right after verifying,
   before logging real diapers.
4. Do you want the phase 2 newborn hints at all, and from which source (pediatrician, Santé publique)?

## How to verify
1. Quick log pee, poop and both: each creates one entry at now, appears on a second phone through realtime,
   and updates the wet/dirty totals (a "both" adds one to each).
2. Rapid double tap creates one entry.
3. As an authenticated member on web, edit an entry to add colour and texture, then turn poop off: the
   details are cleared and the save succeeds. Delete it.
4. Saving with neither flag shows the translated error. A future time is rejected.
5. The last-change readout updates, and shows the empty state on a baby with no diapers.
6. Analytics: a diaper-only day leaves the sleep and feed averages unchanged, and a sleep-only day reads
   "not logged" in the diaper chart. Check daily (`7d`, `30d`) and weekly (`90d`) bars, the 24 h history, and
   a DST day.
7. Existing kinds: add, edit and delete a sleep, breastfeed and bottle with no regression.
8. MCP: `add_tracker_entry` with `kind: 'diaper'`, `pee: true`, then `list_tracker_entries` and
   `get_tracker_status` return it. A call with neither flag returns the translated error.
9. In French, every new string is translated.
10. **User without access**: a non-member, a viewer when the tracker role is admin, and a disabled tracker
    page are all refused on the page, the actions and MCP. Via SQL as `anon`, `care_events` stays unreadable.
11. Design checks at 375px in French: no clipped text in the Diaper card, the log row (two-line title) or
    the modal; the details strip appears after poop and both only, and never after pee; dark mode swatches
    and the hatch/solid chart series are distinguishable.
