// Album share-link resolution for the public /share/album/[token] page and
// /api/share/[token]/[photoId].
//
// Deliberately NOT a 'use server' module: these run on the service role and
// return album content to whoever holds a token, so they must only be called
// from those two server entry points, never exposed as callable actions.
import 'server-only'
import { createAdminClient } from '@utils/supabase/admin'
import { logger } from '@utils/logger'
import type { LightboxPhoto } from '@/components/photo_lightbox'

// Everything the public page receives: no baby_id, storage paths, creator or
// source ids ever reach the visitor's HTML.
export type SharedAlbum = { name: string; photos: LightboxPhoto[] }

// Public path: no session check at all — the token itself is the credential.
// Runs on the service role because the visitor is usually logged out (anon)
// or not a member of the album's baby, and RLS denies both. Every read is
// scoped by hand: the share row by token (must be unrevoked and unexpired),
// then only that share's album and its photos.
// Photo URLs point at the token-gated streaming route (not /api/storage,
// which requires a session) so the public page never needs its own baby_id.
// Flat queries rather than a nested `albums (...)` embed — supabase-js's
// typed-select inference can't resolve the embed's cardinality reliably
// here, and a couple of plain queries are simpler to keep correct anyway.
async function getValidShare(token: string) {
  const supabase = createAdminClient()

  const { data: share, error } = await supabase
    .from('album_shares')
    .select('album_id, expires_at, revoked_at')
    .eq('id', token)
    .single()

  if (error || !share) return null
  if (share.revoked_at || new Date(share.expires_at) < new Date()) return null

  return { supabase, albumId: share.album_id }
}

export async function getSharedAlbum(token: string): Promise<SharedAlbum | null> {
  const contextLogger = logger.child({ function: getSharedAlbum.name })

  const valid = await getValidShare(token)
  if (!valid) { contextLogger.warn("Share token not found, expired, or revoked"); return null }
  const { supabase, albumId } = valid

  const { data: album, error } = await supabase
    .from('albums')
    .select('name, album_photos (id, thumbnail_path, mime_type, position)')
    .eq('id', albumId)
    .single()

  if (error || !album) { contextLogger.warn("Share token's album is missing"); return null }

  const sortedPhotos = [...album.album_photos].sort((a, b) => a.position - b.position)

  return {
    name: album.name,
    photos: sortedPhotos.map((photo) => ({
      id: photo.id,
      url: `/api/share/${token}/${photo.id}`,
      thumbnailUrl: photo.thumbnail_path ? `/api/share/${token}/${photo.id}?thumb=1` : null,
      mime_type: photo.mime_type,
    })),
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
