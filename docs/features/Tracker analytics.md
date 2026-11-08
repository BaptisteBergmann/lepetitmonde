---
tags: [lepetitmonde/feature]
---

# Tracker analytics

Up: [[Le petit monde]] · Route: `/baby/[babyId]/tracker/analytics` · Code: `tracker/analytics/`, `care-analytics.ts`, `care-analytics-chart.ts`, `getTrackerRangeCore` in `care-core.ts`

Trends over days and weeks for the [[Baby tracker]]: sleep, feeds and bottles, plus a 24 h history. Opened from the "Statistiques" button in the Suivi header; the bottom nav keeps "Suivi" highlighted.

- **Ranges**: `?range=7d|30d|90d|all` (default `7d`, anything else falls back to it). The range lives in the URL only, it is not remembered. `all` starts at the first entry and is clamped to `CARE_ANALYTICS_MAX_DAYS` (1100 days).
- **Same access as Suivi**: `assertPageAccess(babyId, 'tracker')`, so a viewer (when the role is admin), a non-member or a disabled page is turned away exactly like on Suivi. No stats-only page.
- **Data**: no migration. One read of `care_events` through RLS (user session client, narrow columns: no note, no author), paged by 1000 because PostgREST caps responses (`max_rows`). See [[Row Level Security]].
- **Computation**: `care-analytics.ts` is pure and client-safe; the page aggregates on the server and passes only strings and numbers to the charts.
- **Charts**: hand-drawn SVG, no chart library (same call as [[Health]]). Two client components, `inspect_bar_chart.tsx` and `inspect_dot_chart.tsx`, give tap-to-inspect: tap or scrub a column, or use the previous/next buttons or arrow keys, and a readout card shows the exact values. Each chart also has a "show as table" alternative. Daily columns up to 31 days, ISO-week buckets (per-day averages) above, so `90d` and `all` show weekly bars.
- **History**: one 24 h row per day (last 31 days at most, newest first), each linking to that day on Suivi.
- **Live**: `TrackerLive` refreshes the page when a parent logs something ([[Realtime]]).
- **Not covered**: the [[MCP server]] has no stats tool yet.

## Counting rules

They match the Suivi day page so the numbers agree.

- A day is the local calendar day in the **viewer's device zone** (23/25 h on DST days), see [[Internationalization]].
- **Feeds and bottles** count on the day they started.
- **Sleep** is clamped to each day, so a 22:00 to 06:00 sleep adds to two days. A running timer counts up to now.
- **Day and night** use a fixed window: day is 07:00 to 19:00, the rest of the calendar day is night, so day plus night equals the day's sleep. It is not a per-baby setting.
- A **nap** is a sleep that starts inside the day window.
- **Longest stretch** is the full length of the longest sleep that started on that day (21:00 to 05:00 is one 8 h stretch on the start day).
- **Time between feeds** is start to start across all feeds, attributed to the day of the later feed. Gaps over 8 h are dropped as probably not logged, so they don't show up as the median or longest gap.
- **Not logged is not zero**: a day where nothing started has a dot on the baseline and "Rien noté", and is left out of averages. Today is shown but marked in progress and also left out of averages.
- **Trend** compares an average with the previous period of equal length, only when that period has at least 3 logged days (never for `all`). Neutral styling: arrow plus words, no green or red.
- **Bottles without an amount** count as bottles but not in the volume, and the page says how many have an amount.
