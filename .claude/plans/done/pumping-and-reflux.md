# Pumping and reflux (two new entry kinds in Suivi)

## Status: implemented
Shipped 2026-11-19 (ec52b88..7aa8ed0): `pumping` and `reflux` kinds, quick log, modal, day log, 6 summary
tiles, analytics (incl. the optional sections), MCP, docs. Follows the Approved decisions. Deviations: the
pump side `ChoiceGroup` uses `disabled` (not `aria-disabled`) while busy; unknown-kind hardening for older
images not done. Open low review items: focus returns to `<body>` after a quick log, "pumpings" wording in
the EN timeline aria-label, hand-written severity union in `care-analytics.ts`.

Status: approved
Approved by: Baptiste Bergmann, 2026-11-19

## Approved decisions (these override anything below)
- **No pumping timer.** Pumping is point-in-time (D1 as recommended).
- **Pumping prefill is 50 ml**: the stepper starts from the last pumped amount, else 50 ml (a dedicated
  `pumpDefault`, not `bottleDefault` / 90 ml). Ignore every "90 ml" for pumping below.
- **Reflux severities are `small / medium / large`**, labelled "Petit / Moyen / Gros" (FR) and
  "Small / Medium / Large" (EN). The enum is `reflux_severity AS ENUM ('small', 'medium', 'large')`. This
  replaces every `light / moderate / heavy`, "Léger / Moyen / Abondant" below, including i18n keys
  (`severities.small|medium|large`, `logSmall|logMedium|logLarge`), aria-labels ("Enregistrer un petit
  reflux maintenant", …), the `invalidSeverity` error ("Choisissez petit, moyen ou gros.") and the
  `run('reflux-small' | …)` ids. Reword the reflux question in French accordingly if needed.
- **Pumping shares the `rose` tone with breastfeed.** Rest of the design ships as written (D2–D7, "0" for
  empty pumping tile, last-pumped readout in the tile hint).

## Open decisions (recommended defaults, user to confirm)
- **D1. Pumping is point-in-time, not a timer (recommended).** Logged like a bottle: `started_at` = when,
  optional `amount_ml` (1–1000), optional side (left / right / both, reusing `breast_side`). No end, never
  `ongoing`. A timer would mean adding `pumping` to `TIMER_KINDS` and touching `RunningCard`, the stop flow,
  the MCP start/stop tools, the offline `startPayload` and the one-running-timer index semantics. That is a
  lot of surface for a duration most parents don't need. If wanted later, it is additive (relax the CHECK).
- **D2. Pumping side is optional.** Unlike breastfeed (side required), a pumping entry may have no side.
- **D3. Reflux is point-in-time with an optional severity** `light / moderate / heavy` ("Léger / Moyen /
  Abondant", "Light / Moderate / Heavy") plus the existing note. No medical advice or thresholds anywhere.
- **D4. Quick log behaviour (behaviour only, layout to the designer):**
  - Pumping: one tap opens an amount stepper like the bottle panel (prefilled with the last pumping amount,
    else `bottleDefault`), with an optional side choice, "Log" and "Log without amount".
  - Reflux: one tap opens three severity buttons; each logs immediately at now. A "Log without detail"
    option logs with no severity.
- **D5. Day summary: two new tiles (recommended)**, "Tire-lait" = "3 · 240 ml" (or just "3" when no amounts,
  "—" when none) and "Reflux" = "2" (zero shown as "0"). Grid goes from 4 to 6 tiles in `grid-cols-2`, i.e.
  three even rows on mobile. Alternative rejected: folding into "Bottles" (would mix the parent's milk with
  the baby's intake) or showing tiles only when non-zero (odd tile count, layout jumps between days).
- **D6. Analytics: correctness in v1, charts optional.** v1 guarantees pumping/reflux never skew sleep or
  feed stats and adds marks to the 24 h timeline. Dedicated "Pumping" and "Reflux" sections (steps 9–10)
  are included but can be cut to a follow-up without breaking anything.
- **D7. "Last pumping" readout** ("Last pumped 3 h ago") in the pumping quick action, since pump intervals
  matter to the pumping parent. Costs one extra small query in `getTrackerNowCore`. No "last reflux" readout.

## Goal
Let the family log breast pumping sessions (tire-lait, with optional amount and side) and baby reflux /
spit-up episodes (with optional severity) from Suivi, see them in the day log and summary, and query them
through MCP. Pumping is the parent's milk expression and never counts as a baby feed.

## Out of scope
- Pumped-milk stock / inventory linkage (freezer stash, using pumped milk in a bottle).
- A pumping timer (see D1), pump duration, per-side amounts.
- Medical guidance, reflux norms, alerts, push or email.
- A new MCP edit tool (none exists for any kind).
- The app-wide RLS rollout (`rls.md`, owned elsewhere).

## Current state
- **Table**: polymorphic `care_events` (`20261023100000_create_care_events.sql`, grants hardened in
  `20261023120000_harden_care_events_grants.sql`, diaper columns in `20261108120100_care_events_diaper_fields.sql`).
  RLS via `is_baby_member`, `anon` fully revoked, column-level `UPDATE` grant. Per-kind CHECKs are guarded by
  `kind <> '<kind>' OR …`, so they don't constrain new kinds. `care_events_diaper_columns_only_diaper`
  already forces `pee/poop/poop_color/poop_texture` null for any non-diaper kind, new ones included.
- **Kinds**: `src/utils/care-events.ts` (`CARE_KINDS`, `CARE_KIND_CONFIG` as `Record<CareKind, …>`,
  `FEED_KINDS = ['breastfeed', 'bottle']`, `TIMER_KINDS`, tones). Extension recipe in the file header.
- **Validation**: `src/utils/care-validation.ts`. `fields.includes('side')` calls `assertSide`, which makes
  side **required**; there is no optional-side path yet.
- **Core**: `src/utils/care-core.ts`. `getTrackerNowCore` reads `lastFeed` with `.in('kind', FEED_KINDS)` and
  `lastBreastfeed` with `kind = 'breastfeed'`, and looks results up by id. So last-feed card, next-side
  suggestion and feed counts already exclude any new kind. `computeDayTotals` is in `src/utils/care-time.ts`.
- **Actions**: `src/utils/actions/care_events.ts`, thin wrappers over the cores (`getAuthUser()` then
  `assertTrackerAccessForUser`). No new action needed.
- **UI** (`src/app/baby/[babyId]/tracker/`): `page.tsx` (subtitle, 4 summary tiles in `grid-cols-2`),
  `loading.tsx` (skeleton mirror), `_components/now_panel.tsx` (`TILE_KINDS` = kinds except diaper,
  `BottlePanel`, side chooser, `aria-controls` ternary), `diaper_card.tsx`, `care_event_modal.tsx`
  (`config.fields` driven, `changeKind` resets), `care_log.tsx` / `care_log_row.tsx`, `kind_ui.ts`
  (`describeEvent`, default case returns just the name).
- **Analytics**: `src/utils/care-analytics.ts` sets `s.logged = true` for every non-sleep, non-diaper kind
  before checking `FEED_SET`, so **a new kind would mark the day as logged and create zero sleep/feed days**
  unless it branches out first, as diaper does. Plus `care-analytics-chart.ts` and `tracker/analytics/`.
- **MCP**: `src/app/api/mcp/tools/tracker.ts` (`add_tracker_entry` has a hard-coded
  `z.enum(['sleep','breastfeed','bottle','diaper'])`, `formatEntry`, `formatTotals`, descriptions),
  `src/app/api/mcp/tools/digest.ts`, `src/utils/digest-core.ts`.
- **Offline sync**: `src/app/api/tracker/sync/route.ts` (`createPayload` uses `CARE_KINDS` but lists
  per-kind fields explicitly). No client calls it yet (`offline-tracker.md` is approved, in progress).
- **Copy**: `tracker.subtitle` and `pages.tracker.description` read "Sommeil et tétées, notés par toute la
  famille." / "Sleep and feeds, logged by the whole family." (already stale since diapers).
- **Locales**: only `messages/en.json` and `messages/fr.json`.
- **Docs**: `docs/features/Baby tracker.md`, `Diaper changes.md` (precedent), `Tracker analytics.md`,
  `docs/architecture/Data model.md`, `MCP server.md`; hub `docs/Le petit monde.md`.
- **Drift from `CLAUDE.md`**: Server Actions are in `src/utils/actions/`; Pino loggers and
  `revalidatePath` live in the cores; there is no `@/utils/supabase/client`.

## Approach
Add `pumping` and `reflux` as two new `care_event_kind` values on `care_events`, exactly like `diaper`
(`.claude/plans/diaper-changes.md`). Day log, edit/delete, realtime, access checks, day navigation, MCP list
and delete come for free. Pumping reuses `amount_ml` and `breast_side`; reflux gets one new nullable enum
column. Pumping stays out of `FEED_KINDS`, which is what keeps it out of every feed metric. A separate table
was rejected for the same reasons as for diapers (own RLS, grants, realtime, merge into the day log).

## Data and migrations
Two files (a new enum value can't be used in the transaction that adds it). No new table, so existing RLS,
the `anon` revoke and realtime already apply. Additive only.

**`20261119120000_add_care_event_kinds_pumping_reflux.sql`**
```sql
ALTER TYPE "public"."care_event_kind" ADD VALUE 'pumping';
ALTER TYPE "public"."care_event_kind" ADD VALUE 'reflux';
```

**`20261119120100_care_events_pumping_reflux_fields.sql`**
```sql
CREATE TYPE "public"."reflux_severity" AS ENUM ('light', 'moderate', 'heavy');

ALTER TABLE "public"."care_events"
  ADD COLUMN "reflux_severity" "public"."reflux_severity",
  ADD CONSTRAINT "care_events_pumping_fields" CHECK ("kind" <> 'pumping' OR (
    "ended_at" IS NULL AND NOT "ongoing"
    AND ("amount_ml" IS NULL OR "amount_ml" BETWEEN 1 AND 1000)
  )),
  ADD CONSTRAINT "care_events_reflux_fields" CHECK ("kind" <> 'reflux' OR (
    "ended_at" IS NULL AND NOT "ongoing" AND "breast_side" IS NULL AND "amount_ml" IS NULL
  )),
  ADD CONSTRAINT "care_events_reflux_severity_only_reflux" CHECK ("kind" = 'reflux' OR "reflux_severity" IS NULL);

GRANT UPDATE ("reflux_severity") ON TABLE "public"."care_events" TO "authenticated";
```
- Pumping's `breast_side` is nullable on purpose (D2); diaper columns are already forced null by the existing
  `care_events_diaper_columns_only_diaper`.
- No new index: `care_events_baby_started_idx` serves the new reads.
- **`database.types.ts`**: migrations are applied only after reviewer sign-off, so the builder hand-edits
  `src/utils/supabase/database.types.ts` (two enum values, `reflux_severity` enum, column in Row/Insert/Update),
  then after `db push` runs `mise exec -- pnpm supabase gen types …` via `mise run update_types` and commits
  any diff.
- Apply with `mise exec -- pnpm supabase db push --debug` (the `--debug` flag avoids the known TLS failure).

## Access and security
- **No new route, action or endpoint.** `createCareEvent` / `updateCareEvent` / `deleteCareEvent` carry the
  new fields: session via `getAuthUser()`, then `assertTrackerAccessForUser` (baby membership + tracker page
  role) in the core. `kind` stays immutable on update (taken from the stored row).
- **New read** `lastPumping` sits in `getTrackerNowCore` after the access check, filtered by `baby_id`.
- **RLS**: unchanged. **Service role**: MCP keeps using it with access enforced in the cores; no new use.
- **Analytics privacy**: `CareAnalyticsRow` gains only `reflux_severity` if D6 sections ship (counts by
  severity), never note or author. Pumping uses existing `amount_ml`.
- **Health data**: reflux severity is visible only to tracker-page members; digests get counts only, no
  severity.

## Steps
Each step is one commit plus its `CHANGELOG.md` follow-up. Run `pnpm typecheck` and `pnpm lint` after each.

1. **`feat(tracker): add pumping and reflux kinds to care_events`** — migrations + hand-synced types.
   Files: `supabase/migrations/20261119120000_*.sql`, `20261119120100_*.sql`,
   `src/utils/supabase/database.types.ts`.
2. **`feat(tracker): kind config and validation for pumping and reflux`** — add both to `CARE_KINDS`
   (order: sleep, breastfeed, bottle, pumping, diaper, reflux) and `CARE_KIND_CONFIG`:
   `pumping: { timed: false, quick: 'pump', fields: ['optionalSide', 'amount', 'note'] }`,
   `reflux: { timed: false, quick: 'reflux', fields: ['refluxSeverity', 'note'] }`; icons and tones per the
   designer (placeholder lucide icons until then). Extend `QuickAction` and `FormField`. Add
   `REFLUX_SEVERITIES` + `isRefluxSeverity`. In validation: `optionalSide` accepts null/undefined else
   `assertSide`; `refluxSeverity` null or valid else new error key `invalidSeverity`; other kinds get
   `reflux_severity: null`. Add `refluxSeverity` to `CareEventInput` and `reflux_severity` to
   `ValidatedCareFields`. Add `case 'pumping'` / `case 'reflux'` to `describeEvent` ("Tire-lait · Gauche ·
   120 ml", "Reflux · Abondant"). Exclude both from `TILE_KINDS` until step 5. Add `kinds.*`,
   `pumping.*`, `reflux.severities.*`, `errors.codes.invalidSeverity` messages. Do **not** touch
   `FEED_KINDS`. Files: `src/utils/care-events.ts`, `src/utils/care-validation.ts`,
   `tracker/_components/kind_ui.ts`, `tracker/_components/now_panel.tsx`, `messages/*.json`.
3. **`feat(tracker): persist and read pumping and reflux fields`** — send `reflux_severity` in
   `updateCareEventCore` (insert already spreads validated fields). Add `lastPumping: CareEvent | null` to
   `TrackerNow` (one more query, looked up by id like the others). Add `pumpCount`, `pumpMl`, `refluxCount`
   to `DayTotals` / `computeDayTotals` (counted on the day they started). Add `refluxSeverity` to the
   offline `createPayload` in `src/app/api/tracker/sync/route.ts`. Files: `src/utils/care-core.ts`,
   `src/utils/care-time.ts`, `src/app/api/tracker/sync/route.ts`.
4. **`feat(tracker): pumping and reflux in the entry modal and day log`** — optional side (with a clear
   control, since radios can't unselect) and amount for pumping; optional severity for reflux; `changeKind`
   resets `refluxSeverity`. Kind picker now lists 6 kinds (designer). Files:
   `tracker/_components/care_event_modal.tsx`, `kind_ui.ts`, `messages/*.json`.
5. **`feat(tracker): quick log for pumping and reflux`** — behaviour per D4/D7: pumping panel (generalise
   `BottlePanel` with an optional side row rather than copy it), `lastPumping` readout and prefill; reflux
   severity chooser where each tap logs at now through `run()`. New `pendingKey`s, `announce.pumpLogged`,
   `announce.refluxLogged`. Fix the `aria-controls` / `OpenAction` handling so it isn't a bottle-or-side
   ternary. Files: `tracker/_components/now_panel.tsx` (or new `pump_panel.tsx` / `reflux_card.tsx` per
   design), `messages/*.json`.
6. **`feat(tracker): pumping and reflux day summary tiles`** — two tiles per D5, update `loading.tsx`
   skeleton to 6 tiles, update `tracker.subtitle`, `pages.tracker.description` and `log.emptyTodayHint`.
   Files: `tracker/page.tsx`, `tracker/loading.tsx`, `messages/*.json`.
7. **`fix(tracker): keep pumping and reflux out of sleep and feed analytics`** — in `care-analytics.ts`
   branch `pumping` and `reflux` out **before** `s.logged = true` (as diaper does); count `pumpCount`,
   `pumpMl`, `refluxCount` in `DayStats`; `TimelineDay.logged` and `hasRangeData` include them; add
   timeline marks (`TimelinePump`, `TimelineReflux`, start minute only). Add `reflux_severity` to the range
   select only if step 9 ships. Files: `src/utils/care-analytics.ts`, `care-analytics-chart.ts`,
   `src/utils/care-core.ts`, `tracker/analytics/page.tsx`, `_components/day_timeline.tsx`.
8. **`feat(mcp): pumping and reflux tracker entries`** — `add_tracker_entry` kind enum built from
   `CARE_KINDS` (no more hard-coded list) plus `refluxSeverity`; side optional for pumping. `formatEntry`
   returns `refluxSeverity`; `formatTotals`, digest `totals()`, weekly sums and averages gain `pumpCount`,
   `pumpMl`, `refluxCount`; `get_tracker_status` returns `lastPumping`. Update tool descriptions, stating
   that pumping is the parent's expressed milk and is not a feed. Files: `src/app/api/mcp/tools/tracker.ts`,
   `src/app/api/mcp/tools/digest.ts`, `src/utils/digest-core.ts`.
9. **(D6, optional) `feat(tracker): pumping and reflux analytics sections`** — `PumpSection` copied from
   `BottleSection` (sessions and ml per day) and `RefluxSection` copied from `DiaperSection` (episodes per
   day, optionally stacked by severity), shown only when the range has entries; averages over days with at
   least one entry of that kind. Files: `tracker/analytics/page.tsx`, `_components/pump_section.tsx`,
   `_components/reflux_section.tsx`, `src/utils/care-analytics.ts`, `messages/*.json`.
10. **`docs(tracker): document pumping and reflux`** — new `docs/features/Pumping and reflux.md` (copy the
    `Diaper changes.md` structure, include the deployment note), linked from `docs/Le petit monde.md` and
    `Baby tracker.md`; update `Baby tracker.md` (kinds list), `Tracker analytics.md`,
    `architecture/Data model.md` (enum values, column, CHECKs), `architecture/MCP server.md`.
11. **Ship (after reviewer sign-off)** — `db push --debug`, `mise run update_types` and commit any diff, push
    `main`, wait for CI, `mise run portainer_redeploy`. Migrations must land before the new image.

## Translations
Only `messages/en.json` and `messages/fr.json` exist. Under `tracker`:
- `kinds.pumping` ("Pumping" / "Tire-lait"), `kinds.reflux` ("Reflux" / "Reflux").
- `reflux.severities.{light,moderate,heavy}` ("Light / Moderate / Heavy", "Léger / Moyen / Abondant"),
  `reflux.noDetail`, `form.refluxSeverity`, `form.pumpSide`, `form.clearSide`, `quick.pumpTitle`,
  `quick.refluxTitle`.
- `lastPumping.title`, `lastPumping.ago`, `lastPumping.none`.
- `announce.pumpLogged`, `announce.refluxLogged`.
- `summary.pumping`, `summary.pumpingValue` ("{count} · {amount} ml"), `summary.reflux`.
- `errors.codes.invalidSeverity` (also surfaced by MCP).
- Updated: `subtitle` and `pages.tracker.description` → "Sommeil, tétées, couches, tire-lait et reflux,
  notés par toute la famille." / "Sleep, feeds, diapers, pumping and reflux, logged by the whole family.";
  `log.emptyTodayHint`.
- If step 9 ships: `analytics.sections.pumping`, `analytics.sections.reflux`, matching readout/metric keys.
- Extra keys required by the design: see the Design section (its Copy table is the source of truth; where it
  differs from the list above, the Copy table wins).

## Design

### User flow
1. Parent opens Suivi → "Right now" shows the three existing tiles (Sleep, Breastfeed, Bottle), directly
   under them a **second, compact row of two tiles (Pumping, Reflux)**, then the Diaper card and the last
   feed card. Nothing existing moves left or right; the Diaper card moves down by one compact row (72 px).
2. **Pumping.** Taps the Pumping tile → an inline panel opens under the tile rows (same place and same
   behaviour as the bottle panel; any other open panel closes) → amount stepper is prefilled with the last
   pumped amount (else 90 ml), optional side buttons below it → taps **Log pumping** (or **Log without
   amount**) → panel closes, the tile's hint resets to "just now", a screen-reader announcement is made, the
   day log and summary tile update.
3. **Reflux.** Taps the Reflux tile → inline panel with three big buttons Light / Moderate / Heavy and a
   quieter "Log without detail" → taps one → logged at now, panel closes, announcement, summary tile +1.
4. A mis-tap is fixed from the day log: tap the row → the existing edit modal (change time, side, amount,
   severity, note; delete). No undo toast (same rule as diapers).
5. Manual add ("Add entry") → the kind picker now shows six kinds; Pumping shows time, optional side,
   optional amount, note; Reflux shows time, optional severity, note.
6. The other parent's phone updates by realtime (tile hint, summary, log), with no announcement.

### Screens

#### Now panel: layout with six quick actions (`now_panel.tsx`)
Wireframe (mobile, 375px, nothing open):
```
 RIGHT NOW
 +-----------+-----------+-----------+
 |  (moon)   |  (hand)   |  (milk)   |   existing 3 tiles, h-24, unchanged
 |  Sleep    |Breastfeed |  Bottle   |
 |  Start    |  Start    |   Log     |
 +-----------+-----------+-----------+
 +--------------------+--------------------+
 | (beaker) Pumping   | (waves)  Reflux    |   NEW: 2 compact tiles, min-h-16
 |          3 h ago   |          Log       |
 +--------------------+--------------------+
 +--------------------------------------+
 | DIAPER             Last: Poop · 2 h  |   existing Diaper card, unchanged
 | [ Pee ]  [ Poop ]  [ Both ]          |
 +--------------------------------------+
 +--------------------------------------+
 | LAST FEED ...                        |   existing
 +--------------------------------------+
```
Pumping panel open (appears between the tile rows and the Diaper card, like the bottle panel):
```
 +--------------------+--------------------+
 |[(beaker) Pumping]  | (waves)  Reflux    |   open tile: ring-2 ring-primary
 +--------------------+--------------------+
 +--------------------------------------+
 | Pumping session                   (x)|  <- font-display title + 44px close
 |   [-]    [  120  ] ml    [+]         |  <- stepper, same as BottlePanel
 | SIDE (OPTIONAL)                      |
 | [ Left ] [ Both ] [ Right ]          |  <- ChoiceGroup, none selected at first
 | [Clear side]                         |  <- ghost h-11, only once a side is set
 | [        Log pumping               ] |  <- h-14 primary
 | [      Log without amount          ] |  <- ghost h-11
 +--------------------------------------+
```
Reflux panel open:
```
 +--------------------------------------+
 | How much came up?                 (x)|
 | [  Light  ] [ Moderate ] [  Heavy  ] |  <- h-14, each logs immediately
 | [        Log without detail         ] |  <- ghost h-11
 +--------------------------------------+
```
- Layout: keep the existing `grid grid-cols-3 gap-2` for the three timer/feed tiles untouched. Add a second
  `grid grid-cols-2 gap-2` directly below it, in the same `space-y-3` flow, so the two new tiles sit in the
  top third of the phone and every panel (side chooser, bottle, pump, reflux) opens in the one slot between
  the tile rows and the Diaper card. Only one panel is open at a time (`openAction` stays a single value).
  Rejected: a 3x2 grid of six equal `h-24` tiles (pushes the Diaper card down 104 px and makes the new,
  rarer actions as prominent as sleep/feed) and a "More" menu (hides actions). The second row is `h-auto
  min-h-16` so a wrapped French hint cannot clip. On `md` the panel is the 5fr left column and works the
  same; nothing changes except the two tiles being a little wider.
- Components: reuse `Button variant="outline"`, `Card`/`CardContent` (`border-landing-border
  bg-landing-surface`), `ChoiceGroup` (`@/components/choice_group`, `layout="row"` for the side),
  `Loader2`, `Minus`/`Plus`/`X`, `Elapsed`. Generalise `BottlePanel` into one amount panel with props
  `id`, `title`, `initial`, `logLabel`, `noAmountLabel`, `pendingKeys`, and an optional `children` slot
  rendered between the stepper and the Log button (used for the pumping side row). The input id becomes
  `${id}-amount` (today it is a fixed `bottle-amount`, which would collide). The reflux panel is a small new
  inline component `RefluxPanel` in `now_panel.tsx` (or `reflux_panel.tsx`), same card shell, no new
  primitive.
- Second-row tile classes: `h-auto min-h-16 flex-row justify-start gap-3 whitespace-normal rounded-3xl
  border-landing-border bg-landing-surface px-3 py-2 text-left text-landing-foreground`, plus `ring-2
  ring-primary` when open (same as the existing tiles). Content: icon badge `size-8 rounded-full` with
  `CARE_TONE_CLASSES[tone]` and an `size-5` icon, then a column with the kind name (`text-sm
  font-semibold`) and a hint (`text-xs font-normal text-muted-foreground`).
- Pumping tile hint (this is D7's readout; it replaces a readout inside the panel, so the panel stays short
  and the readout stays visible while it is open and after it closes): when `state.lastPumping` exists, the
  hint is `<Elapsed since={lastPumping.started_at} now={state.now} format="ago" />` ("3 h ago" / "il y a
  3 h") preceded by an `sr-only` "Last pumped". Otherwise the hint is "Log" (`quick.log`). The Reflux tile
  hint is always "Log". Nothing about the last reflux (per D7).
- Typography and color: panel titles `font-display text-base font-semibold` (as the existing panels), small
  labels `text-xs font-semibold uppercase tracking-wider text-muted-foreground`. **Tones**: pumping uses
  `rose` (it is breast-related and the family reads it as "the parent's side"); reflux uses a new tone
  `chart-5` (neutral warm grey-brown, deliberately calm: not `destructive`, reflux is common and must not
  look like an alarm). Add `'chart-5'` to `CareKindConfig['tone']` and `'chart-5': 'bg-chart-5/15
  text-chart-5'` to `CARE_TONE_CLASSES`. All four vivid hues are already taken, so pumping shares `rose`
  with breastfeed: the icon and the word always travel with the colour, so rows are never told apart by
  colour alone. Dark mode: `rose` and `chart-5` both have dark variants in `globals.css`.
- **Icons** (lucide, same set as the rest): pumping `Beaker` (a collection cup; `Milk` is the bottle,
  `Droplet(s)` are the diaper), reflux `Waves` (an upward, flowing motion, no medical connotation). Icons are
  decorative, the words carry the meaning. If `Beaker` is not exported by the installed lucide-react
  (1.23.0), use `FlaskRound`. Set both in `CARE_KIND_CONFIG` and use `config.icon` everywhere (tile, modal
  kind picker, log row).
- Interactions:
  - Tile tap: `onTile` toggles `openAction` to `'pumping'` / `'reflux'` (no network call). Tile has
    `aria-expanded` and `aria-controls` from a lookup `PANEL_ID = { breastfeed: 'side-chooser', bottle:
    'bottle-panel', pumping: 'pump-panel', reflux: 'reflux-panel' }`, replacing the bottle-or-side ternary.
    `OpenAction` becomes `'breastfeed' | 'bottle' | 'pumping' | 'reflux' | null`. Split `TILE_KINDS` into
    `ROW1_KINDS` (quick `timer` / `side-timer` / `amount`) and `ROW2_KINDS` (quick `pump` / `reflux`); diaper
    stays out of both.
  - Pump panel: stepper step 10 ml (`CARE_LIMITS.bottleStep`), range 1–1000, initial value
    `state.lastPumping?.amount_ml ?? CARE_LIMITS.bottleDefault`. Side: `ChoiceGroup` Left / Both / Right with
    `BREAST_SIDES` order (left, both, right), none selected by default (no silent default). Once a side is
    set, "Clear side" (ghost, `h-11`, left aligned) appears and resets it. **Log pumping** calls
    `run('pump', () => createCareEvent(babyId, { kind: 'pumping', amountMl, side }), { announce:
    t('announce.pumpLogged'), errorKey: 'save', onSuccess: close })`; **Log without amount** uses key
    `'pump-none'` and omits `amountMl` but still sends the side if one is chosen. `side` is omitted when
    none is chosen.
  - Reflux panel: three buttons `h-14 rounded-2xl text-base`, equal width, in `grid grid-cols-3 gap-2`
    (identical to the side chooser, words only, no icon so they cannot be confused with the diaper droplets).
    Each calls `run('reflux-light' | 'reflux-moderate' | 'reflux-heavy', () => createCareEvent(babyId,
    { kind: 'reflux', refluxSeverity }), …)`. "Log without detail" uses key `'reflux-none'`. While any `run`
    is in flight all controls get `aria-disabled` (not `disabled`, so focus stays) and `run` ignores taps
    (single entry on a double tap). The tapped button shows `Loader2` in place of its label, as in the side
    chooser. Panel closes on success, stays open on error.
  - Focus: opening a panel focuses its first control (`data-autofocus`): the `-` button for pumping (as the
    bottle panel does today), "Light" for reflux. `Escape` closes the panel and returns focus to its tile
    (existing `closePanel(true)` logic). After success, focus returns to the tile.
  - No optimistic insert; the panel waits for the server and `router.refresh()` (existing).
- Floating layers: nothing floats. Panels are inline in normal flow; no popover, select or portal. No z-index
  value is added (`docs/z-index.md`: the only overlay involved is the existing edit modal at `z-[60]`).

#### Add / edit modal: fields per kind (`care_event_modal.tsx`)
Wireframes (mobile, inside the existing `Modal`):
```
 Kind picker (add only)             Pumping                    Reflux
 TYPE                               TIME                       TIME
 [Sleep]      [Breastfeed]          [ 2026-11-19 03:12   ]     [ 2026-11-19 03:12   ]
 [Bottle]     [Pumping]             SIDE (OPTIONAL)            SEVERITY (OPTIONAL)
 [Diaper]     [Reflux]              [Left][Both][Right]        [Light][Moderate][Heavy]
                                    [Clear side]               [Clear severity]
                                    AMOUNT (ML)                NOTE (OPTIONAL)
                                    [ e.g. 120 ] ml            [                      ]
                                    NOTE (OPTIONAL)
                                    [                      ]
```
- Layout: the kind picker stays `ChoiceGroup layout="grid-2"` (two columns, three rows; the new order puts
  related pairs together: Sleep/Breastfeed, Bottle/Pumping, Diaper/Reflux). "Tire-lait" and "Allaitement"-length
  labels fit a half-width option with the icon. Field order per kind: kind (add only) / time (label
  `form.time`, not timed) / kind fields / note. Same `flex flex-col gap-1.5` blocks and `labelClass` labels.
- Pumping: **side** is a `ChoiceGroup` (left, both, right) labelled `form.pumpSide` ("Side (optional)"), no
  error state, nothing selected on a new entry. A ghost `Button` "Clear side" (`h-11 self-start`, text
  `form.clearSide`) appears only when a side is set, the same pattern as the diaper "Clear colour". **Amount**
  is the existing field (`form.amount`, placeholder `form.amountPlaceholder`, `ml` suffix), optional, same
  1–1000 validation and inline error. Both are saved as null when empty. New form field `optionalSide`
  renders the ChoiceGroup without a required error; the existing `side` field keeps its required error
  (`errors.side`).
- Reflux: **severity** is a `ChoiceGroup layout="row"` (three options) labelled `form.refluxSeverity`
  ("Severity (optional)"), nothing selected by default, with a ghost "Clear severity" button once set. A row
  of three fits at 375px in French (about 100 px each; "Abondant" plus the check icon needs about 86 px at
  `text-sm`). If the builder sees it wrapping, switch to `layout="grid"`.
- `changeKind` resets `side`, `amount`, `refluxSeverity` (and the diaper fields) as it does today; the start
  time and the note carry over. Save sends `side` only for `side` / `optionalSide` fields, `amountMl` only for
  `amount`, `refluxSeverity` only for `refluxSeverity`, else null (the server rejects stray values anyway).
- Edit mode shows the kind as a fixed line (icon + name), as today. Save is disabled only by the existing
  invalid states (time in the future, bad amount). Nothing is required for pumping or reflux except the time.
- The modal stays `z-[60]` through `Modal`; no new layer.

#### Day log row (`care_log.tsx`, `describeEvent` in `kind_ui.ts`)
Wireframe:
```
 +----------------------------------------------+
 | (beaker)  Pumping · Left · 120 ml          > |
 |           03:12                               |
 |           By Marie                            |
 +----------------------------------------------+
 | (waves)   Reflux · Heavy                   > |
 |           05:40                               |
 +----------------------------------------------+
```
- Same row shell (`CareLogRow`, `min-h-16`), point-in-time like bottle (no end time, no duration). Tone badge
  and icon from the kind config (pumping `rose`/`Beaker`, reflux `chart-5`/`Waves`).
- `describeEvent`: `pumping` → `[name, side && t('sides.<side>'), amount && t('summary.amount', {amount})]
  .filter(Boolean).join(' · ')`; `reflux` → `[name, severity && t('reflux.severities.<severity>')]...`.
  Examples: "Pumping · Left · 120 ml", "Pumping · Both", "Pumping · 90 ml", "Pumping" (nothing set),
  "Reflux · Heavy", "Reflux". FR: "Tire-lait · Gauche · 120 ml", "Tire-lait · Les deux", "Reflux · Abondant".
  Unlike bottle, a pumping entry with no amount does **not** show "Amount not set": both details are optional
  here, so the row should not read like something is missing. The existing `log.editEntry` aria-label
  ("Edit: {summary}") is unchanged and carries the same summary.
- A French title such as "Tire-lait · Les deux · 120 ml" is about 28 characters and fits one line at 375px,
  and the row title already wraps (diaper precedent: title `line-clamp-2`), so nothing truncates.

#### Day summary tiles (`tracker/page.tsx`) and skeleton (`loading.tsx`)
Wireframe (mobile):
```
 +----------------+----------------+
 |   2 h 40       |      5         |
 |   Sleep        |    feeds       |
 +----------------+----------------+
 |   240 ml       | 4 wet · 2 dirty|
 |   Bottles      |    Diapers     |
 +----------------+----------------+
 | 3 · 240 ml     |      2         |   NEW
 |   Pumping      |    Reflux      |   NEW
 +----------------+----------------+
```
- Layout: the `<dl>` stays `grid grid-cols-2 gap-2` at every width (three even rows). Do **not** go to three
  columns on `md`: the 7fr column is about 480 px and "4 mouillées · 2 sales" would wrap in a 150 px tile.
  Same tile markup as today (`flex flex-col-reverse rounded-2xl border border-landing-border
  bg-landing-surface p-3 text-center`, `dd` `font-display font-semibold`, `dt` `text-xs
  text-muted-foreground`). Order: sleep, feeds, bottles, diapers, pumping, reflux.
- Pumping tile: label `summary.pumping`, value `small: true` (`text-base`, like Diapers): `"{count} · {amount}
  ml"` when there is a count and at least one amount, `"{count}"` when sessions exist but none has an amount,
  and `"0"` when there are none (**see Questions, I disagree with "—"**). Reflux tile: label `summary.reflux`,
  value `text-xl`, always the count, `0` included. Neither tile ever shows a severity or any judgement.
- Pumping never changes the Feeds or Bottles tiles (guaranteed by `FEED_KINDS`, step 7 for analytics).
- Skeleton (`loading.tsx`): in the quick-actions block insert one `div className="grid grid-cols-2 gap-2"`
  with two `h-16 rounded-3xl bg-muted` blocks between the three `h-24` tiles and the existing `h-28`
  diaper skeleton; the summary skeleton map goes from `[0, 1, 2, 3]` to `[0, 1, 2, 3, 4, 5]` (same `h-16
  rounded-2xl bg-muted` blocks in `grid-cols-2`). Update the file's header comment.

#### 24 h history marks (step 7, `analytics/_components/day_timeline.tsx`)
Existing marks: bar (sleep), circle (breastfeed), diamond (bottle), upward triangle at the bottom (diaper).
New: **pumping = hollow rounded square** (`size-2 rounded-[2px] border-2 border-rose bg-transparent`,
centred, start minute only); **reflux = downward triangle at the top of the track** (`size-2 bg-chart-5
[clip-path:polygon(0_0,100%_0,50%_100%)]`, `absolute top-0.5 -translate-x-1/2`, so it never collides with the
bottom diaper triangle or the centred feed marks). Add both to the legend with the same shapes (`kinds.pumping`,
`kinds.reflux`) and add pumping and reflux counts to the row's `aria-label` summary (the track is
`aria-hidden`). Marks stay at local `z-0`/`z-10` inside the existing `isolate` track.

#### Analytics sections (step 9, optional)
Only if shipped: `PumpSection` as a copy of `BottleSection` (bars for ml per day, `fill-chart-2` which is
the `rose` hue, plus session count in the readout) and `RefluxSection` as a copy of `DiaperSection` but
**single series** (episodes per day, `fill-chart-5`), with the light / moderate / heavy split given as numbers
in the inspect readout and data table rather than as stacked colours (three shades of one neutral hue would be
indistinguishable without relying on colour). Unlogged days read "Not logged", never 0 (existing pattern).
Section headings extend `SectionHeading kind` with `pumping` / `reflux` and their tones.

### States
- Loading: `tracker/loading.tsx` per above (extra compact tile row, six summary blocks). While a quick log is
  pending the tapped panel button shows `Loader2` (key `pump`, `pump-none`, `reflux-*`) and every other
  control is `aria-disabled`. The two new tiles themselves never spin (they only open a panel).
- Empty: no pumping logged → the Pumping tile hint reads "Log". No reflux logged → Reflux tile "Log". Summary
  tiles read `0`. Empty day log reuses `log.emptyToday` and the reworded `log.emptyTodayHint`; nothing else
  is added. Pumping analytics (step 9): "no data in this period" muted text, as the other sections.
- Error: a failed save shows `toast.error(t('errors.save'))`, or `errors.network` for a `TypeError`, or
  `errors.codes.<code>` for a validation error (existing `run`). Nothing is added on screen, the panel stays
  open so the parent can retry with the same amount and side, and `router.refresh()` resyncs. `invalidSeverity`
  appears as a toast only (the UI offers three fixed buttons, it is a backstop and an MCP message). In the
  modal, amount errors are the existing inline `role="alert"`; side and severity cannot be invalid.
  Stale edit (other parent deleted it) follows the existing `conflict` / `notFound` path.
- Success: no toast for the quick log. Feedback is the panel closing, the Pumping tile hint resetting to "just
  now", the summary tile changing and the sr-only `role="status"` message (`announce.pumpLogged`,
  `announce.refluxLogged`). Modal save closes the modal as today.
- Offline / slow: `useOnline()` false → the existing offline banner appears and both new tiles are
  `aria-disabled` like the others (a tap does nothing, no queued writes; `offline-tracker.md` may change that
  later and then applies to these kinds too). If the panel is already open when the connection drops, its
  buttons become `aria-disabled` through the same `busy` flag. On a slow network the spinner stays on the
  tapped button, taps are ignored meanwhile. Realtime from the other parent refreshes tile hint and summary
  silently (no live announcement).

### Copy
| Key | English | French |
|-----|---------|--------|
| tracker.kinds.pumping | Pumping | Tire-lait |
| tracker.kinds.reflux | Reflux | Reflux |
| tracker.subtitle | Sleep, feeds, diapers, pumping and reflux, logged by the whole family. | Sommeil, tétées, couches, tire-lait et reflux, notés par toute la famille. |
| pages.tracker.description | Sleep, feeds, diapers, pumping and reflux, logged by the whole family. | Sommeil, tétées, couches, tire-lait et reflux, notés par toute la famille. |
| tracker.log.emptyTodayHint | Log a sleep, feed, diaper change, pumping or reflux to get started. | Enregistrez un sommeil, une tétée, un change, un tire-lait ou un reflux pour commencer. |
| tracker.quick.pumpTitle | Pumping session | Séance de tire-lait |
| tracker.quick.logPump | Log pumping | Noter le tire-lait |
| tracker.quick.logPumpNoAmount | Log without amount | Noter sans quantité |
| tracker.quick.refluxTitle | How much came up? | Quelle quantité est remontée ? |
| tracker.reflux.severities.light | Light | Léger |
| tracker.reflux.severities.moderate | Moderate | Moyen |
| tracker.reflux.severities.heavy | Heavy | Abondant |
| tracker.reflux.noDetail | Log without detail | Noter sans précision |
| tracker.reflux.logLight | Log light reflux now | Enregistrer un reflux léger maintenant |
| tracker.reflux.logModerate | Log moderate reflux now | Enregistrer un reflux moyen maintenant |
| tracker.reflux.logHeavy | Log heavy reflux now | Enregistrer un reflux abondant maintenant |
| tracker.reflux.clearSeverity | Clear severity | Effacer l'intensité |
| tracker.form.pumpSide | Side (optional) | Côté (facultatif) |
| tracker.form.clearSide | Clear side | Effacer le côté |
| tracker.form.refluxSeverity | Severity (optional) | Intensité (facultatif) |
| tracker.lastPumping.title | Last pumped | Dernier tire-lait |
| tracker.announce.pumpLogged | Pumping logged. | Tire-lait enregistré. |
| tracker.announce.refluxLogged | Reflux logged. | Reflux enregistré. |
| tracker.summary.pumping | Pumping | Tire-lait |
| tracker.summary.pumpingValue | {count} · {amount} ml | {count} · {amount} ml |
| tracker.summary.reflux | Reflux | Reflux |
| tracker.errors.codes.invalidSeverity | Choose light, moderate or heavy. | Choisissez léger, moyen ou abondant. |

Notes for the builder:
- `lastPumping.ago` and `lastPumping.none` from the plan's list are **not needed**: the tile hint shows only
  the `Elapsed` value (which already says "ago" / "il y a") and falls back to the existing `quick.log`.
- Reused as is: `quick.log` (tile hint), `quick.cancel` (close button), `quick.decrease` / `quick.increase`,
  `quick.amountLabel`, `sides.*`, `summary.amount`, `form.time`, `form.amount`, `form.amountPlaceholder`,
  `form.errors.amount`, `errors.save`, `errors.network`.
- `summary.pumpingValue` for a count without amounts is just the number (`String(count)`, no message); only the
  count + ml case uses the message.
- The analytics keys (step 9) are written by the builder in the same tone.
- Contains "tétée" in the subtitle on purpose; FR strings above are 20–30% longer than EN and were checked
  against the 375 px layouts described here.

### Accessibility
- Tiles are real `<button>`s with visible text. They carry `aria-expanded` and `aria-controls` (ids
  `pump-panel`, `reflux-panel`) and `aria-disabled` (not `disabled`) when busy or offline, so keyboard focus is
  never lost. The Pumping tile's hint includes an `sr-only` "Last pumped" before the elapsed value, so the
  accessible name reads "Pumping, Last pumped 3 h ago".
- Panels are `role="group"` with `aria-labelledby` pointing at their title (`pump-panel-title`,
  `reflux-panel-title`). Side and severity are real radio groups (`ChoiceGroup`, Base UI `RadioGroup`: arrow
  keys, `aria-label` from the field label, a `Check` icon on the selected option so it is not tint-only).
  Because radios cannot be unselected, optional fields have an explicit ghost "Clear …" button (`h-11`), never
  a hidden tap-again gesture. There are no toggle buttons in these flows, so `aria-pressed` is not needed;
  state is `aria-expanded` (tiles) and `aria-checked` (radios).
- Severity buttons in the reflux panel are plain buttons whose visible word ("Light") is contained in their
  `aria-label` ("Log light reflux now", label-in-name rule), because "Light" alone is ambiguous out of
  context. The stepper buttons keep their `aria-label`s ("Remove 10 ml" / "Add 10 ml") and the amount input
  its sr-only label.
- Success is announced through the existing sr-only `role="status"` paragraph (`announce.pumpLogged`,
  `announce.refluxLogged`). Realtime updates are not announced.
- Targets: second-row tiles `min-h-16` (64 px), reflux buttons and Log button `h-14`, stepper `size-12`,
  ghost buttons `h-11`, close `size-11`, modal choices `h-12`. All at least 44 px.
- Focus order: tiles row 1, tiles row 2, (open panel: close, controls, Log, Log without), Diaper card, last
  feed card. Focus lands in the panel on open and returns to its tile on close or `Escape`.
- Contrast: tile text uses `text-landing-foreground` on `bg-landing-surface`; `rose` and `chart-5` appear only
  as icon colour on a 15% tint (the same recipe as the existing tones) and as decorative marks next to text.
  Check `text-chart-5` on `bg-chart-5/15` in both themes (light 0.5 L, dark 0.72 L defined in `globals.css`).
- Motion: no new animation. The existing spinner is the only motion; any panel appearance must be
  `motion-safe:` only.
- Colour is never the only cue: kind name and icon sit with every tone, severity is the word, timeline marks
  differ by shape, the day summary and log are text.
- Z-index: no new value; everything is in normal flow except the existing edit modal at `z-[60]`
  (`docs/z-index.md`).

### Questions
1. **D5, zero display (I disagree with the recommendation)**: the plan shows "—" for pumping and "0" for
   reflux when nothing is logged. The same screen already shows "0 wet · 0 dirty" for diapers (a real zero),
   so mixing a dash and a zero reads as an inconsistency. Design uses "0" for both. If you would rather show a
   dash for pumping, say so; it is a one-line change.
2. **D5, tiles for families who never use these**: every family now sees two extra tiles every day, even ones
   who never pump or never log reflux. I kept D5 (always shown, stable grid). A calmer alternative would be to
   hide a tile until that kind has ever been logged for this baby, but that needs a small extra "has any entry
   of this kind" read and makes the grid change once. It affects data reads, so it is for the planner to decide.
3. **D7, placement (small deviation)**: designed as the Pumping tile's hint ("3 h ago") instead of a line
   inside the panel, so it stays visible after logging (the panel closes) and keeps the panel short on a
   small phone. If you prefer it inside the panel as written, it is one extra line under the title.
4. **D4, reflux is two taps (tile, then severity)**, which I kept as planned. A single-tap alternative would
   be to put the three severity buttons permanently on a Reflux card like the Diaper card, which costs about
   100 px of permanent height for a less frequent event. Not chosen; say if you want it.
5. **Tones**: pumping shares `rose` with breastfeed (no free hue is left; `chart-5` is the neutral one and
   goes to reflux). Acceptable? The alternative is `chart-5` for pumping and a muted neutral for reflux, which
   makes reflux look less distinct.
6. **Wording**: "Moyen" for moderate and "Abondant" for heavy, and the reflux question "Quelle quantité est
   remontée ?", are my French choices; confirm they sound natural to you.
7. **Pumping prefill**: the amount stepper starts from the last pumped amount, else 90 ml (the bottle default).
   A pump session usually yields a different range than a bottle. Is 90 ml a good starting point, or should it
   be a separate `pumpDefault` constant (for example 100)?

## Risks and open questions
- **Shared database with an older image**: an image without these kinds crashes on a `pumping`/`reflux` row
  (unknown key in `CARE_KIND_CONFIG`), as noted for diapers. If `:latest` and `:prod` share one database,
  promote `:prod` before logging real entries on dev. Consider making `CARE_KIND_CONFIG` lookups tolerate an
  unknown kind (skip the row) as a cheap hardening in step 2.
- **`breast_side` meaning drift**: the column now means "breast fed from" for breastfeed and "breast pumped"
  for pumping. Acceptable because analytics side stats only read breastfeed rows; worth a comment in the
  migration.
- **Enum values are irreversible** in Postgres (no `DROP VALUE`); everything else is additive.
- Open decisions D1–D7 above.

## How to verify
1. Log a pumping session from the quick action with 120 ml and side "Gauche": day log reads
   "Tire-lait · Gauche · 120 ml", summary tile "1 · 120 ml", last-pumping readout resets.
2. Log one without amount or side: allowed; tile reads "2 · 120 ml".
3. After pumping, the **last feed card, next-side suggestion and feeds tile are unchanged**; bottle ml
   total is unchanged.
4. Log reflux with each severity and with none; edit one to change severity; delete one. Reflux tile counts.
5. Edit a pumping entry and clear its side: saves with null side.
6. The other parent's phone updates via realtime with no action.
7. Analytics: a day with only pumping/reflux is not shown as a zero sleep/feed day; averages unchanged.
8. MCP: `add_tracker_entry` with `kind: 'pumping'` and `kind: 'reflux'`; `get_tracker_status` returns
   `lastPumping` and totals; a bad `refluxSeverity` returns `invalidSeverity`.
9. DB: inserting a reflux with `amount_ml`, a pumping with `ongoing = true`, or a bottle with
   `reflux_severity` is rejected by the CHECKs.
10. **User without access**: a member without tracker page access (or a non-member) gets `unauthorized` from
    `createCareEvent` and from MCP `add_tracker_entry` for that `babyId`, and the page is blocked.
11. Design checks at 375px in French and in dark mode: the two compact tiles do not clip "Tire-lait" or a
    wrapped "il y a 1 h 20 min"; the pump panel (stepper, side row, two buttons) is reachable without losing
    the Diaper card for good; the Abondant option does not wrap in the modal; the six summary tiles show
    "4 mouillées · 2 sales" and "3 · 240 ml" without wrapping; opening each panel with the keyboard moves
    focus into it and `Escape` returns it to the tile.
