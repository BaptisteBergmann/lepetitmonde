---
tags: [lepetitmonde/feature]
---

# Diaper changes

Up: [[Baby tracker]] · Route: `/baby/[babyId]/tracker` · Code: `tracker/_components/diaper_card.tsx`, `care_event_modal.tsx`, `care-core.ts`, `care-validation.ts`, `src/components/toggle_choice.tsx`

Log a diaper change in one tap and see the counts for the day and the time since the last change. It is a fourth `care_event_kind` (`diaper`) in the `care_events` table, so day log, editing, realtime, access checks and [[MCP server]] deletion work as for other kinds.

## Behaviour

- **Diaper card** in the "now" panel (under the timer tiles): three buttons, **Pee**, **Poop**, **Both**. A tap creates an entry at now, with no dialog and no toast. All three are inert while a request is in flight, which also makes a double tap create one entry. Offline, they do nothing (no queued writes).
- **Last change** readout in the card ("Poop · 2 h ago"), or "No diaper logged yet".
- **Details strip**: after a Poop or Both log, a quiet strip offers "Add colour and texture", which opens the edit modal on that entry. It goes away after 60 s (paused while it has focus), on the next log, or on dismiss.
- **Entry modal**: Pee and Poop are independent toggles and at least one is required (no dry diapers). Colour (black, green, yellow, brown, red, white / pale) and texture (liquid, seedy, soft, formed, hard) are optional, only shown with Poop, and cleared when Poop is turned off.
- **Day log row**: "Diaper · Pee and poop · Yellow · Soft".
- **Day summary**: one **Diapers** tile, "4 wet · 2 dirty"; a "both" counts in each. Zero is shown as a real count.
- **Analytics**: a diapers section (stacked wet over dirty bars), a "Wet / day" tile and a triangle mark in the 24 h history, see [[Tracker analytics]]. Only counts are charted.
- **MCP**: `add_tracker_entry` takes `kind: 'diaper'` with `pee`, `poop`, `poopColor`, `poopTexture`; `get_tracker_status` returns `lastDiaper`; day totals gain `wetCount` and `dirtyCount`. Digests include the counts and pee/poop of the last diaper, never colour or texture.

## Data

Two migrations (a new enum value can't be used in the transaction that adds it): `20261108120000_add_care_event_kind_diaper.sql` and `20261108120100_care_events_diaper_fields.sql`. The second adds `pee`, `poop`, `poop_color`, `poop_texture` plus two CHECKs: a diaper needs `pee` or `poop`, has no end, side or amount, and colour/texture need `poop`; non-diaper kinds must leave the four columns null. The four columns are added to the column-level `UPDATE` grant for `authenticated`, otherwise web edits fail while MCP (service role) still works. See [[Data model]] and [[Row Level Security]].

## Privacy

Stool details are health data. They are visible only to members allowed on the tracker page, and are kept out of analytics rows, charts and digests.

## Not included (phase 2)

Newborn guidance (expected wet diapers per day) and inventory decrement are out of scope; see `.claude/plans/diaper-changes.md`.

## Deployment note

An older image crashes on a `diaper` row (unknown kind in `CARE_KIND_CONFIG`). If the `:latest` and `:prod` stacks share one database, promote `:prod` before logging real diapers on dev.
