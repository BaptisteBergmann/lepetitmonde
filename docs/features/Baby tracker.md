---
tags: [lepetitmonde/feature]
---

# Baby tracker

Up: [[Le petit monde]] · Route: `/baby/[babyId]/tracker` · Code: `tracker/`, `actions/care_events.ts`, `care-*.ts`

Logs daily care, built for one-handed use at night.

- Kinds (`care_event_kind`): **sleep** (start/stop timer or entered afterwards), **breastfeed** (left / right / both, optional timer) and **bottle** (ml).
- Every entry records who logged it.
- A "now" panel shows running timers and the time since the last feed or sleep; a day log with navigation lists entries.
- At most one running timer per kind per baby (unique index): if two parents tap "start" together, the second gets "already running".
- Timers and entries sync live between phones through the [[Realtime]] relay.
- Times are stored UTC and displayed in the device's zone ([[Internationalization]]).
- The model is one polymorphic table so new kinds (diaper, medication, temperature...) are cheap to add.
- [[MCP server]] tools: `get_tracker_status`, `list_tracker_entries`, `add_tracker_entry`, `start_tracker_timer`, `stop_tracker_timer`, `delete_tracker_entry`.

Trends over days and weeks live on a sub-route, see [[Tracker analytics]] (`/baby/[babyId]/tracker/analytics`, linked from the page header).

Table: `care_events` (RLS on, column-level update grants; see [[Row Level Security]]).
