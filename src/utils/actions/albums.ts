'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { Tables } from '@utils/supabase/database.types'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin } from './access'
import { getUserCircleIds } from './circles'
import { getUserAccess } from './users'
import { ensureBabyBucket, removeStorageObjects } from './storage'
import { logger } from '../logger'

export type AlbumPhotoWithUrl = Tables<'album_photos'> & { url: string | null; thumbnailUrl: string | null }
export type AlbumWithDetails = Tables<'albums'> & {
  circleIds: string[]
  photos: AlbumPhotoWithUrl[]
  coverUrl: string | null
}
export type AlbumPhotoWithAlbum = AlbumPhotoWithUrl & { albumId: string; albumName: string }

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

export async function attachAlbumPhotos(
  albumId: string,
  babyId: string,
  files: { filename: string; mimeType: string; thumbnailFilename?: string }[]
) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: attachAlbumPhotos.name, albumId, babyId })

  await assertIsAdmin(supabase, babyId)

  // New photos are appended after whatever's already in the album (rather
  // than always starting at 0), so re-opening "add photos" on an existing
  // album doesn't reshuffle/overwrite existing positions.
  const { count, error: countError } = await supabase
    .from('album_photos')
    .select('id', { count: 'exact', head: true })
    .eq('album_id', albumId)

  if (countError) { contextLogger.error(countError, "Error counting existing album photos"); throw countError }

  const baseIndex = count ?? 0

  const { error } = await supabase
    .from('album_photos')
    .insert(files.map(({ filename, mimeType, thumbnailFilename }, index) => ({
      album_id: albumId,
      storage_path: `albums/${albumId}/${filename}`,
      thumbnail_path: thumbnailFilename ? `albums/${albumId}/thumbnails/${thumbnailFilename}` : null,
      position: baseIndex + index,
      mime_type: mimeType,
    })))

  if (error) { contextLogger.error(error, "Error attaching album photos"); throw error }

  contextLogger.info({ count: files.length }, "Album photos attached")

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

export async function deletePhoto(photoId: string, albumId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: deletePhoto.name, photoId, albumId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { data: photo, error: fetchError } = await supabase
    .from('album_photos')
    .select('storage_path, thumbnail_path')
    .eq('id', photoId)
    .eq('album_id', albumId)
    .single()

  if (fetchError) { contextLogger.error(fetchError, "Error fetching photo before delete"); throw fetchError }

  const paths = photo.thumbnail_path ? [photo.storage_path, photo.thumbnail_path] : [photo.storage_path]
  await removeStorageObjects(babyId, paths)

  const { error } = await supabase
    .from('album_photos')
    .delete()
    .eq('id', photoId)
    .eq('album_id', albumId)

  if (error) { contextLogger.error(error, "Error deleting photo"); throw error }

  contextLogger.info("Photo deleted")

  revalidatePath(`/baby/${babyId}/albums`)
  revalidatePath(`/baby/${babyId}/albums/${albumId}`)
}

export async function deleteAlbum(albumId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: deleteAlbum.name, albumId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { data: photos, error: fetchError } = await supabase
    .from('album_photos')
    .select('storage_path, thumbnail_path')
    .eq('album_id', albumId)

  if (fetchError) { contextLogger.error(fetchError, "Error fetching album photos before delete"); throw fetchError }

  const paths = photos.flatMap((photo) =>
    photo.thumbnail_path ? [photo.storage_path, photo.thumbnail_path] : [photo.storage_path]
  )
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

export async function getAlbums(babyId: string): Promise<AlbumWithDetails[]> {
  const contextLogger = logger.child({ function: getAlbums.name, babyId })
  const { supabase, isAdmin, userCircleIds } = await withVisibility(babyId)

  const { data, error } = await supabase
    .from('albums')
    .select('*, albums_circles (circle_id), album_photos (*)')
    .eq('baby_id', babyId)
    .order('created_at', { ascending: false })

  if (error) { contextLogger.error(error, "Error fetching albums"); return [] }

  const visible = data
    .filter((row) => isAdmin || row.albums_circles.some((ac: { circle_id: string }) => userCircleIds.has(ac.circle_id)))
    .map((row) => toAlbumWithDetails(babyId, row))

  contextLogger.debug({ count: visible.length }, "Albums received")

  return visible
}

export async function getAllAlbumPhotos(babyId: string): Promise<AlbumPhotoWithAlbum[]> {
  const contextLogger = logger.child({ function: getAllAlbumPhotos.name, babyId })
  const albums = await getAlbums(babyId)

  const photos = albums.flatMap((album) =>
    album.photos.map((photo) => ({ ...photo, albumId: album.id, albumName: album.name }))
  )
  photos.sort((a, b) => b.created_at.localeCompare(a.created_at))

  contextLogger.debug({ count: photos.length }, "Flattened album photos received")

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
