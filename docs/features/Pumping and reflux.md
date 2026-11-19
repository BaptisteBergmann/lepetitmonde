---
tags: [lepetitmonde/feature]
---

# Pumping and reflux

Up: [[Baby tracker]] · Route: `/baby/[babyId]/tracker` · Code: `tracker/_components/now_panel.tsx`, `care_event_modal.tsx`, `kind_ui.ts`, `care-core.ts`, `care-validation.ts`, `care-events.ts`

Two more `care_event_kind` values in the `care_events` table: **pumping** (tire-lait, the parent expressing milk) and **reflux** (baby spit-up). Day log, editing, realtime, access checks and [[MCP server]] deletion work as for other kinds, like [[Diaper changes]].

## Behaviour

- **Quick actions**: a second, compact row of two tiles under Sleep / Breastfeed / Bottle. Tapping a tile opens an inline panel (one panel at a time, `Escape` closes it).
  - **Pumping** panel: an amount stepper (step 10 ml, 1 to 1000) prefilled with the last pumped amount, else 50 ml (`CARE_LIMITS.pumpDefault`), an optional side (left / both / right, none selected, with "Clear side") and two buttons, "Log pumping" and "Log without amount". The tile hint shows the time since the last pumping ("3 h ago"), else "Log". No timer: pumping is point-in-time.
  - **Reflux** panel: three buttons **Small / Medium / Large** (FR: Petit / Moyen / Gros), each logs at now, plus "Log without detail". No readout of the last reflux, no thresholds or advice anywhere.
- **Entry modal**: pumping has time, optional side (with a clear button), optional amount and note; reflux has time, optional severity (with a clear button) and note.
- **Day log row**: "Pumping · Left · 120 ml", "Reflux · Large". A pumping entry without amount does not read "Amount not set": both details are optional.
- **Day summary**: two tiles. Pumping reads "3 · 240 ml", or just the count when no session has an amount, and "0" when none. Reflux is the count ("0" included).
- **Pumping is not a feed**: it stays out of `FEED_KINDS`, so the last-feed card, the next-side suggestion, the feeds tile and the bottle total never include it.
- **Analytics**: sections, history marks and the "never a zero sleep or feed day" rule are described in [[Tracker analytics]].
- **MCP**: see [[MCP server]]. `add_tracker_entry` accepts `kind: 'pumping' | 'reflux'`; a bad `refluxSeverity` returns the `invalidSeverity` error.

## Data

Two migrations (a new enum value can't be used in the transaction that adds it): `20261119120000_add_care_event_kinds_pumping_reflux.sql` and `20261119120100_care_events_pumping_reflux_fields.sql`. The second adds the `reflux_severity` enum (`small`, `medium`, `large`) and column, `care_events_pumping_fields` (no end, not ongoing, amount 1 to 1000 or null), `care_events_reflux_fields` (no end, not ongoing, no side, no amount) and `care_events_reflux_severity_only_reflux`. `breast_side` is reused for pumping (nullable there). The new column is added to the column-level `UPDATE` grant for `authenticated`. See [[Data model]] and [[Row Level Security]]. Enum values cannot be removed once added.

## Deployment note

An older image crashes on a `pumping` or `reflux` row (unknown kind in `CARE_KIND_CONFIG`). Apply the migrations before the new image runs, and if the `:latest` and `:prod` stacks share one database, promote `:prod` before logging real entries on dev.

## Not included

Pumped-milk stock, a pumping timer, pump duration or per-side amounts, medical guidance and alerts.
