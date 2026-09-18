# Photo info modal for Albums

## Context

On the Photos page (`/baby/[babyId]/albums`), photos can currently only be deleted — there's no way to move a photo to a different album, pull it back out of an album ("unsorted"), or see basic info about it (when it was added, whether it came from a post/story). The "All Photos" tab has a partial version of this (an "add to album" button) but only for photos with no album yet; once a photo is filed into an album, and on the single-album detail page in general, there's no reassignment path at all — only delete. The user wants an "info" popup on each photo that closes this gap: view info, and change which album (group) a photo belongs to. Per the user, album membership drives visibility ("album takes precedent on the circles") — circles are shown read-only in the popup, reflecting whichever album is selected, not edited per-photo.

## Backend — `src/utils/actions/albums.ts`

Add one new Server Action, placed after `assignPhotoToAlbum` (which already supports moving a photo into any album, including one it's already in another album — reuse as-is):

```ts
// Mirrors assignPhotoToAlbum but sends the photo back to the "unsorted"
// pool — used by the photo info modal's "remove from album" action.
export async function unassignPhotoFromAlbum(photoId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: unassignPhotoFromAlbum.name, photoId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { data: photo, error: fetchError } = await supabase
    .from('album_photos')
    .select('album_id')
    .eq('id', photoId)
    .eq('baby_id', babyId)
    .single()

  if (fetchError) { contextLogger.error(fetchError, "Error fetching photo before unassign"); throw fetchError }

  const position = await nextUnsortedPosition(supabase, babyId)

  const { error } = await supabase
    .from('album_photos')
    .update({ album_id: null, position })
    .eq('id', photoId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error unassigning photo from album"); throw error }

  contextLogger.info("Photo unassigned from album")

  revalidatePath(`/baby/${babyId}/albums`)
  if (photo.album_id) revalidatePath(`/baby/${babyId}/albums/${photo.album_id}`)
}
```

Reuses the existing `nextUnsortedPosition` helper and the same admin-check/logger/revalidate shape as every other mutator in the file. `assignPhotoToAlbum` and `deletePhoto` are reused unchanged.

**`src/app/baby/[babyId]/albums/[albumId]/page.tsx`** currently fetches only `getAlbum` + `getCircles`. Add `getAlbums(babyId)` (already exported, same shape `albums_view.tsx` uses) to the `Promise.all`, and pass the result to `AlbumDetailView` as a new `albums: AlbumSummary[]` prop — the modal needs the full album list to offer as move targets from the detail page.

## New shared component — `src/app/baby/[babyId]/albums/_components/photo_info_modal.tsx`

Client component, modal chrome copied from `assign_to_album_modal.tsx` (`fixed inset-0 bg-black/60 backdrop-blur-xs`, `max-w-[460px] rounded-3xl border border-landing-border animate-in zoom-in-95`).

```ts
export default function PhotoInfoModal({
  babyId,
  photo,
  currentAlbumId,
  currentAlbumName,
  albums,
  circles,
  onClose,
}: {
  babyId: string
  photo: AlbumPhotoWithUrl
  currentAlbumId: string | null
  currentAlbumName: string | null
  albums: AlbumSummary[]
  circles: Tables<'circles'>[]
  onClose: () => void
})
```

`photo` is typed `AlbumPhotoWithUrl` (the common shape both call sites have — `album_detail_view.tsx`'s `album.photos` don't carry `albumId`/`albumName`); callers pass current album context explicitly.

Sections, top to bottom:

1. **Header** — `Info` icon + title, `X` close button (same pattern as other modals).
2. **Preview** — `photo.thumbnailUrl ?? photo.url` in a rounded square, e.g. `w-full max-h-56 object-cover rounded-2xl`.
3. **Metadata** — added date via `format(new Date(photo.created_at), 'PPP', { locale: getDateFnsLocale(useLocale()) })` (exact pattern already used in `share_album_modal.tsx`). If `photo.source_post_id` is set, a `Badge variant="secondary"` "From a post"; if `photo.source_story_id` is set, "From a story" (mutually exclusive per the DB check constraint).
4. **Album picker** — reassignment version of `assign_to_album_modal.tsx`'s pattern:
   - `Select` with items `{ [UNSORTED]: t('unsortedOption'), ...albumItems }`, where `UNSORTED = '__unsorted__'` is a local sentinel (Select needs string values; `album_id: null` isn't one). State `selectedAlbumId` initialized to `currentAlbumId ?? UNSORTED`.
   - "Move" button, disabled when unchanged or pending. On click: `UNSORTED` → `unassignPhotoFromAlbum(photo.id, babyId)`, else → `assignPhotoToAlbum(photo.id, selectedAlbumId, babyId)`.
   - Divider + "create a new album" input + "Create & add" button: `createAlbum(crypto.randomUUID(), babyId, name.trim(), [])` then `assignPhotoToAlbum(newId, babyId)` — same as `assign_to_album_modal.tsx`'s `handleCreateAndAdd`.
   - Both paths: `router.refresh()` then `onClose()` on success (not optimistic — matches every other mutation modal in this codebase).
5. **Circles (read-only)** — recomputed from `selectedAlbumId` live, so it updates as soon as the Select changes, before "Move" is clicked:
   - `UNSORTED` → single `Badge variant="destructive"` "Admins only" (same convention as `adminOnly` elsewhere).
   - Otherwise → `albums.find(a => a.id === selectedAlbumId)?.circleIds` mapped to circle names via `circles`, rendered as `Badge variant="secondary"` each, with the existing `circleFallback` fallback — identical to the `albumCircles` block already in `album_detail_view.tsx`.
6. **Delete** — destructive button at the bottom: `confirm(t('albums.deletePhotoConfirm'))` → `deletePhoto(photo.id, babyId)` → `router.refresh()` → `onClose()`. Reuses the existing top-level `albums.deletePhotoConfirm`/`deletePhotoError` keys.

Cancel (`X`/backdrop) just calls `onClose()`, no side effects.

## Trigger wiring — consolidate to one "Info" icon per tile

Both grids currently show a mix of `FolderPlus`/`Trash2`/`X` icons depending on view and photo state. Replace all of that with a single `Info` icon per tile (admin-only), opening `PhotoInfoModal`; delete moves inside the modal.

**`albums_view.tsx`**:
- Remove `FolderPlus`/`Trash2` icons, `assigningPhotoId`/`deletingPhotoId` state, `handleDeletePhoto`.
- Remove the `AssignToAlbumModal` import/render — its functionality (plus reassignment, which it never had) now lives in `PhotoInfoModal` for every photo, not just unsorted ones. **Delete `assign_to_album_modal.tsx`** as dead code.
- Add `infoPhotoId: string | null` state; `Info` button on every tile when `isAdmin`; render `PhotoInfoModal` resolving the photo via `allPhotos.find(p => p.id === infoPhotoId)`, `currentAlbumId={photo.albumId}`, `currentAlbumName={photo.albumName}`, `albums`/`circles` (already props here).

**`album_detail_view.tsx`**:
- Remove the `X` delete button, `deletingPhotoId`, `handleDeletePhoto`.
- Add `albums: AlbumSummary[]` prop (threaded from the page change above) and `infoPhotoId` state.
- Same `Info` trigger; render `PhotoInfoModal` with `currentAlbumId={album.id}`, `currentAlbumName={album.name}`, `albums`, `circles` (already a prop).

This closes the specific gap the user flagged: the album detail page currently has zero reassignment path.

## i18n — `messages/en.json` and `messages/fr.json`, inside the existing `albums` block

- Add `"photoInfo": "Photo info"` (FR: `"Infos de la photo"`) as the trigger's tooltip; delete `addToAlbum` (no longer referenced).
- Delete the `assignToAlbumForm` block (superseded).
- Add a new `photoInfoForm` block, sibling of `form`/`addPhotosForm`:
  ```json
  "photoInfoForm": {
    "title": "Photo info",
    "addedLabel": "Added",
    "sourcePost": "From a post",
    "sourceStory": "From a story",
    "albumLabel": "Album",
    "unsortedOption": "Unsorted",
    "move": "Move",
    "existingPlaceholder": "Select an album",
    "orDivider": "or",
    "newAlbumLabel": "Create a new album",
    "newAlbumPlaceholder": "e.g. Grandma's visit",
    "createAndAdd": "Create & add",
    "moveError": "Something went wrong while moving the photo.",
    "circlesLabel": "Visible to",
    "circlesNone": "Admins only",
    "deletePhoto": "Delete photo"
  }
  ```
  FR equivalents matching the file's existing tone (`"Ajoutée le"`, `"Non classée"`, `"Déplacer"`, `"Provient d'une publication"`, `"Provient d'une story"`, `"Administrateurs uniquement"`, `"Supprimer la photo"`, etc.).
- Delete/error confirms for the delete action reuse the existing top-level `albums.deletePhotoConfirm`/`deletePhotoError` keys — no duplicates.

## File list

**New:**
- `src/app/baby/[babyId]/albums/_components/photo_info_modal.tsx`

**Edited:**
- `src/utils/actions/albums.ts` (add `unassignPhotoFromAlbum`)
- `src/app/baby/[babyId]/albums/[albumId]/page.tsx` (fetch + pass `albums`)
- `src/app/baby/[babyId]/albums/_components/albums_view.tsx`
- `src/app/baby/[babyId]/albums/[albumId]/_components/album_detail_view.tsx`
- `messages/en.json`, `messages/fr.json`

**Deleted:**
- `src/app/baby/[babyId]/albums/_components/assign_to_album_modal.tsx`

**Note:** does not touch the separate in-progress, uncommitted post/story→Photos-page mirroring work already in the working tree (`source_post_id`/`source_story_id` columns, `linkPostPhotos`, `copyStoryPhotoToLibrary`, pending migration) — only reads those two columns for the source badge.

## Verification

As an admin user:
1. All Photos tab: open Info on an unsorted photo → no source badge, correct added date, circles show "Admins only". Pick an album in the Select → circles update immediately (before clicking Move). Click Move → modal closes, grid refreshes, photo now under that album.
2. Open that album's detail page → Info on the moved photo → picker preselects the current album. Switch to a different existing album, Move → photo leaves this album's grid after refresh, appears in the new one.
3. From an album, Info → switch to "Unsorted" → circles switch to "Admins only" → Move → photo leaves the album, shows up unsorted in All Photos.
4. Info on any photo → type a new album name → "Create & add" → new album created, photo moved into it.
5. Info → Delete → confirm dialog → photo removed after refresh. Test once for a directly-uploaded photo and once for a post-sourced photo (confirms `deletePhoto`'s existing `source_post_id` storage-skip logic is untouched).
6. Create a post with a photo (and/or a story) → confirm its All Photos entry shows "From a post"/"From a story" in Info; a directly-uploaded photo shows neither.
7. As a non-admin with circle access: confirm the Info icon never renders in either view.
8. Regression: album-level actions (edit circles/name, share, delete album, add photos) on the album detail page still work unmodified.

Per CLAUDE.md's planning convention, once implemented and verified this plan file should be saved as `.claude/plans/photo-info-modal.md`, marked `## Status: implemented` with any deviations noted, and moved into `.claude/plans/done/`.
