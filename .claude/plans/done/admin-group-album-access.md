# Admin: group → album/photo access viewer — plan

## Status: implemented

Shipped exactly as planned: reused the existing `getAlbums(babyId)` action
(no new server action needed, since admins already get every album
unfiltered), added a new `DisplayCircleAccess` client component with a
single-select circle picker that filters the album list client-side, and a
new "Access by group" card on `/baby/[babyId]/admin` next to the existing
Circles card. i18n keys added to both `messages/en.json` and
`messages/fr.json` under `admin.groupAccessTitle`/`groupAccessDescription`
(card header) and a nested `admin.groupAccess.*` namespace (component
strings), reused `albums.photoCount` for the pluralized count string.

Deviations from the original plan:
- **Admin-only albums (no circle assigned) are not surfaced anywhere in this
  view** — the "open item" in the original plan about showing an "admin
  only" pseudo-option was left out of v1, since the ask was specifically
  "what does this group have access to," not a full access audit.
- **No live click-through against the real database** — same reasoning as
  prior plans (Albums, Anecdotes): the dev server would run against the
  user's own authenticated session and real family data. Verified
  structurally instead (`tsc --noEmit`, `eslint`, `next build` all clean).
  The select → filtered album list flow should get a manual pass from the
  user.

## Context

Feature request: as an admin, a way to pick a group (called a "Circle" in
this codebase — `circles`/`circles_access` tables) from a select and see
which albums/photos that group currently has access to.

**What already exists** (confirmed by reading `src/utils/actions/albums.ts`
and the Albums UI): the *forward* direction — per-album circle assignment —
is fully built. `create_album_modal.tsx`/`edit_album_modal.tsx` already let
an admin pick which circles can see a given album (multi-`Select`, calls
`createAlbum`/`updateAlbum` with `circleIds`), stored in the `albums_circles`
join table, and the album detail page already shows a given album's assigned
circles as badges. "No circle assigned" means admin-only, same rule used for
posts/events/anecdotes/stories.

**What's missing** is the *reverse* lookup: pick a circle, see every album
(and its photos) that circle can see, in one place — without opening each
album's edit modal individually to check. That's this plan.

There's no per-photo circle assignment in this codebase — visibility is only
at the album level (`album_photos` has no `_circles` join table; a photo with
no album, i.e. "unsorted", is admin-only). So this view shows **albums**,
each with its cover/photo count, not individual per-photo permissions.

## Design

New card on the existing `/baby/[babyId]/admin` page (admin-only, same gate
as the other admin-only cards there), placed near the existing "Circles"
card since they're related:

- A single-select `Select` (Shadcn/`base-ui` wrapper already in
  `src/components/ui/select.tsx`, same component used elsewhere — but
  **single-select** here, unlike the `multiple` usage in
  `create_album_modal.tsx`) listing the baby's circles.
- On selecting a circle, show the list of albums assigned to it: cover
  thumbnail, name, photo count, and a link through to
  `/baby/${babyId}/albums/${album.id}`.
- Empty state distinct from "nothing selected yet": "this group has no album
  assigned" when a circle is selected but the filtered list is empty.

### Data: reuse `getAlbums`, no new server action needed

`getAlbums(babyId)` (`src/utils/actions/albums.ts` L295) already returns
**every** album with a `circleIds: string[]` field when the caller is admin
(`withVisibility` grants admins everything, unfiltered). The admin page
already establishes `isAdmin` before rendering admin-only cards. So instead
of adding a new `getAlbumsForCircle(babyId, circleId)` action (which would
mean a network round-trip every time the admin switches the select), the
admin page fetches the full `getAlbums(babyId)` list once server-side, passes
it to a new Client Component, and that component filters
`albums.filter(a => a.circleIds.includes(selectedCircleId))` locally as the
admin changes the select. Simpler, and avoids N+1 queries for a view that's
purely for browsing.

`admin/page.tsx` doesn't currently import `getAlbums` — this plan adds that
import and calls it alongside the existing `getCircles`/`getAllCirclesAccess`
calls, admin-gated like the rest of that page's data fetches.

### New component: `display_circle_access.tsx`

`src/app/baby/[babyId]/admin/_components/display_circle_access.tsx` — Client
Component (needs `useState` for the selected circle):

```tsx
'use client'
function DisplayCircleAccess({ babyId, circles, albums }: {
  babyId: string
  circles: Tables<'circles'>[]
  albums: AlbumWithDetails[] // already has circleIds, coverUrl, photos
}) {
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null)
  const filtered = selectedCircleId
    ? albums.filter((a) => a.circleIds.includes(selectedCircleId))
    : []
  // Select (single) + filtered.map(album => row: coverUrl thumb, name,
  // photos.length, Link to /baby/${babyId}/albums/${album.id})
}
```

Row rendering can closely follow the existing album card markup in
`albums_view.tsx` (cover image + name), just smaller/simpler since this is a
compact admin list, not the main gallery grid.

### Wiring into `admin/page.tsx`

- Add `import { getAlbums } from "@utils/actions/albums"` and an
  `AlbumWithDetails[]` fetch (admin-gated: `isAdmin ? await getAlbums(babyId) : []`,
  same conditional pattern already used for `devicesByUser`/`bugReports`).
- New `Card` (admin-only, same `{isAdmin && (...)}` guard as the other
  admin-only cards), title/description from new i18n keys, rendering
  `<DisplayCircleAccess babyId={babyId} circles={circles} albums={albums} />`.

### i18n

Add to `messages/en.json` and `messages/fr.json` under the existing `admin`
namespace (matching the naming convention of `circlesTitle`/
`circlesDescription` already there):
- `groupAccessTitle` / `groupAccessDescription`
- `groupAccessSelectPlaceholder`
- `groupAccessEmpty` (no circle selected yet)
- `groupAccessNoAlbums` (circle selected, but has no albums)
- `groupAccessPhotoCount` (e.g. "{count} photos")

## Open items to confirm while implementing

- Whether to also surface admin-only albums (no circle assigned at all) in
  this view — e.g. an "Admin only" pseudo-option in the select, or a
  permanently-visible section. Not asked for explicitly; proposed as a
  follow-up rather than blocking v1, since the ask was specifically "what
  does *this group* have access to."
- Whether unsorted (no-album) photos should be mentioned at all here — they
  have no circle by construction (admin-only), so arguably out of scope for
  a per-circle view; flagging so it's a deliberate omission, not a miss.

## File list

**New:**
- `src/app/baby/[babyId]/admin/_components/display_circle_access.tsx`

**Edited:**
- `src/app/baby/[babyId]/admin/page.tsx`
- `messages/en.json`, `messages/fr.json`

## Git workflow

Per CLAUDE.md, one commit per verified subtask:
1. i18n keys (`messages/en.json` + `messages/fr.json`)
2. `display_circle_access.tsx` component
3. Wire into `admin/page.tsx` (fetch + new Card)

Each followed by its own `CHANGELOG.md` update commit.
