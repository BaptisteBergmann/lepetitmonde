---
tags: [lepetitmonde/feature]
---

# Albums

Up: [[Le petit monde]] · Route: `/baby/[babyId]/albums` · Code: `albums/`, `actions/albums.ts`, `albums-internal.ts`

The baby's photo library.

- Two tabs: **All photos** (every photo, including those not in an album) and **Albums**.
- Photos posted in the [[Feed]] or in [[Stories]] are mirrored into the library automatically (`source_post_id`, `source_story_id`).
- Admins create albums, add or remove photos, assign circles (no circle = admin-only) and share them ([[Share links]]).
- A photo info dialog shows details (date, metadata) and lets admins move a photo between albums.
- The [[Admin console]] has an "Access by group" card listing which albums each circle can see.
- Server-generated thumbnails keep the grid light ([[Storage and media]]).

Tables: `albums`, `albums_circles`, `album_photos`. Limits: `album-limits.ts` (name 100 chars, 30 files per upload).
