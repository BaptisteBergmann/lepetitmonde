# Tracker analytics (Suivi: graphs and history)

Status: approved
Approved by: user, 2026-11-08 (open questions delegated to Claude; answers below)

## Status: implemented
Shipped 2026-11-08 as `tracker/analytics`. It has sleep, feed and bottle charts drawn as SVG with tap-to-inspect, KPI tiles with trends, and a 24 h history covering 31 days. There is no migration. It passed two builder/reviewer rounds.
Deviations from the plan:
- Night sleep is the part of the same calendar day outside 07:00–19:00, so day plus night always equals the Suivi total.
- The `all` range is capped at 1100 days.
- A day counts as "logged" only if an entry started that day.
- Weekly readouts use non-plural "per day" keys.
- The weekly median pools that week's gaps.
Follow-ups: monthly buckets once `all` gets long, a per-metric "logged" flag, and the MCP `get_tracker_stats` tool.

## Decisions (resolve all open questions below; these override the plan text where they differ)
- **Sub-route** `tracker/analytics`, linked from the Suivi header (not a `?view=` tab).
- **Day/night window:** fixed 07:00–19:00; no per-baby setting, no migration.
- **Feed gaps over 8 h** are excluded from interval stats (median/longest gap).
- **Default range** `7d`; kept in the URL only, not remembered (no cookie).
- **Timezone:** the viewer's device zone, same as the Suivi day page.
- **Charts:** hand-drawn SVG with tap-to-inspect (designer's two client renderers); no Recharts.
- **Bucketing:** daily up to 31 days, weekly above (`90d` and `all` show weekly bars). Update step 3 accordingly.
- **History:** capped at the last 31 days, with no "older days" link and no `history` param.
- **Trends:** neutral styling, with no green or red.
- **Not-logged days:** baseline dot plus "Rien noté", as designed.
- **Access:** same as Suivi; no stats-only page for viewers.
- **MCP** `get_tracker_stats`: deferred to a follow-up, out of scope here.

## Goal
Give the people who use the Suivi page (`/baby/[babyId]/tracker`) a view of trends over days and
weeks, not just one day at a time. For example: how much the baby sleeps, how many naps, the longest
stretch, the day/night split, how often feeds happen, sides and bottle volumes, and a day-by-day 24 h
timeline. Users: every member allowed to open the tracker page (admins by default, see
`page_registry.ts`).

## Out of scope
- Diapers, medication and other new kinds. Only `sleep`, `breastfeed` and `bottle` exist
  (`care_event_kind`). The builders below are written per kind, so a later kind adds one section.
- New DB objects (views, RPCs, materialized tables), unless the open question on volume says otherwise.
- Exporting data (CSV/PDF), sharing analytics through share links, push/email digests.
- MCP tool for stats (`get_tracker_stats`). See open questions.
- Comparing against norms or percentiles (no medical guidance, unlike WHO curves on Health).
- Changing the day page, the now panel, or how entries are created.

## Current state
- **Table** `care_events` (`supabase/migrations/20261023100000_create_care_events.sql`). One
  polymorphic row per entry:
  - `kind`, `started_at` (timestamptz), nullable `ended_at`, `ongoing`.
  - `breast_side` (`left`/`right`/`both`, breastfeed only) and `amount_ml` (bottle only, nullable).
  - Constraints: `ended_at >= started_at`, max duration 24 h, and a bottle can't be `ongoing`.
  - Index `care_events_baby_started_idx (baby_id, started_at DESC)`, which already fits a range scan.
- **RLS/grants**: RLS on, `anon` revoked, SELECT for `authenticated` through `is_baby_member(baby_id)`
  (`20261023120000_harden_care_events_grants.sql`).
- **Page** `src/app/baby/[babyId]/tracker/page.tsx`:
  1. `assertPageAccess(babyId, 'tracker')`.
  2. Timezone from `getRequestTimeZone()` (`src/utils/care-timezone.ts`): the `tz` cookie set by
     `components/tz_cookie.tsx`, validated, falling back to `FAMILY_TIME_ZONE`.
  3. `?day=yyyy-MM-dd` parsed by `parseDayParam` (clamped to today).
  4. Fetches `getTrackerDay` and `getTrackerNow`, then computes the 3-tile summary with `computeDayTotals`.
- **Day navigation** `_components/day_nav.tsx`: server links `?day=` ±1 day, plus "back to today".
- **Fetching** `src/utils/care-core.ts` `getTrackerDayCore`:
  - Calls `assertTrackerAccessForUser`, then selects `*` from `started_at >= dayStart - 24h` to
    `< dayEnd`.
  - Filters out rows that don't overlap the day. It can look back only 24 h because entries last
    at most 24 h.
  - `actions/care_events.ts` holds thin session wrappers (`getAuthUser()` → core). The MCP server
    (`src/app/api/mcp/tools/tracker.ts`) uses the same cores.
- **Time helpers**: `src/utils/care-time.ts` is pure and client-safe.
  - `zonedDayBounds` is DST-safe and returns half-open 23/25 h days. Also `shiftDay`, `todayInZone`.
  - `overlapMs` clamps an event to a window; a running event counts up to `now`.
  - `computeDayTotals`: feeds and bottles count on the day they started; sleep is clamped per day.
    The analytics must reuse these rules so its numbers match the day page.
- **Kinds UI**:
  - `src/utils/care-events.ts` has `CARE_KIND_CONFIG` (icon, tone `chart-4`/`rose`/`sage`) and `FEED_KINDS`.
  - `_components/kind_ui.ts` has `describeEvent` and `kindIcon`.
- **Live**: `_components/tracker_live.tsx` debounces `router.refresh()` on `care_events` signals
  from the SSE relay.
- **Charts**: no chart library is installed (no recharts, d3 or visx in `package.json`; there is
  no Shadcn `chart.tsx` in `src/components/ui/`).
  - Health has a hand-drawn SVG chart: a pure builder in `src/utils/growth-chart.ts` that returns
    scales, ticks and points, and a client renderer in `health/_components/growth_chart.tsx`
    (`<title>`/`<desc>`, points as focusable buttons, a readout card instead of a hover tooltip).
  - Health plan decision 6 was "hand-drawn SVG chart, no new dependency".
- **Sub-route precedent**: `guess/leaderboard` is a sub-page reached through an outline `Link`
  button and gated by the same `assertPageAccess(babyId, 'guess')`.
  - `bottom_nav.tsx` marks a tab active on `pathname.startsWith(href + '/')`, so a
    `tracker/analytics` page keeps "Suivi" highlighted.
  - Health instead uses `?view=` links (`health/_components/view_switch.tsx`), where both
    datasets are already in the payload.
- **i18n**: next-intl, `messages/en.json` and `messages/fr.json`, namespace `tracker`.
- **PostgREST row cap**: `supabase/config.toml` sets `max_rows = 1000`. Any range query must page
  with `.range()`, or it silently truncates.
- **No test runner** in `package.json`. Verification is typecheck, lint, and manual checks.
- Drift vs CLAUDE.md, as known: actions live in `src/utils/actions/`, and there is no
  `@/utils/supabase/client`.

## Approach
Add a **sub-route** `src/app/baby/[babyId]/tracker/analytics/page.tsx`, linked from the Suivi page
header (like the Pronostics → leaderboard link). Add a back link to Suivi.
- Range selector: `?range=7d|30d|90d|all`, default `7d`, as server `Link`s with `aria-current`
  (same pattern as `ViewSwitch`).
- Data: a new core `getTrackerRangeCore` fetches a narrow column set for `[rangeStart - 24h, rangeEnd)`
  with paging. A new **pure, client-safe** module `src/utils/care-analytics.ts` aggregates it.
  - It reuses `zonedDayBounds`/`overlapMs`, so per-day buckets are in the viewer's zone and sleep
    across midnight is split exactly like on the day page.
  - It returns plain JSON (numbers, `yyyy-MM-dd` strings, no `Date`).
- Charts: a pure builder `src/utils/care-analytics-chart.ts`, modeled on `growth-chart.ts`, plus
  small SVG renderers. No new dependency.

Why a sub-route rather than a tab on the Suivi page:
- Suivi is the one-handed, at-night logging screen. It should stay light and fast.
- Analytics loads up to months of rows and has its own range state.
- A separate route gets its own `loading.tsx`, keeps the `?day=` and `?range=` params from
  clashing, and is linkable.

Alternatives considered:
- Tab via `?view=analytics`: listed as an open question.
- Postgres RPC/view aggregating with `AT TIME ZONE`: not chosen. Volume is tiny (about 15 rows/day,
  about 5.5k/year). The JS path reuses the tested DST and midnight logic, and needs no new DB object
  to secure. Revisit if "all" gets slow.
- Recharts / Shadcn charts: not chosen, to follow health decision 6 (no dependency, full control
  of a11y and theme tokens). Open question if the designer wants richer interactions.

## Data and migrations
- **None.** Reads the existing `care_events` through RLS (`is_baby_member`) with the user's session
  client. No new table, view, function or grant, so no revoke is needed.
- `database.types.ts` does not need regenerating. Use `Tables<'care_events'>`, `Pick`-ed to the
  selected columns.
- If a later revision adds an RPC or view, it must be `SECURITY INVOKER` (views:
  `security_invoker = true`). It must also run `REVOKE ALL ... FROM anon, public` and grant
  `EXECUTE`/`SELECT` to `authenticated` only, rely on `is_baby_member`, and be followed by
  regenerated types (`mise exec -- supabase gen types ...`). It needs migration-only review first.
  The RLS rollout in `rls.md` is owned elsewhere: do not touch it.

## Access and security
- **Page** `tracker/analytics/page.tsx`: `await assertPageAccess(babyId, 'tracker')` first, the
  same gate as Suivi. This covers a disabled page, a viewer when the role is admin, and a non-member.
- **Core** `getTrackerRangeCore(supabase, userId, babyId, from, to, tz)` in `src/utils/care-core.ts`:
  - Calls `assertTrackerAccessForUser` (UUID check plus page access) before any query.
  - Validates `from`/`to` with `isValidDay`, requires `from <= to`, and caps the span at
    `CARE_ANALYTICS_MAX_DAYS` (for example 400) so a crafted call can't scan unbounded history.
  - Always filters `.eq('baby_id', babyId)`, with RLS as the second layer.
- **Action** `getTrackerRange(babyId, from, to)` in `src/utils/actions/care_events.ts`:
  - Gets the user with `getAuthUser()` (which uses `getUser()`) and the zone with `getRequestTimeZone()`.
  - Is a thin wrapper like `getTrackerDay`. It is a callable Server Action endpoint, which is fine
    because the core checks access.
- **First entry date** (for `all`): `getTrackerFirstDayCore` runs the same access check, then
  `select started_at order asc limit 1`.
- **Timezone**: the `tz` cookie is client-controlled. It is used only for bucketing and formatting,
  never for authorization (already the rule in `care-time.ts`).
- **Data exposure**: the analytics select omits `note`, `created_by` and `updated_by`. Stats never
  show who logged what, so member names are not sent.
- No service-role use, no new public endpoint (beyond the Server Action), no auth change, no
  notification.

## Metrics (what `care-analytics.ts` computes)
All per-day values are for local days `D` in the viewer's zone, from `zonedDayBounds(D, tz)`.
The default windows `NIGHT_START = 19:00` and `NIGHT_END = 07:00` are constants (open question).
`now` is passed in, and running timers count up to `now` (same as `computeDayTotals`).

**Sleep**
- `sleepMs[D]`: sum of `overlapMs(sleep, dayBounds(D))`. It matches the Suivi summary tile exactly,
  including midnight splitting and DST days.
- `napCount[D]`: sleeps that **start** inside the day window `[D 07:00, D 19:00)`.
- `nightSleepMs[D]`: overlap with `[D 19:00, D+1 07:00)`, which is "the night that starts on D".
  The latest night is partial until 07:00.
- `daySleepMs[D]`: overlap with `[D 07:00, D 19:00)`. Build the windows with `parseZonedDateTime`
  so they are DST-safe.
- `longestStretchMs[D]`: the full duration (not clamped) of the longest sleep that **started** on D.
  A 21:00–05:00 sleep counts as one 8 h stretch on D. Running sleeps count up to `now`.
- Point-in-time sleeps (no `ended_at`, not ongoing) count for 0 duration, as today.

**Feeds** (breastfeed + bottle, by start day like `computeDayTotals`)
- `feedCount[D]`, and per kind `breastfeedCount[D]` and `bottleCount[D]`.
- Intervals are start-to-start gaps between consecutive feeds across the whole range, attributed
  to the day the later feed started.
  - Per day: `medianIntervalMs[D]` and `longestIntervalMs[D]`.
  - Gaps over `MAX_FEED_GAP_MS` (default 8 h) are dropped as "probably not logged" (open question).
- Breast sides: counts `left`/`right`/`both` per range. `avgBreastfeedMs` covers timed feeds only.
- Bottles: `bottleMl[D]` (sum), `bottleCountWithAmount[D]` and average ml per bottle. Bottles
  without an amount count in `bottleCount` but not in volume. Show "x of y bottles have an amount"
  so the volume isn't misread.

**Range summaries**
- For each headline metric, an average over **complete** days with data, plus the latest value.
  - Today is shown in charts but marked partial and excluded from averages.
  - Days with no entries at all count as "not logged", not as zero, and are excluded from averages.
    Otherwise a forgotten day drags the averages down.
- Trend vs the previous period of equal length (`7d` vs the 7 days before, and so on) for the
  averages: absolute delta plus direction. It is shown only when the previous period has at least
  3 logged days. No trend for `all`.

**History**
- A 24 h timeline per day: segments `{ kind, startMin, endMin, ongoing }` clamped to the local day,
  plus feed ticks (point marks at the start, with the feed's length when timed) and a bottle marker.
  - Newest day first.
  - Each row links to `/baby/[babyId]/tracker?day=D` (day-page drill-down).
  - Limited to the most recent 31 days, with an "older days" link that sets the range. `90d` and
    `all` still chart every day, but the timeline stays readable.
- Bucketing for long ranges: daily points up to 90 days, then ISO-week buckets (Monday start, local
  days, values are per-day averages within the week). This lives in the chart builder, not the
  aggregator.

**Output type**: `TrackerAnalytics`
- `{ range, from, to, today, days: DayStats[], summary, previousSummary | null, timeline: TimelineDay[] }`.
- JSON-serializable, so the same object can go to client renderers as props.

## Server/client split
- `analytics/page.tsx` (Server Component):
  1. Access check.
  2. Parse `range` (unknown value → `7d`).
  3. Compute `from`/`to`, plus the previous period's `from` for the trend.
  4. Make a single `getTrackerRange` call over `[prevFrom, to]`.
  5. Call `computeTrackerAnalytics(rows, { from, to, prevFrom, tz, now })`, then `buildAnalyticsCharts(...)`.
  6. Render.
- Chart renderers: SVG components that take a prebuilt chart object (plain numbers and strings).
  - Default to Server Components: static SVG, no JS shipped.
  - If the design needs tap-to-inspect (a selected bar shows its value in a readout, like
    `GrowthChart`), the renderer becomes a `'use client'` component receiving the same serialized
    builder output. Formatting labels (durations via `formatDuration`, dates via
    `getDateFnsLocale`) are computed server-side and passed as strings, so the client needs no
    translator.
- `TrackerLive` is reused on the analytics page, so a new entry refreshes the stats. Each refresh
  recomputes the aggregates; that is cheap at this volume.
- `analytics/loading.tsx` is a skeleton mirroring the final layout, and `analytics/error.tsx` copies
  `tracker/error.tsx`.

## Empty states, mobile, accessibility (behavior; visuals are for the designer)
- **Empty states**:
  - No entries at all: one empty state with a link back to Suivi to log the first entry.
  - Range with no entries: "Nothing logged in this period", with a suggestion to widen the range.
  - Per-kind sections with no data (for example, no bottles ever) are hidden, not shown as
    empty charts.
  - Fewer than 2 feeds: no interval stats.
- **Mobile first**: single column, charts full width with `viewBox` scaling (`h-auto w-full
  touch-pan-y` like the growth chart). Range selector reachable with the thumb, no horizontal
  scrolling. The timeline rows must stay legible at 360 px.
- **Accessibility**:
  - Every chart has `<title>`/`<desc>` and a one-sentence text summary ("Average 13 h 20 min of
    sleep per day, up 40 min from the previous 7 days").
  - Each chart has an equivalent data table, either visually hidden or behind a "Show as table"
    toggle (designer's choice). The table is the accessible source, and the SVG is `aria-hidden`
    unless it has interactive points.
  - Color is never the only cue: sleep, breastfeed and bottle also differ by shape or pattern and
    by labels.
  - The range selector is links with `aria-current="page"`. Trend arrows have text equivalents.
- **Z-index**: nothing floats in the base plan. If the designer adds a popover or tooltip, use the
  `docs/z-index.md` scale (`z-[70]` for anchored floating content).

## Steps
Each step leaves the app working. Commit each one, followed by the CHANGELOG commit.

1. **Core range fetch** — files: `src/utils/care-core.ts`, `src/utils/actions/care_events.ts`,
   `src/utils/care-events.ts` (`CARE_ANALYTICS_MAX_DAYS`).
   - Add `getTrackerRangeCore`:
     1. Access check and validation first.
     2. `select('kind, started_at, ended_at, ongoing, breast_side, amount_ml')` over
        `[zonedDayBounds(from).start - 24h, zonedDayBounds(to).end)`, ordered by `started_at` ascending.
     3. Page with `.range(i, i+999)` until a short page.
     4. Pino child logger with `{ function, babyId, from, to }`.
   - Add `getTrackerFirstDayCore` and the thin `getTrackerRange` / `getTrackerFirstDay` actions.
   - Export a `CareAnalyticsRow` type (`Pick<Tables<'care_events'>, ...>`).
   - Commit: `feat(tracker): add range fetch for analytics`.
2. **Pure aggregator** — files: `src/utils/care-analytics.ts` (new, client-safe, no server imports).
   - `computeTrackerAnalytics` implementing the Metrics section.
   - `parseRangeParam` / `rangeBounds(range, today, firstDay)`.
   - Constants `NIGHT_START`, `NIGHT_END`, `MAX_FEED_GAP_MS`.
   - Reuse `zonedDayBounds`, `overlapMs`, `shiftDay`, `parseZonedDateTime`, `FEED_KINDS`.
   - Add a doc comment with the counting rules: start-day for feeds, overlap for sleep, and the
     night window.
   - Verify the DST, midnight and running-timer cases with a throwaway script in the scratchpad.
     No test runner exists.
   - Commit: `feat(tracker): compute sleep and feed analytics`.
3. **Chart builders** — files: `src/utils/care-analytics-chart.ts` (new, pure; modeled on
   `src/utils/growth-chart.ts`).
   - Builders for bar/stacked-bar series (sleep day/night per day, feeds per day, bottle ml per day),
     a line or dot series for longest stretch and median interval, and timeline rows (minutes →
     x positions).
   - Weekly bucketing over 90 points. "Nice" y-ticks, with duration ticks in whole hours.
   - Commit: `feat(tracker): add analytics chart builders`.
4. **Analytics route (data, no polish)** — files: `src/app/baby/[babyId]/tracker/analytics/page.tsx`,
   `loading.tsx`, `error.tsx`, `_components/range_switch.tsx`, `_components/stat_cards.tsx`, plus
   messages.
   - Access check, range parsing, summary cards with averages and trends, `TrackerLive`, back link.
   - Add the "Analytics" link on `tracker/page.tsx`.
   - Messages in en and fr.
   - Commit: `feat(tracker): add analytics page with range selector`.
5. **Charts** — files: `tracker/analytics/_components/{bar_chart,line_chart}.tsx` (server, or client
   if the design adds selection), and the per-kind sections `sleep_section.tsx`, `feed_section.tsx`.
   - Include the a11y summaries and data tables.
   - Hide sections that have no data.
   - Commit: `feat(tracker): add sleep and feed charts`.
6. **History timeline** — files: `tracker/analytics/_components/day_timeline.tsx`.
   - 24 h rows (newest first), with a link to `?day=` per row.
   - 31-day cap with an "older days" link.
   - Commit: `feat(tracker): add 24h history timeline`.
7. **Docs** — files: `docs/features/Tracker analytics.md` (new), `docs/features/Baby tracker.md`
   (link plus route), `docs/Le petit monde.md` (hub: add `[[Tracker analytics]]` under Features next
   to Baby tracker).
   - The new note follows the feature-note format (frontmatter `tags: [lepetitmonde/feature]`,
     `Up: [[Le petit monde]]`, route, code paths).
   - It documents the counting rules (start-day, overlap, night window, feed gap cutoff, "not
     logged" days, viewer's timezone), and links `[[Baby tracker]]`, `[[Internationalization]]` and
     `[[Row Level Security]]`.
   - Commit: `docs(tracker): document analytics`.
8. **Ship**: reviewer pass. Then push to `main`, wait for CI, `mise run portainer_redeploy`. No
   migration to apply. When verified, mark the plan implemented and move it to `.claude/plans/done/`.

## Translations
New keys under `tracker.analytics.*` in both `messages/en.json` and `messages/fr.json` (FR
first-class, since the page is "Suivi"). Indicative list:
- Page and nav:
  - `link` ("Statistiques" / "Analytics"), `title`, `subtitle`, `back` ("Retour au suivi").
  - `range.label`, `range.7d`, `range.30d`, `range.90d`, `range.all`.
- Sections: `sections.sleep`, `sections.feeds`, `sections.bottles`, `sections.history`.
- Metrics:
  - `metrics.sleepPerDay`, `metrics.naps`, `metrics.longestStretch`, `metrics.daySleep`,
    `metrics.nightSleep`.
  - `metrics.feedsPerDay`, `metrics.feedInterval`, `metrics.longestGap`.
  - `metrics.sides`, `metrics.avgFeedDuration`, `metrics.bottleVolume`, `metrics.avgBottle`.
  - `metrics.amountCoverage` ("{withAmount} sur {total} biberons ont une quantité").
- Trends and averages: `average`, `trend.up`, `trend.down`, `trend.same`, `trend.vsPrevious`,
  `partialToday`, `notLogged`.
- Empty states: `empty.none`, `empty.noneHint`, `empty.range`, `empty.rangeHint`.
- Charts and timeline:
  - `chart.showTable`, `chart.hideTable`, `chart.summary.*` (ICU plural sentences for screen readers).
  - `timeline.label`, `timeline.openDay`, `timeline.olderDays`.
- Reuse `tracker.duration.*`, `tracker.kinds.*`, `tracker.sides.*` and `tracker.summary.amount`.

## Design

Verdict on tap-to-inspect (answers open question 6): **yes, worth it, with hand-drawn SVG. No
Recharts.** A parent's natural question is "how much did she sleep on Tuesday?", which a static bar
can't answer. But hover tooltips are useless on phones, so the pattern is the one already proven on
Health: tap a column and a readout card below the chart shows that day's exact values. That needs
a thin client layer and no library:
- Recharts would add roughly 100 kB of client JS for a screen opened occasionally, fights the
  `--chart-*` / dark tokens (inline colors), and its keyboard/screen-reader support is weaker than
  what the plan wants. Health decision 6 still holds.
- Client components (only these): `analytics/_components/inspect_bar_chart.tsx` (single and stacked
  bars: sleep, naps, feeds, bottle ml) and `analytics/_components/inspect_dot_chart.tsx` (line with
  dots: longest stretch, median interval). They share a small hook/readout in
  `analytics/_components/chart_readout.tsx`. Props are the serialized builder output plus
  pre-formatted strings (column labels, readout lines, table rows), so no translator on the client.
- Everything else stays a Server Component: header, `range_switch.tsx`, `stat_cards.tsx`, the
  100 % day/night bar, the sides bar, the coverage caption, `day_timeline.tsx` (rows are plain
  `Link`s) and the empty states.
- Nothing floats (the readout is an inline card, not a tooltip), so no new z-index. Do not add any
  `z-` class. If a later change adds a real tooltip, use `z-[70]` per `docs/z-index.md`.

Builder-affecting change to the plan's History bucketing (please confirm, see Questions):
**daily columns up to 31 days, ISO-week buckets above that.** So `7d` and `30d` are daily, `90d` and
`all` (once past 31 days) are weekly. 90 daily columns on a 343 px chart are about 3 px wide,
unreadable and untappable.

### User flow
1. On Suivi, user taps the "Statistiques" button in the page header → lands on
   `/baby/[id]/tracker/analytics` with the 7-day range, the bottom nav still highlights "Suivi".
2. Sees the range selector, then the 4 KPI tiles with their trend vs the previous period → knows
   the headline numbers without scrolling.
3. Scrolls: Sleep section, Feeds section, Bottles section (only if bottles exist), History.
4. Taps a column in any bar/dot chart (or uses the ‹ › buttons, or arrow keys) → the readout card
   under that chart shows that day's values. Default selection is the latest complete day, so the
   card is never empty.
5. Taps "Afficher en tableau" under a chart → the same data as a table, inline.
6. Taps another range (30 j / 90 j / Tout) → URL updates (`?range=`), page re-renders (route
   `loading.tsx` skeleton if slow), `aria-current` moves, scroll position stays (`scroll={false}`).
7. In History, taps a day row → opens `/baby/[id]/tracker?day=yyyy-MM-dd` (the Suivi day page, back
   button returns to the analytics page at the same range).
8. Taps "Retour au suivi" (top of page) → Suivi today.

### Screens

#### Entry point on Suivi (`tracker/page.tsx` header)
Wireframe (mobile, 375px):
```
┌───────────────────────────────────┐
│ Suivi                [▥ Statistiques] │
│───────────────────────────────────│
```
- Layout: inside the existing `Reveal` header, wrap the `h1` in
  `flex items-center justify-between gap-3`. The button sits on the right on all widths; the `h1`
  keeps `min-w-0`. Subtitle stays as is (hidden on mobile). FR "Statistiques" is 12 characters:
  fits next to "Suivi" at 320 px (button about 140 px).
- Components: same recipe as the Pronostics link in `guess/page.tsx`: a styled `Link` using
  `buttonVariants({ variant: 'outline', className: 'gap-2 rounded-2xl' })`, height at least 44 px
  (`h-11`), no `<Link><Button>` nesting. Icon `BarChart3` from lucide (`aria-hidden`), then the text.
  A visible text label, never icon-only.
- Typography and color: default outline button tokens, label `text-sm font-medium`.
- Interactions: plain navigation, no prefetch tricks.

#### Analytics page shell (`tracker/analytics/page.tsx`)
Wireframe (mobile):
```
┌───────────────────────────────────┐
│ ‹ Retour au suivi                 │  <- text link, 44px target
│ Statistiques                      │  <- h1 font-display
│───────────────────────────────────│
│ ┌────┬────┬────┬────┐             │
│ │✓7 j│30 j│90 j│Tout│             │  <- range links, h-12
│ └────┴────┴────┴────┘             │
│ Du 2 au 8 nov. · moyennes sur     │
│ 6 jours notés sur 7               │  <- text-xs muted
│ ┌──────────┐ ┌──────────┐         │
│ │ 🌙 Sommeil│ │ Plus longue│       │  KPI tiles 2x2
│ │ 13 h 20  │ │ nuit...    │        │
│ │ ↑ +40 min│ │ ...        │        │
│ └──────────┘ └──────────┘         │
│ ┌──────────┐ ┌──────────┐         │
│ │ Repas/jour│ │ Biberon/j │        │
│ └──────────┘ └──────────┘         │
│ SOMMEIL (section heading)         │
│ ...charts...                      │
└───────────────────────────────────┘
```
- Layout: same shell as `tracker/page.tsx`: outer `text-landing-foreground`, inner
  `mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-16`, header block
  `Reveal className="border-b border-landing-border pb-4 mb-6"` with `h1.font-display text-2xl
  font-semibold sm:text-3xl` and the subtitle `hidden ... sm:block`. Back link above the `h1`:
  `inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4
  hover:underline` with `ChevronLeft` (`aria-hidden`), same recipe as the leaderboard link in
  `guess/question_wrapper.tsx`. Content is one column, `space-y-8`. Include `<TzCookie />` and
  `<TrackerLive />` like Suivi.
- Larger screens (md and up): same `max-w-4xl` single column (these are charts, not a two-column
  log). KPI tiles become 4 in a row. Inside Sleep and Feeds sections, the two small charts sit
  side by side (`md:grid-cols-2`). The range selector stays full width of the column.
- Components: `Reveal` (`@components/reveal`), `TzCookie`, `TrackerLive`, all reused.
- Typography and color: headings `font-display`; section headings copy the Suivi log heading
  `text-xs font-semibold uppercase tracking-wider text-muted-foreground`, with the kind's icon
  (`kindIcon`) in a small `CARE_TONE_CLASSES` badge to the left (size-7, rounded-full), so sections
  are recognisable by icon + word, not color.
- Interactions: only links.

#### Range selector (`_components/range_switch.tsx`, Server Component)
Wireframe:
```
 ┌──────┬──────┬──────┬──────┐
 │✓ 7 j │ 30 j │ 90 j │ Tout │
 └──────┴──────┴──────┴──────┘
```
- Layout: `nav aria-label` + `grid grid-cols-4 gap-2`.
- Components: copy `health/_components/view_switch.tsx` exactly (h-12 link, `rounded-2xl border
  border-border bg-input/50 text-sm font-medium`, active = `border-primary bg-primary/15` plus a
  `Check` icon so the active state is not color-only, `focus-visible:ring-3 ring-ring/30`,
  `scroll={false}`, `aria-current="page"`). On a 320 px phone the active tile has check + "30 j";
  labels are at most 5 chars in both languages so no truncation. Default range (`7d`) links to
  the bare `/analytics` URL, others to `?range=`.
- Not sticky (avoids a new floating layer and z-index); a user at the bottom of the page scrolls up.
- Under it, one `text-xs text-muted-foreground` line: "Du 2 au 8 nov. · moyennes sur 6 jours
  notés sur 7. Aujourd'hui n'est pas compté." (keys `periodLine`, `averagesNote`).

#### KPI tiles (`_components/stat_cards.tsx`, Server Component)
Wireframe (one tile):
```
┌──────────────────┐
│ ☾ Sommeil / jour │  icon badge + label (text-xs muted)
│ 13 h 20          │  font-display text-xl semibold
│ ↑ +40 min        │  trend (text-xs, foreground)
│ vs 7 j précédents│  text-xs muted
└──────────────────┘
```
- Four tiles: (1) Sleep per day (average), (2) Longest stretch (average of daily longest),
  (3) Feeds per day, (4) Bottle per day in ml (hidden when the baby has no bottle in the range;
  the grid then has 3 tiles and the last spans both columns on mobile: `col-span-2`).
- Layout: `grid grid-cols-2 gap-2 md:grid-cols-4`. Tile = the Suivi summary tile recipe
  `rounded-2xl border border-landing-border bg-landing-surface p-3` but left-aligned (they hold
  more lines than the 3 Suivi tiles), implemented as a `dl` with `div` per tile like the Suivi
  summary (`dt` label, `dd` value).
- Trend: lucide `ArrowUp`, `ArrowDown`, `Minus` (`aria-hidden`) + signed delta text. Direction is
  neutral information, so use `text-foreground`, not green/red (more sleep is not always
  "good", and color would be the only cue). Screen reader text (`sr-only`) reads the full sentence
  ("en hausse de 40 min par rapport aux 7 jours précédents"). No trend line when the previous
  period has fewer than 3 logged days or for `all`: the `vs ...` line is replaced by nothing (tile
  height does not jump since the min-height is fixed, `min-h-[6.5rem]`).
- Latest value: not shown in the tile (the chart readout covers it); tiles show averages only.

#### Sleep section (`_components/sleep_section.tsx`)
Wireframe (mobile):
```
 (☾) SOMMEIL
 ┌───────────────────────────────┐
 │ Sommeil par jour              │  h3 font-display text-base
 │ En moyenne 13 h 20 par jour,  │  one-sentence summary, text-sm muted
 │ en hausse de 40 min.          │
 │ 16h┤                          │
 │ 12h┤ ▓▓  ▓▓ ▒▒  ...           │  stacked: night solid, day hatched
 │  8h┤ ▓▓  ▓▓ ▓▓                │  dashed average line "moy. 13 h"
 │  0 └─L──M──M──J──V──S──D─     │
 │ ■ Nuit  ▨ Jour  ┄ Moyenne     │  legend
 │ ┌───────────────────────────┐ │
 │ │ ‹  Mardi 4 nov.        ›  │ │  readout card (aria-live)
 │ │ 13 h 20 de sommeil        │ │
 │ │ ■ Nuit 9 h 05 · ▨ Jour 4 h15│ │
 │ └───────────────────────────┘ │
 │ [ Afficher en tableau ]       │
 └───────────────────────────────┘
 ┌──────────────┐ ┌──────────────┐   (md: side by side, mobile: stacked)
 │ Siestes / jour│ │ Plus longue  │
 │  bars         │ │ période: dots│
 └──────────────┘ └──────────────┘
 ┌───────────────────────────────┐
 │ Jour / nuit (moyenne)         │
 │ ▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒          │  100 % bar
 │ Nuit 62 %          Jour 38 %  │
 └───────────────────────────────┘
```
- Chart cards: `rounded-2xl border border-landing-border bg-landing-surface p-3`, one card per
  chart, `space-y-3` between. Chart title is an `h3` (`font-display text-base font-semibold`) so
  the heading outline is h1 → h2 (section) → h3 (chart).
- 1. **Sleep per day** (inspectable stacked bars). `viewBox` about 343 x 200, plot left 34 (y labels
  like "12 h"), `h-auto w-full touch-pan-y`. Y ticks in whole hours (nice steps), axis unit labelled
  only in the tick text. Night = solid `fill-chart-4`; day = `fill-chart-4/25` with a diagonal
  hatch (`<pattern>` with `stroke-chart-4`). Hatch vs solid is the non-color cue, and the legend
  has labels. Dashed horizontal average line (`stroke-foreground/60`, `strokeDasharray="4 3"`) with
  a small right-aligned label "moy. 13 h". Bars have `rx` 3 at the top, 1 px gap between columns.
- 2. **Naps per day** (inspectable bars, integer y-ticks, `fill-chart-4/70`), height about 140.
- 3. **Longest stretch** (inspectable dot chart: `polyline` `stroke-foreground` 2px like the growth
  chart, filled dots `fill-chart-4`, ring `stroke-landing-surface`). Y ticks in whole hours. If
  fewer than 2 days have data, no line, just dots.
- 4. **Day/night split**: not another time series. A server-rendered 100 % horizontal bar (h-3
  rounded-full, night solid `bg-chart-4`, day hatched using the same pattern as a CSS
  `repeating-linear-gradient` with `chart-4` token) with the two labels and percentages underneath,
  as text. The per-day split is already visible in chart 1.
- X-axis labels: 7 days → weekday short (`EEE`, "lun."), every column. 31 days → day number, every
  5th plus the first and last. Weekly buckets → "d MMM" of the week start, every 2nd, and the
  readout says "Semaine du 3 au 9 nov. (moyenne par jour)".
- Today (partial) column: `opacity-60` + dashed outline, readout adds "(en cours)". Not-logged
  days: no bar, a 2 px muted dot on the baseline; readout says "Rien noté ce jour-là".

Common to every inspectable chart (`inspect_bar_chart.tsx`, `inspect_dot_chart.tsx`):
- The `svg` has `role="slider"`, `tabIndex={0}`, `aria-orientation="horizontal"`, `aria-valuemin=0`,
  `aria-valuemax=count-1`, `aria-valuenow=index` and `aria-valuetext` = the full readout sentence;
  `aria-label` = chart title. One tab stop per chart, not one per bar (30 stops would be hostile).
  Left/Right arrow, Home, End change the selection. Inner shapes are `aria-hidden`.
- Pointer: `onPointerDown`/`onPointerMove` (while pressed) map x to the nearest column, so a thumb
  tap or a horizontal scrub selects it. Because columns can be about 10 px wide, hit testing is by
  x position across the whole plot height, not per bar. Keep `touch-pan-y` so vertical page scroll
  still works.
- Selected column: others dim to `opacity-60`, the selected one full opacity with a 2 px
  `stroke-ring` outline and a thin vertical guide line `stroke-border`. Transition `opacity` only,
  wrapped in `motion-safe:transition-opacity`.
- Readout card (`aria-live="polite"`): `rounded-2xl border border-landing-border bg-background/60
  p-3` inside the chart card. Row 1: two 44 px `‹` `›` icon buttons (`variant="outline"`,
  `size="icon-lg"`, `rounded-2xl`, `aria-label` "Jour précédent"/"Jour suivant", reusing
  `tracker.day.previous/next`; disabled at the ends) around the date label
  (`font-display text-lg`, capitalised weekday like `DayNav`). Row 2: the main value
  (`font-display text-xl`). Row 3: breakdown with the same swatches/patterns as the legend, text
  labels always written out. These buttons are the precise alternative to scrubbing and the
  no-gesture path for everybody.
- Data table alternative: a full-width `Button variant="ghost"` (min-h-11, `aria-expanded`,
  `aria-controls`) "Afficher en tableau / Masquer le tableau" with a `Table2` or `ChevronDown`
  icon. Opens a `<table>` below (caption = chart title, `th scope` on headers; first column the
  day, then one column per series), `text-sm`, in a wrapper `max-h-72 overflow-y-auto
  rounded-2xl border border-landing-border` with `tabIndex={0}`, `role="region"` and an
  `aria-label` so it can be scrolled by keyboard. Closed by default. The table content is
  rendered always in the DOM only when open (avoid doubling the DOM for 90 rows). No animation
  beyond what `tw-animate-css` gives via `motion-safe:animate-in fade-in`.

#### Feeds section (`_components/feed_section.tsx`)
Wireframe (mobile):
```
 (🤲) REPAS
 ┌───────────────────────────────┐
 │ Repas par jour                │
 │ 8 repas par jour en moyenne.  │
 │ 10┤  ▓ ▓ ▓ ...                │  stacked: tétée solid rose,
 │  5┤  ░ ░ ░                    │  biberon dotted sage
 │  0└─L─M─M─J─V─S─D─            │
 │ ■ Tétée  ∷ Biberon            │
 │ [readout card]  [table toggle]│
 └───────────────────────────────┘
 ┌───────────────────────────────┐
 │ Intervalle entre repas        │  hidden if < 2 feeds
 │  dots: ● médiane  ◻ plus long │
 └───────────────────────────────┘
 ┌───────────────────────────────┐
 │ Côtés (tétées)                │
 │ ▓▓▓▓▓|▓▓▓|▓▓▓▓▓▓▓             │
 │ Gauche 14  Les deux 6  Droite 12│
 │ Durée moyenne d'une tétée 12 min│
 └───────────────────────────────┘
```
- 1. **Feeds per day** (inspectable stacked bars): breastfeed bottom `fill-rose`; bottle top
  `fill-sage` over a dot pattern (so shape differs: solid vs dotted). Integer y-ticks. Legend with
  icons (`HandHeart`, `Milk`, `aria-hidden`) next to the labels.
- 2. **Interval between feeds** (inspectable dot chart, y in hours with 30 min steps when the max
  is under 4 h, else whole hours): median = line plus filled circles (`fill-rose`... use
  `fill-chart-1` like the growth chart for a neutral accent), longest gap = hollow squares
  (`rect` rotated 0, `fill-none stroke-foreground`). Circle vs square is the non-color cue. Footnote
  `text-xs muted`: "Les écarts de plus de 8 h ne sont pas comptés (repas probablement non
  notés)." Hidden when fewer than 2 feeds in the range, replaced by one muted line "Pas assez de
  repas pour calculer les intervalles".
- 3. **Sides**: server-rendered horizontal 3-segment bar (h-8, `rounded-xl`, segments proportional
  with a minimum visible width), segments `bg-rose/80`, `bg-rose/50`, `bg-rose/30` plus text
  labels and counts beneath each segment (never inside, to avoid tiny-text clipping), each
  label a `dt`/`dd` pair. Order Gauche / Les deux / Droite (same as `BREAST_SIDES`). Below:
  "Durée moyenne d'une tétée : 12 min" (only if timed breastfeeds exist). Whole card hidden when no
  breastfeed in the range.

#### Bottles section (`_components/bottle_section.tsx`, only if any bottle in the range)
- Heading `Biberons` with the `Milk` icon in the `sage` badge.
- 1. **Bottle volume per day** (inspectable bars, `fill-sage`, y in ml with nice ticks). Readout:
  "{ml} ml en {n} biberons", plus "dont {k} sans quantité" when some bottles of that day have no
  amount. Average ml per bottle shown as one stat line under the chart.
- 2. **Coverage caption** (always visible under the chart, `text-xs text-muted-foreground`, with an
  `Info` icon `aria-hidden`): "{withAmount} biberons sur {total} ont une quantité : le volume
  réel peut être plus élevé." Bars are never extrapolated.

#### History timeline (`_components/day_timeline.tsx`, Server Component)
Wireframe (mobile, 343 px content width):
```
 HISTORIQUE
 ☾ Sommeil   ● Tétée   ◆ Biberon   ░ Nuit
              0h    6h    12h   18h  24h
 Auj. 8   ░░▒▒▓▓▓▓░░●─◆─░▓▓▓▓ ░░░░░░  ›
 Dim. 7   ░░▒▒▓▓▓▓░░ ●●◆ ●● ▓▓ ░░░░    ›
 Sam. 6   Rien noté                     ›
 ...
 Voir les jours plus anciens
```
- Layout: a legend row (`flex flex-wrap gap-x-4 gap-y-1 text-xs`) then an hour scale row aligned
  to the bar column (labels 0, 6, 12, 18, 24 in `text-[11px] text-muted-foreground`, positioned in
  % so they line up), then `ul.space-y-1`. Each `li` is one `Link` (`flex min-h-11 items-center gap-2
  rounded-xl px-1 hover:bg-muted/50 focus-visible:ring-3 ring-ring/30`):
  day label column `w-14 shrink-0` (weekday short + day number, `text-xs`, today shows "Auj."),
  then the 24 h track `relative h-7 flex-1 rounded-lg bg-muted/60`, then `ChevronRight`
  `size-4 text-muted-foreground`. About 225 px of track at 375 px, roughly 9 px per hour.
- Track contents (all `absolute`, positioned with `left: x%`, `width: w%`, inline style, since the
  value is data):
  - Night shading: two `bg-foreground/5` blocks for 00:00-07:00 and 19:00-24:00.
  - Sleep: a bar `top-1 bottom-1 rounded-md bg-chart-4/80`, `min-width: 3px`; ongoing sleep ends
    with a square end and a dashed right edge. Shape: wide bar.
  - Breastfeed: circle `size-2.5 rounded-full bg-rose` centred on the start (when timed, a rose
    `h-2.5` pill of its length, min 10 px). Shape: round.
  - Bottle: diamond `size-2.5 rotate-45 bg-sage`. Shape: diamond.
  - Overlaps: sleep bar at the back (`z-0`), feeds in front (`z-10`); the track is `isolate`.
    These are local tiers per `docs/z-index.md` and don't leave the track.
- Row for a not-logged day: the track shows the text "Rien noté" (`text-xs text-muted-foreground`,
  centred), no shading.
- Newest first, max 31 rows. If the range has more than 31 days, a link below
  ("Voir les jours plus anciens") reveals the rest; see Questions for how.
- Each row's accessible name (put `aria-label` on the `Link`, track is `aria-hidden`): "lundi 3
  novembre : 13 h 20 de sommeil, 7 repas, 1 biberon. Ouvrir ce jour". Link target
  `/baby/[id]/tracker?day=D` (today links to the bare `/tracker`, like `DayNav`).
- Tapping a block inside the row does the same as tapping the row (no per-block interaction, to
  avoid tiny targets).
- Wider screens: same layout; the track simply grows (label `w-20`).

### States
- Loading: `analytics/loading.tsx` mirrors the page like `tracker/loading.tsx`
  (`role="status" aria-live="polite"`, `sr-only` `common.loading`, `animate-pulse` blocks with
  `bg-muted` / `bg-muted/70`): header bar `h-8 w-40`, range row of 4 `h-12 rounded-2xl`, a 2x2
  grid of `h-28 rounded-2xl` tiles, one `h-52 rounded-2xl` chart block, a second smaller one, and
  4 `h-11 rounded-xl` timeline rows. Range switches also trigger it (Next `loading.tsx`);
  `scroll={false}` keeps position.
- Empty (no entry ever): replaces everything under the header, no range selector. Centered card
  `rounded-2xl border border-dashed border-landing-border bg-landing-surface p-6 text-center`:
  `Moon` icon in a `chart-4` badge (aria-hidden), text "Pas encore de données" (`font-display
  text-lg`), hint "Les statistiques apparaîtront dès les premières entrées du Suivi." and an
  outline `Link` button (h-11) "Aller au suivi" → `/tracker`.
- Empty (range has no entries, but the baby has some): range selector stays; below it a card with
  the same style: "Rien de noté sur cette période", hint "Essayez une période plus longue." and a
  link to the next wider range (30 j → 90 j → Tout; for `all` this state can't happen).
- Partial data:
  - Fewer than 3 logged days in the previous period: no trend line on the tiles; the note line
    says "Pas assez de jours avant cette période pour comparer." (once, under the tiles, not per
    tile).
  - Fewer than 2 logged days in the range: tiles show the value, charts still render (single
    columns), dot charts render dots without a line.
  - A section with no data (no bottle, no breastfeed) is hidden entirely; if only one kind has
    data the page just has fewer sections.
  - Today is always visibly partial: lighter column + "(en cours)" in the readout, excluded from
    averages (stated in the note line).
  - Not-logged days: baseline dot in charts, "Rien noté" in readout, table cell "—".
- Error: `analytics/error.tsx` copies `tracker/error.tsx` (same copy, a retry button and a link
  back to Suivi). A failed refresh from `TrackerLive` leaves the last rendered data in place.
- Success: read-only page, no toast. The only feedback is selection change in the readout and the
  `aria-current` change on the range.
- Offline / slow: no uploads. Slow: the `loading.tsx` skeleton. Offline: navigation fails into the
  error boundary with the retry button; already-open charts keep working (selection and table
  toggle are local state, no fetch).

### Copy
All under `tracker.analytics.*`. French is the primary text. ICU plurals use the repo's existing
`{count, plural, ...}` style.

| Key | English | French |
|-----|---------|--------|
| analytics.link | Analytics | Statistiques |
| analytics.back | Back to tracking | Retour au suivi |
| analytics.title | Analytics | Statistiques |
| analytics.subtitle | Trends in sleep and feeds over the days and weeks. | Les tendances du sommeil et des repas, jour après jour. |
| analytics.range.label | Period | Période |
| analytics.range.7d | 7 d | 7 j |
| analytics.range.30d | 30 d | 30 j |
| analytics.range.90d | 90 d | 90 j |
| analytics.range.all | All | Tout |
| analytics.periodLine | {from} to {to} | Du {from} au {to} |
| analytics.averagesNote | Averages over {logged} of {total} days with entries. Today is not counted. | Moyennes sur {logged} jours notés sur {total}. Aujourd'hui n'est pas compté. |
| analytics.noComparison | Not enough days before this period to compare. | Pas assez de jours avant cette période pour comparer. |
| analytics.sections.sleep | Sleep | Sommeil |
| analytics.sections.feeds | Feeds | Repas |
| analytics.sections.bottles | Bottles | Biberons |
| analytics.sections.history | History | Historique |
| analytics.tiles.sleep | Sleep per day | Sommeil par jour |
| analytics.tiles.longest | Longest stretch | Plus longue période |
| analytics.tiles.feeds | Feeds per day | Repas par jour |
| analytics.tiles.bottle | Bottle per day | Biberon par jour |
| analytics.trend.up | up {delta} | en hausse de {delta} |
| analytics.trend.down | down {delta} | en baisse de {delta} |
| analytics.trend.same | unchanged | stable |
| analytics.trend.vsPrevious | vs previous {days} days | vs {days} jours précédents |
| analytics.trend.vsPreviousSr | compared with the previous {days} days | par rapport aux {days} jours précédents |
| analytics.metrics.sleepPerDay | Sleep per day | Sommeil par jour |
| analytics.metrics.naps | Naps per day | Siestes par jour |
| analytics.metrics.longestStretch | Longest sleep stretch | Plus longue période de sommeil |
| analytics.metrics.daySplit | Day and night (average) | Jour et nuit (moyenne) |
| analytics.metrics.day | Day | Jour |
| analytics.metrics.night | Night | Nuit |
| analytics.metrics.average | avg. {value} | moy. {value} |
| analytics.metrics.feedsPerDay | Feeds per day | Repas par jour |
| analytics.metrics.feedInterval | Time between feeds | Intervalle entre les repas |
| analytics.metrics.median | Median | Médiane |
| analytics.metrics.longestGap | Longest gap | Écart le plus long |
| analytics.metrics.gapNote | Gaps over {hours} h are not counted (feeds probably not logged). | Les écarts de plus de {hours} h ne sont pas comptés (repas probablement non notés). |
| analytics.metrics.noIntervals | Not enough feeds to work out the time between them. | Pas assez de repas pour calculer les intervalles. |
| analytics.metrics.sides | Breast sides | Côtés de tétée |
| analytics.metrics.avgFeedDuration | Average breastfeed: {duration} | Durée moyenne d'une tétée : {duration} |
| analytics.metrics.bottleVolume | Bottle volume per day | Volume de biberon par jour |
| analytics.metrics.avgBottle | Average per bottle: {amount} | Moyenne par biberon : {amount} |
| analytics.metrics.amountCoverage | {withAmount} of {total} bottles have an amount, so the real volume may be higher. | {withAmount} biberons sur {total} ont une quantité : le volume réel peut être plus élevé. |
| analytics.readout.partialToday | in progress | en cours |
| analytics.readout.notLogged | Nothing logged that day | Rien noté ce jour-là |
| analytics.readout.week | Week of {from} to {to} (daily average) | Semaine du {from} au {to} (moyenne par jour) |
| analytics.readout.sleepBreakdown | Night {night} · Day {day} | Nuit {night} · Jour {day} |
| analytics.readout.napCount | {count, plural, one {# nap} other {# naps}} | {count, plural, one {# sieste} other {# siestes}} |
| analytics.readout.feedBreakdown | {breast, plural, one {# breastfeed} other {# breastfeeds}} · {bottle, plural, one {# bottle} other {# bottles}} | {breast, plural, one {# tétée} other {# tétées}} · {bottle, plural, one {# biberon} other {# biberons}} |
| analytics.readout.missingAmount | {count, plural, one {# without an amount} other {# without an amount}} | {count, plural, one {# sans quantité} other {# sans quantité}} |
| analytics.chart.showTable | Show as table | Afficher en tableau |
| analytics.chart.hideTable | Hide table | Masquer le tableau |
| analytics.chart.tableLabel | Data table: {chart} | Tableau de données : {chart} |
| analytics.chart.day | Day | Jour |
| analytics.chart.week | Week | Semaine |
| analytics.chart.hint | Tap a column or use the arrow buttons to see a day. | Touchez une colonne ou utilisez les flèches pour voir un jour. |
| analytics.chart.summary.sleep | On average {duration} of sleep per day, {trend}. | En moyenne {duration} de sommeil par jour, {trend}. |
| analytics.chart.summary.naps | On average {count} naps per day. | En moyenne {count} siestes par jour. |
| analytics.chart.summary.longest | The longest stretch averages {duration}. | La plus longue période dure en moyenne {duration}. |
| analytics.chart.summary.feeds | On average {count} feeds per day, {trend}. | En moyenne {count} repas par jour, {trend}. |
| analytics.chart.summary.interval | The median time between feeds is {duration}. | Le temps médian entre deux repas est de {duration}. |
| analytics.chart.summary.bottle | On average {amount} of bottle per day. | En moyenne {amount} de biberon par jour. |
| analytics.timeline.label | Day by day, over 24 hours | Jour après jour, sur 24 heures |
| analytics.timeline.legend | Legend: sleep bar, breastfeed circle, bottle diamond, shaded night | Légende : barre de sommeil, rond de tétée, losange de biberon, nuit grisée |
| analytics.timeline.empty | Nothing logged | Rien noté |
| analytics.timeline.today | Today | Auj. |
| analytics.timeline.openDay | {date}: {summary}. Open this day | {date} : {summary}. Ouvrir ce jour |
| analytics.timeline.olderDays | Show {count} older days | Voir les {count} jours plus anciens |
| analytics.empty.noneTitle | No data yet | Pas encore de données |
| analytics.empty.noneHint | Analytics appear as soon as the first entries are logged in tracking. | Les statistiques apparaîtront dès les premières entrées du suivi. |
| analytics.empty.noneCta | Go to tracking | Aller au suivi |
| analytics.empty.rangeTitle | Nothing logged in this period | Rien de noté sur cette période |
| analytics.empty.rangeHint | Try a longer period. | Essayez une période plus longue. |
| analytics.empty.rangeCta | Show {range} | Voir {range} |

Existing keys reused: `tracker.day.previous`, `tracker.day.next`, `tracker.duration.*`,
`tracker.kinds.*`, `tracker.sides.*`, `tracker.summary.amount`, `common.loading`.

### Accessibility
- Heading outline: `h1` page title, `h2` per section (Sommeil, Repas, Biberons, Historique), `h3`
  per chart card.
- Every chart has a visible one-sentence summary above it (not only `<title>`/`<desc>`), which is
  what a screen reader reads first. The `svg` itself is the `role="slider"` described above, with
  `aria-valuetext` giving the full sentence for the selected day. Decorative shapes inside are
  `aria-hidden`. The server-only bars (day/night, sides) are `role="img"` with an `aria-label`
  carrying the numbers, and the visible text labels below them carry the same.
- Data table alternative per inspectable chart (see above), reachable by keyboard, closed by
  default, with a proper caption and header scopes. The timeline rows are links whose accessible
  name is the whole-day sentence, so the timeline is its own text alternative.
- Color is never the only cue: stacked bars use solid vs hatch vs dots; dot charts use circle vs
  square; timeline uses bar vs circle vs diamond; the selected column has an outline; active range
  has a `Check`; trend has an arrow icon and words, and no red/green.
- Contrast: all text uses `text-foreground` / `text-muted-foreground`; graphics use the `--chart-*`
  / `--rose` / `--sage` tokens that already have a dark variant in `globals.css`. Graphic fills
  should stay at 3:1 against `bg-landing-surface`; if the `/25` hatch fill in dark mode is too faint,
  raise to `/35`. Verify in both themes. No raw hex or oklch in components; the hatch `<pattern>`
  uses `stroke-chart-4` classes. Dark mode (likely at night): no pure white fills, no glare;
  nothing new is needed beyond tokens.
- Touch targets at least 44 px: back link (`min-h-11`), range links (`h-12`), prev/next buttons
  (`icon-lg`), table toggle (`min-h-11`), timeline rows (`min-h-11`), "older days" link (`min-h-11`).
  Individual 10 px bars are deliberately not targets: selection is by x-position across the plot
  and the ‹ › buttons.
- Focus: visible `focus-visible:ring-3 ring-ring/30` on links/buttons, and on the chart `svg` a
  `focus-visible:outline-2 outline-ring rounded-xl` frame. Tab order follows reading order; one stop
  per chart plus its two buttons and the table toggle.
- Reduced motion: no entrance animation on bars; selection uses `motion-safe:transition-opacity`
  only; the table toggle uses `motion-safe:animate-in`. `Reveal` already handles the header.
- Language: dates through `getDateFnsLocale`, numbers through `getLocaleTag` (comma decimals in
  French). All strings come from messages, none hard-coded in builders. French strings are about
  25 % longer: tile labels wrap onto 2 lines (don't truncate), range labels are short on purpose,
  readout lines wrap.

### Questions
1. **History bucketing threshold.** The design asks to change the plan's "daily up to 90 days" rule
   to "daily up to 31 days, weekly above" (so `90d` shows about 13 weekly bars), because 90 daily
   bars are unreadable and untappable on a phone. OK? This only touches the chart builder (step 3).
2. **Sub-route vs tab** (open question 1): the design assumes the sub-route and the header button
   on Suivi. Fine?
3. **"Older days" in History.** The plan says the link "sets the range", but `90d`/`all` already
   chart every day, so the link would change nothing. Proposed instead: the History list shows 31
   rows and a link `?range=<same>&history=all` ("Voir les N jours plus anciens") that shows all of
   them (still server-rendered, no JS). This adds one URL param to the plan. OK, or should
   History simply never exceed 31 days?
4. **Neutral trend color.** The design shows trends without green/red. Is that what you want, or
   should "more sleep" be highlighted as positive? (Recommended: neutral, since a parent may read a
   drop in feeds as good or bad depending on age.)
5. **Open questions 2 to 5** (day window 07-19, 8 h gap cutoff, remembering the range, timezone
   basis) don't change the visuals; the copy and layout work with any answer. If the day/night hours
   ever become a per-baby setting, the legend should show the actual hours.
6. **Not-logged vs zero days** are shown with a baseline dot rather than a zero-height bar. Confirm
   this matches your intent, since a parent may want to read it as "no sleep logged" rather than
   "didn't sleep".

## Risks and open questions
1. **Sub-route vs tab.** The plan uses `tracker/analytics` with a link from the Suivi header. The
   alternative is a `?view=log|analytics` switch on Suivi (Health pattern), which is one less
   navigation but a heavier Suivi page. Which do you prefer?
2. **Day/night window.** Is a fixed 07:00–19:00 day OK, or should it be a per-baby setting? A
   setting would need a migration and is out of scope for v1.
3. **Feed gap cutoff.** Should gaps over 8 h be dropped as "not logged" from interval stats? Dropping
   them hides real long night stretches, but keeping them makes forgotten entries look like 14 h
   gaps.
4. **Default range.** 7 days is proposed. Should the range be remembered (a cookie) or always reset?
5. **Timezone basis.** Buckets use the viewer's device zone, like the day page. Two parents in
   different zones would see slightly different per-day numbers. Switching to the family zone
   (`FAMILY_TIME_ZONE`) would make the numbers consistent but differ from the day page.
6. **Chart library.** A hand-drawn SVG chart (no dependency, Health decision 6) is proposed. Should
   we use Recharts/Shadcn charts instead if the designer wants hover tooltips or animations? They
   add about 100 kB of client JS.
7. **Volume.** JS aggregation pages through about 5.5k rows per year. That's fine for `all` for the
   first couple of years. If it ever gets slow, move per-day aggregation into a `SECURITY INVOKER`
   RPC (see Data and migrations).
8. **MCP.** Should a `get_tracker_stats` tool reuse `computeTrackerAnalytics` in a follow-up?
9. **Page access.** Analytics inherits the tracker page role. Should viewers ever see stats without
   the log (separate page id)? It's not planned.

## How to verify
- `pnpm typecheck` and `pnpm lint` pass after every step.
- **Counting rules**: run a scratch script (step 2) on fixed fixtures. Cases:
  - A sleep from 22:00 to 06:00, split across 2 days on the totals, one stretch on the start day,
    and counted as night sleep.
  - A running sleep, counted up to `now`.
  - A DST change day (Europe/Paris, last Sunday of October: a 25 h day).
  - A bottle without an amount.
  - A logged day next to an empty day.
- **Today's numbers**: on the analytics page, today's sleep total, feed count and bottle ml (marked
  partial) match the three Suivi summary tiles for today. Pick a past day too, and check it against
  `?day=` on Suivi.
- **Ranges**: switch 7d/30d/90d/all.
  - The URL updates and the back button works.
  - `?range=foo` falls back to 7d.
  - `all` starts at the first entry, and switches to weekly buckets past 90 days.
- **Timeline**: tapping a day opens Suivi on that day.
- **Live**: start a sleep on another phone, and analytics refreshes within a second.
- **Empty states**: a baby with no entries, and a range with none, both show the empty states.
  Per-kind sections with no data are hidden.
- **Mobile**: at a 360 px width there is no horizontal scroll and the charts are legible. Check
  light and dark themes.
- **Accessibility**: in VoiceOver/TalkBack, each chart reads its summary and the table is reachable.
  The range links announce the current state.
- **Access**:
  - A viewer opening `/baby/<id>/tracker/analytics` while the tracker role is admin is redirected,
    the same as for `/tracker`.
  - A user who is not a member of the baby is redirected.
  - With the tracker page disabled, the route is unavailable.
  - Calling `getTrackerRange` with another baby's id from a non-member session throws
    `unauthorized`.
  - A span over `CARE_ANALYTICS_MAX_DAYS` is rejected.
