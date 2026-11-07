---
tags: [lepetitmonde/feature]
---

# Calendar

Up: [[Le petit monde]] · Route: `/baby/[babyId]/calendar` · Code: `calendar/`, `actions/events.ts`, `events-core.ts`

A month grid that combines **events** with [[Feed]] posts (shown as day thumbnails). Clicking a day opens a sheet with that day's posts and events.

- Event kinds (`event_kind`): `occasion`, `life_stage` (milestones such as first steps, first tooth, first word, first smile, first laugh, birthday) and `medical`.
- Same circle visibility as posts ([[Authorization]]).
- Admins create and edit events; a `life_stage` event notifies the family (`new_life_stage`).
- Available to AI clients through the [[MCP server]] (`list_events`, `add_event`).

Tables: `events`, `events_circles`.
