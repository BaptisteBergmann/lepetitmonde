'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { Tables } from '@utils/supabase/database.types'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin } from './access'
import { getUserCircleIds } from './circles'
import { getUserAccess } from './users'
import { ensureBabyBucket, removeStorageObjects, copyStorageObject } from './storage'
import { logger } from '../logger'

export type AlbumPhotoWithUrl = Tables<'album_photos'> & { url: string | null; thumbnailUrl: string | null }
export type AlbumWithDetails = Tables<'albums'> & {
  circleIds: string[]
  photos: AlbumPhotoWithUrl[]
  coverUrl: string | null
}
// Lighter shape for the Albums grid (getAlbums below) — a cover photo + count,
// not every photo row in every album, unlike AlbumWithDetails which backs the
// single-album detail page (getAlbum) where the full photo list is actually
// rendered.
export type AlbumSummary = Tables<'albums'> & {
  circleIds: string[]
  coverUrl: string | null
  photoCount: number
}
export type AlbumPhotoWithAlbum = AlbumPhotoWithUrl & { albumId: string | null; albumName: string | null }

function toStorageUrl(babyId: string, path: string) {
  return `/api/storage/${babyId}/${path.split('/').map(encodeURIComponent).join('/')}`
}

function toAlbumPhotoWithUrl(babyId: string, photo: Tables<'album_photos'>): AlbumPhotoWithUrl {
  return {
    ...photo,
    url: toStorageUrl(babyId, photo.storage_path),
    thumbnailUrl: photo.thumbnail_path ? toStorageUrl(babyId, photo.thumbnail_path) : null,
  }
}

// Takes a client-generated id (like createPost/createAnecdote) so the
// upload dropzone can start uploading to `albums/${id}/...` before the row
// exists — attachAlbumPhotos below assumes that exact path shape.
export async function createAlbum(id: string, babyId: string, name: string, circleIds: string[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: createAlbum.name, babyId })

  await assertIsAdmin(supabase, babyId)
  await ensureBabyBucket(babyId)

  const { data, error } = await supabase
    .from('albums')
    .insert([{ id, baby_id: babyId, name }])
    .select('id')
    .single()

  if (error) { contextLogger.error(error, "Error creating album"); throw error }

  if (circleIds.length > 0) {
    const { error: circlesError } = await supabase
      .from('albums_circles')
      .insert(circleIds.map((circleId) => ({ album_id: data.id, circle_id: circleId })))

    if (circlesError) { contextLogger.error(circlesError, "Error linking album circles"); throw circlesError }
  }

  contextLogger.info({ albumId: data.id }, "Album created")

  revalidatePath(`/baby/${babyId}/albums`)

  return data.id
}

type NewPhotoFile = { filename: string; mimeType: string; thumbnailFilename?: string }

// Shared by attachAlbumPhotos and attachUnsortedPhotos: inserts rows appended
// after whatever's already in that scope (album, or the baby's unsorted
// pile), so re-opening "add photos" never reshuffles/overwrites positions.
async function insertPhotoRows(babyId: string, albumId: string | null, folder: string, files: NewPhotoFile[]) {
  const supabase = await createClient()

  let countQuery = supabase.from('album_photos').select('id', { count: 'exact', head: true })
  countQuery = albumId ? countQuery.eq('album_id', albumId) : countQuery.eq('baby_id', babyId).is('album_id', null)
  const { count, error: countError } = await countQuery

  if (countError) throw countError

  const baseIndex = count ?? 0

  const { error } = await supabase
    .from('album_photos')
    .insert(files.map(({ filename, mimeType, thumbnailFilename }, index) => ({
      album_id: albumId,
      baby_id: babyId,
      storage_path: `${folder}/${filename}`,
      thumbnail_path: thumbnailFilename ? `${folder}/thumbnails/${thumbnailFilename}` : null,
      position: baseIndex + index,
      mime_type: mimeType,
    })))

  if (error) throw error
}

export async function attachAlbumPhotos(albumId: string, babyId: string, files: NewPhotoFile[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: attachAlbumPhotos.name, albumId, babyId })

  await assertIsAdmin(supabase, babyId)

  try {
    await insertPhotoRows(babyId, albumId, `albums/${albumId}`, files)
  } catch (error) {
    contextLogger.error(error, "Error attaching album photos")
    throw error
  }

  contextLogger.info({ count: files.length }, "Album photos attached")

  revalidatePath(`/baby/${babyId}/albums`)
  revalidatePath(`/baby/${babyId}/albums/${albumId}`)
}

// Photos with no album yet ("unsorted") — visible only to admins, same as
// an album with no circles assigned, until assignPhotoToAlbum below gives
// them one (which also makes them subject to that album's circles).
export async function attachUnsortedPhotos(babyId: string, files: NewPhotoFile[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: attachUnsortedPhotos.name, babyId })

  await assertIsAdmin(supabase, babyId)
  await ensureBabyBucket(babyId)

  try {
    await insertPhotoRows(babyId, null, `photos/${babyId}`, files)
  } catch (error) {
    contextLogger.error(error, "Error attaching unsorted photos")
    throw error
  }

  contextLogger.info({ count: files.length }, "Unsorted photos attached")

  revalidatePath(`/baby/${babyId}/albums`)
}

async function nextUnsortedPosition(supabase: Awaited<ReturnType<typeof createClient>>, babyId: string) {
  const { count, error } = await supabase
    .from('album_photos')
    .select('id', { count: 'exact', head: true })
    .eq('baby_id', babyId)
    .is('album_id', null)

  if (error) throw error
  return count ?? 0
}

// Called by posts.ts's attachPostPhotos, right after its own post_photos
// insert succeeds. The mirrored row shares the post's actual
// storage_path/thumbnail_path — no second upload, no duplicated storage —
// landing in the same "unsorted" pool as directly-uploaded photos.
// source_post_id is ON DELETE CASCADE (see the migration), so deleting the
// post removes this row automatically, at the same time its storage goes
// (deletePost already removes that separately).
export async function linkPostPhotos(
  postId: string,
  babyId: string,
  files: { storagePath: string; thumbnailPath: string | null; mimeType: string }[]
) {
  const supabase = await createClient()
  const baseIndex = await nextUnsortedPosition(supabase, babyId)

  const { error } = await supabase
    .from('album_photos')
    .insert(files.map(({ storagePath, thumbnailPath, mimeType }, index) => ({
      album_id: null,
      baby_id: babyId,
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      position: baseIndex + index,
      mime_type: mimeType,
      source_post_id: postId,
    })))

  if (error) throw error
}

// Called by stories.ts's createStory. Makes a real, independent copy of the
// story's media (and thumbnail, if any) into photos/${babyId}/${storyId}/...
// — deliberately NOT a shared reference like linkPostPhotos above — so the
// Photos-page entry survives the story disappearing (expiry via
// pruneExpiredStories in stories.ts, or an explicit delete). source_story_id
// is ON DELETE SET NULL: purely an informational backlink, never a reason
// to remove this row.
export async function copyStoryPhotoToLibrary(
  storyId: string,
  babyId: string,
  file: { storagePath: string; thumbnailPath: string | null; mimeType: string }
) {
  const supabase = await createClient()

  const folder = `photos/${babyId}/${storyId}`
  const mediaFilename = file.storagePath.split('/').pop()!
  const newStoragePath = `${folder}/${mediaFilename}`
  await copyStorageObject(babyId, file.storagePath, newStoragePath)

  let newThumbnailPath: string | null = null
  if (file.thumbnailPath) {
    const thumbnailFilename = file.thumbnailPath.split('/').pop()!
    newThumbnailPath = `${folder}/thumbnails/${thumbnailFilename}`
    await copyStorageObject(babyId, file.thumbnailPath, newThumbnailPath)
  }

  const position = await nextUnsortedPosition(supabase, babyId)

  const { error } = await supabase
    .from('album_photos')
    .insert([{
      album_id: null,
      baby_id: babyId,
      storage_path: newStoragePath,
      thumbnail_path: newThumbnailPath,
      position,
      mime_type: file.mimeType,
      source_story_id: storyId,
    }])

  if (error) throw error
}

// Storage paths keep their `photos/${babyId}/...` prefix even after this —
// only the DB row's album_id changes, no need to move the underlying object.
export async function assignPhotoToAlbum(photoId: string, albumId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: assignPhotoToAlbum.name, photoId, albumId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { count, error: countError } = await supabase
    .from('album_photos')
    .select('id', { count: 'exact', head: true })
    .eq('album_id', albumId)

  if (countError) { contextLogger.error(countError, "Error counting target album photos"); throw countError }

  const { error } = await supabase
    .from('album_photos')
    .update({ album_id: albumId, position: count ?? 0 })
    .eq('id', photoId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error assigning photo to album"); throw error }

  contextLogger.info("Photo assigned to album")

  revalidatePath(`/baby/${babyId}/albums`)
  revalidatePath(`/baby/${babyId}/albums/${albumId}`)
}

export async function updateAlbum(albumId: string, babyId: string, name: string, circleIds: string[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updateAlbum.name, albumId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { error } = await supabase
    .from('albums')
    .update({ name })
    .eq('id', albumId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error updating album"); throw error }

  const { error: deleteCirclesError } = await supabase
    .from('albums_circles')
    .delete()
    .eq('album_id', albumId)

  if (deleteCirclesError) { contextLogger.error(deleteCirclesError, "Error clearing album circles"); throw deleteCirclesError }

  if (circleIds.length > 0) {
    const { error: circlesError } = await supabase
      .from('albums_circles')
      .insert(circleIds.map((circleId) => ({ album_id: albumId, circle_id: circleId })))

    if (circlesError) { contextLogger.error(circlesError, "Error linking album circles"); throw circlesError }
  }

  contextLogger.info("Album updated")

  revalidatePath(`/baby/${babyId}/albums`)
  revalidatePath(`/baby/${babyId}/albums/${albumId}`)
}

// Scoped by babyId rather than albumId, since a photo may not have an album
// (unsorted) — deleting from the All Photos view and from an album detail
// page are the same operation.
export async function deletePhoto(photoId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: deletePhoto.name, photoId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { data: photo, error: fetchError } = await supabase
    .from('album_photos')
    .select('album_id, storage_path, thumbnail_path, source_post_id')
    .eq('id', photoId)
    .eq('baby_id', babyId)
    .single()

  if (fetchError) { contextLogger.error(fetchError, "Error fetching photo before delete"); throw fetchError }

  // A photo linked from a post (source_post_id) shares its storage object
  // with that post's own post_photos row — removing it here would break the
  // still-live post. Only unlink it from the Photos page; the post's delete
  // flow (deletePost) is what actually removes that storage, and cascades
  // this row away at the same time. Story-derived photos own an independent
  // copy (copyStoryPhotoToLibrary) and directly-uploaded ones always did —
  // both are safe to remove normally.
  if (!photo.source_post_id) {
    const paths = photo.thumbnail_path ? [photo.storage_path, photo.thumbnail_path] : [photo.storage_path]
    await removeStorageObjects(babyId, paths)
  }

  const { error } = await supabase
    .from('album_photos')
    .delete()
    .eq('id', photoId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting photo"); throw error }

  contextLogger.info("Photo deleted")

  revalidatePath(`/baby/${babyId}/albums`)
  if (photo.album_id) revalidatePath(`/baby/${babyId}/albums/${photo.album_id}`)
}

export async function deleteAlbum(albumId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: deleteAlbum.name, albumId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { data: photos, error: fetchError } = await supabase
    .from('album_photos')
    .select('storage_path, thumbnail_path, source_post_id')
    .eq('album_id', albumId)

  if (fetchError) { contextLogger.error(fetchError, "Error fetching album photos before delete"); throw fetchError }

  // Same reasoning as deletePhoto above: never remove storage for a photo
  // linked from a post — it's shared with that post's own post_photos row.
  const paths = photos
    .filter((photo) => !photo.source_post_id)
    .flatMap((photo) => (photo.thumbnail_path ? [photo.storage_path, photo.thumbnail_path] : [photo.storage_path]))
  if (paths.length > 0) await removeStorageObjects(babyId, paths)

  const { error } = await supabase
    .from('albums')
    .delete()
    .eq('id', albumId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting album"); throw error }

  contextLogger.info("Album deleted")

  revalidatePath(`/baby/${babyId}/albums`)
}

async function withVisibility(babyId: string) {
  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()

  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'
  const userCircleIds = new Set(user ? await getUserCircleIds(babyId, user.id) : [])

  return { supabase, isAdmin, userCircleIds }
}

function toAlbumWithDetails(babyId: string, row: {
  albums_circles: { circle_id: string }[]
  album_photos: Tables<'album_photos'>[]
  [key: string]: unknown
}): AlbumWithDetails {
  const { albums_circles, album_photos, ...album } = row
  const sortedPhotos = [...album_photos].sort((a, b) => a.position - b.position)
  const photos = sortedPhotos.map((photo) => toAlbumPhotoWithUrl(babyId, photo))

  return {
    ...(album as Tables<'albums'>),
    circleIds: albums_circles.map((ac) => ac.circle_id),
    photos,
    coverUrl: photos[0]?.thumbnailUrl ?? photos[0]?.url ?? null,
  }
}

// Cover + count per album via a small `limit(1)` query per visible album,
// instead of embedding every album_photos row (all columns, every photo) in
// the main query just to read photos[0] and photos.length off it — that
// scaled with total photo count across every album, not with album count.
// `count: 'exact'` reports the album's true row count independent of the
// `limit(1)`, same pattern already used elsewhere in this file (e.g.
// insertPhotoRows/assignPhotoToAlbum below).
async function getAlbumCover(supabase: Awaited<ReturnType<typeof createClient>>, babyId: string, albumId: string) {
  const { data, count, error } = await supabase
    .from('album_photos')
    .select('storage_path, thumbnail_path', { count: 'exact' })
    .eq('album_id', albumId)
    .order('position', { ascending: true })
    .limit(1)

  if (error) throw error

  const cover = data[0]
  const coverUrl = cover ? (cover.thumbnail_path ? toStorageUrl(babyId, cover.thumbnail_path) : toStorageUrl(babyId, cover.storage_path)) : null

  return { coverUrl, photoCount: count ?? 0 }
}

export async function getAlbums(babyId: string): Promise<AlbumSummary[]> {
  const contextLogger = logger.child({ function: getAlbums.name, babyId })
  const { supabase, isAdmin, userCircleIds } = await withVisibility(babyId)

  const { data, error } = await supabase
    .from('albums')
    .select('*, albums_circles (circle_id)')
    .eq('baby_id', babyId)
    .order('created_at', { ascending: false })

  if (error) { contextLogger.error(error, "Error fetching albums"); return [] }

  const visible = data
    .filter((row) => isAdmin || row.albums_circles.some((ac: { circle_id: string }) => userCircleIds.has(ac.circle_id)))

  const withCovers = await Promise.all(visible.map(async (row) => {
    const { albums_circles, ...album } = row
    const { coverUrl, photoCount } = await getAlbumCover(supabase, babyId, row.id)

    return {
      ...(album as Tables<'albums'>),
      circleIds: albums_circles.map((ac: { circle_id: string }) => ac.circle_id),
      coverUrl,
      photoCount,
    }
  }))

  contextLogger.debug({ count: withCovers.length }, "Albums received")

  return withCovers
}

// Queries album_photos directly (rather than flattening getAlbums) so
// unsorted photos (album_id null) are included too — those are admin-only,
// same as the "no circle assigned" rule for a photo's actual album.
export async function getAllAlbumPhotos(babyId: string): Promise<AlbumPhotoWithAlbum[]> {
  const contextLogger = logger.child({ function: getAllAlbumPhotos.name, babyId })
  const { supabase, isAdmin, userCircleIds } = await withVisibility(babyId)

  const { data, error } = await supabase
    .from('album_photos')
    .select('*, albums (id, name, albums_circles (circle_id))')
    .eq('baby_id', babyId)
    .order('created_at', { ascending: false })

  if (error) { contextLogger.error(error, "Error fetching all album photos"); return [] }

  const visible = data.filter((row) => {
    if (!row.albums) return isAdmin
    return isAdmin || row.albums.albums_circles.some((ac: { circle_id: string }) => userCircleIds.has(ac.circle_id))
  })

  const photos = visible.map((row) => {
    const { albums, ...photo } = row
    return {
      ...toAlbumPhotoWithUrl(babyId, photo),
      albumId: albums?.id ?? null,
      albumName: albums?.name ?? null,
    }
  })

  contextLogger.debug({ count: photos.length }, "All album photos received")

  return photos
}

export async function getAlbum(albumId: string, babyId: string): Promise<AlbumWithDetails | null> {
  const contextLogger = logger.child({ function: getAlbum.name, albumId, babyId })
  const { supabase, isAdmin, userCircleIds } = await withVisibility(babyId)

  const { data, error } = await supabase
    .from('albums')
    .select('*, albums_circles (circle_id), album_photos (*)')
    .eq('id', albumId)
    .eq('baby_id', babyId)
    .single()

  if (error || !data) { contextLogger.warn("Album not found"); return null }

  const visible = isAdmin || data.albums_circles.some((ac: { circle_id: string }) => userCircleIds.has(ac.circle_id))
  if (!visible) { contextLogger.warn("Album not visible to caller"); return null }

  return toAlbumWithDetails(babyId, data)
}

export async function createAlbumShare(albumId: string, babyId: string, hoursValid: number) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: createAlbumShare.name, albumId, babyId })

  await assertIsAdmin(supabase, babyId)

  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + hoursValid)

  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('album_shares')
    .insert([{ album_id: albumId, created_by: user?.id ?? null, expires_at: expiresAt.toISOString() }])
    .select('id')
    .single()

  if (error) { contextLogger.error(error, "Error creating album share"); throw error }

  contextLogger.info({ shareId: data.id }, "Album share created")

  revalidatePath(`/baby/${babyId}/albums/${albumId}`)

  return `${process.env.SITE_URL}/share/album/${data.id}`
}

export async function getAlbumShares(albumId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: getAlbumShares.name, albumId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { data, error } = await supabase
    .from('album_shares')
    .select('*')
    .eq('album_id', albumId)
    .order('created_at', { ascending: false })

  if (error) { contextLogger.error(error, "Error fetching album shares"); return [] }

  return data
}

export async function revokeAlbumShare(shareId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: revokeAlbumShare.name, shareId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { data: share, error: fetchError } = await supabase
    .from('album_shares')
    .select('album_id')
    .eq('id', shareId)
    .single()

  if (fetchError) { contextLogger.error(fetchError, "Error fetching share before revoke"); throw fetchError }

  const { error } = await supabase
    .from('album_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId)

  if (error) { contextLogger.error(error, "Error revoking album share"); throw error }

  contextLogger.info("Album share revoked")

  revalidatePath(`/baby/${babyId}/albums/${share.album_id}`)
}

// Public path: no auth check at all — the token itself is the credential,
// exactly like `invitations` being readable by `anon` (see .claude/plans/rls.md
// §2.2) — a plain client works today since no table has RLS enabled yet.
// Photo URLs point at the token-gated streaming route (not /api/storage,
// which requires a session) so the public page never needs its own baby_id.
// Flat queries rather than a nested `albums (...)` embed — supabase-js's
// typed-select inference can't resolve the embed's cardinality reliably
// here, and a couple of plain queries are simpler to keep correct anyway.
async function getValidShare(token: string) {
  const supabase = await createClient()

  const { data: share, error } = await supabase
    .from('album_shares')
    .select('album_id, expires_at, revoked_at')
    .eq('id', token)
    .single()

  if (error || !share) return null
  if (share.revoked_at || new Date(share.expires_at) < new Date()) return null

  return { supabase, albumId: share.album_id }
}

export async function getSharedAlbum(token: string): Promise<AlbumWithDetails | null> {
  const contextLogger = logger.child({ function: getSharedAlbum.name })

  const valid = await getValidShare(token)
  if (!valid) { contextLogger.warn("Share token not found, expired, or revoked"); return null }
  const { supabase, albumId } = valid

  const { data: album, error } = await supabase
    .from('albums')
    .select('*, album_photos (*)')
    .eq('id', albumId)
    .single()

  if (error || !album) { contextLogger.warn("Share token's album is missing"); return null }

  const { album_photos, ...rest } = album
  const sortedPhotos = [...album_photos].sort((a, b) => a.position - b.position)

  return {
    ...rest,
    circleIds: [],
    photos: sortedPhotos.map((photo) => ({
      ...photo,
      url: `/api/share/${token}/${photo.id}`,
      thumbnailUrl: photo.thumbnail_path ? `/api/share/${token}/${photo.id}?thumb=1` : null,
    })),
    coverUrl: null,
  }
}

// Re-validates the token exactly like getSharedAlbum, then confirms photoId
// actually belongs to that share's album — a valid token for album A must
// not double as a way to fetch photo ids guessed/leaked from album B.
// `wantsThumbnail` serves the smaller thumbnail_path when the caller asked
// for it and one exists, falling back to the full-size storage_path
// otherwise (older photos, or thumbnail generation failed client-side).
export async function resolveSharedPhoto(token: string, photoId: string, wantsThumbnail: boolean) {
  const contextLogger = logger.child({ function: resolveSharedPhoto.name, photoId })

  const valid = await getValidShare(token)
  if (!valid) { contextLogger.warn("Share token not found, expired, or revoked"); return null }
  const { supabase, albumId } = valid

  const { data: album, error: albumError } = await supabase
    .from('albums')
    .select('baby_id')
    .eq('id', albumId)
    .single()

  if (albumError || !album) return null

  const { data: photo, error: photoError } = await supabase
    .from('album_photos')
    .select('storage_path, thumbnail_path')
    .eq('id', photoId)
    .eq('album_id', albumId)
    .single()

  if (photoError || !photo) { contextLogger.warn("Photo not part of shared album"); return null }

  const storagePath = (wantsThumbnail && photo.thumbnail_path) ? photo.thumbnail_path : photo.storage_path

  return { babyId: album.baby_id, storagePath }
}
