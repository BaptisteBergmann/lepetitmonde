// Share-link resolution for the public /share/[token] page and
// /api/share/[token]/[photoId].
//
// Deliberately NOT a 'use server' module: these run on the service role and
// return album content to whoever holds a token, so they must only be called
// from those two server entry points, never exposed as callable actions.
import 'server-only'
import { createAdminClient } from '@utils/supabase/admin'
import { logger } from '@utils/logger'
import { getClientIp } from '@utils/client-ip'
import { hashShareToken, isPlausibleShareToken } from '@utils/share-token'
import type { LightboxPhoto } from '@/components/photo_lightbox'

// Everything the public page receives: no baby_id, storage paths, creator or
// source ids ever reach the visitor's HTML.
// `name` is the album's name, or null for a photo selection (the page picks a generic title).
export type SharedPhotos = { shareId: string; kind: 'album' | 'photos'; name: string | null; photos: LightboxPhoto[] }

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
  if (!isPlausibleShareToken(token)) return null
  const supabase = createAdminClient()

  const { data: share, error } = await supabase
    .from('album_shares')
    .select('id, kind, baby_id, album_id, expires_at, revoked_at')
    .eq('token_hash', hashShareToken(token))
    .maybeSingle()

  if (error || !share) return null
  if (share.revoked_at || new Date(share.expires_at) < new Date()) return null

  // baby_id can still be null on rows inserted by older code between the
  // migration and the NOT NULL follow-up; the album knows it.
  return { supabase, shareId: share.id, kind: share.kind, babyId: share.baby_id, albumId: share.album_id }
}

function toLightboxPhoto(token: string, photo: { id: string; thumbnail_path: string | null; mime_type: string | null }): LightboxPhoto {
  return {
    id: photo.id,
    url: `/api/share/${token}/${photo.id}`,
    thumbnailUrl: photo.thumbnail_path ? `/api/share/${token}/${photo.id}?thumb=1` : null,
    mime_type: photo.mime_type,
  }
}

// Handles both kinds: 'album' (live: photos added later appear) and 'photos'
// (a fixed selection from album_share_photos).
export async function getSharedPhotos(token: string): Promise<SharedPhotos | null> {
  const contextLogger = logger.child({ function: getSharedPhotos.name })

  const valid = await getValidShare(token)
  if (!valid) { contextLogger.warn("Share token not found, expired, or revoked"); return null }
  const { supabase, shareId, kind, babyId, albumId } = valid

  if (kind === 'photos') {
    if (!babyId) return null

    const { data: links, error: linksError } = await supabase
      .from('album_share_photos')
      .select('photo_id, position')
      .eq('share_id', shareId)
      .order('position', { ascending: true })

    if (linksError) { contextLogger.error(linksError, "Error reading shared selection"); return null }

    const ids = links.map((l) => l.photo_id)
    if (ids.length === 0) return { shareId, kind, name: null, photos: [] }

    const { data: photos, error } = await supabase
      .from('album_photos')
      .select('id, thumbnail_path, mime_type')
      .in('id', ids)
      .eq('baby_id', babyId)

    if (error) { contextLogger.error(error, "Error reading shared photos"); return null }

    const byId = new Map(photos.map((p) => [p.id, p]))
    return {
      shareId,
      kind,
      name: null,
      photos: ids.flatMap((id) => {
        const photo = byId.get(id)
        return photo ? [toLightboxPhoto(token, photo)] : []
      }),
    }
  }

  if (!albumId) return null

  const { data: album, error } = await supabase
    .from('albums')
    .select('name, album_photos (id, thumbnail_path, mime_type, position)')
    .eq('id', albumId)
    .single()

  if (error || !album) { contextLogger.warn("Share token's album is missing"); return null }

  const sortedPhotos = [...album.album_photos].sort((a, b) => a.position - b.position)

  return { shareId, kind, name: album.name, photos: sortedPhotos.map((photo) => toLightboxPhoto(token, photo)) }
}

// Re-validates the token exactly like getSharedPhotos, then confirms photoId
// actually belongs to that share (the album for kind 'album', a row in
// album_share_photos for kind 'photos'): a valid token must not double as a
// way to fetch photo ids guessed/leaked from elsewhere. "Bad token" and "not
// in share" return the same null.
// `wantsThumbnail` serves the smaller thumbnail_path when the caller asked
// for it and one exists, falling back to the full-size storage_path
// otherwise (older photos, or thumbnail generation failed client-side).
export async function resolveSharedPhoto(token: string, photoId: string, wantsThumbnail: boolean) {
  const contextLogger = logger.child({ function: resolveSharedPhoto.name, photoId })

  const valid = await getValidShare(token)
  if (!valid) { contextLogger.warn("Share token not found, expired, or revoked"); return null }
  const { supabase, shareId, kind, albumId } = valid
  let { babyId } = valid

  if (kind === 'photos') {
    if (!babyId) return null
    const { data: link } = await supabase
      .from('album_share_photos')
      .select('photo_id')
      .eq('share_id', shareId)
      .eq('photo_id', photoId)
      .maybeSingle()
    if (!link) { contextLogger.warn("Photo not part of shared selection"); return null }
  } else {
    if (!albumId) return null
    const { data: album, error: albumError } = await supabase
      .from('albums')
      .select('baby_id')
      .eq('id', albumId)
      .single()
    if (albumError || !album) return null
    babyId = album.baby_id
  }

  let query = supabase
    .from('album_photos')
    .select('storage_path, thumbnail_path')
    .eq('id', photoId)
    .eq('baby_id', babyId)
  if (kind === 'album' && albumId) query = query.eq('album_id', albumId)
  const { data: photo, error: photoError } = await query.single()

  if (photoError || !photo) { contextLogger.warn("Photo not part of share"); return null }

  const storagePath = (wantsThumbnail && photo.thumbnail_path) ? photo.thumbnail_path : photo.storage_path

  return { babyId, storagePath }
}

const ACCESS_DEDUP_SECONDS = 60
const USER_AGENT_MAX = 512

// Logs one row per page open. Never throws: the visitor must see the page even
// if logging fails. A refresh within 60s from the same (ip, user agent) is not
// logged again, which caps how fast a token holder can fill the table.
export async function recordShareAccess(shareId: string, requestHeaders: Headers) {
  const contextLogger = logger.child({ function: recordShareAccess.name, shareId })
  try {
    const supabase = createAdminClient()
    const ip = getClientIp(requestHeaders)
    const userAgent = requestHeaders.get('user-agent')?.slice(0, USER_AGENT_MAX) ?? null

    const since = new Date(Date.now() - ACCESS_DEDUP_SECONDS * 1000).toISOString()
    let recent = supabase
      .from('album_share_accesses')
      .select('id')
      .eq('share_id', shareId)
      .gte('accessed_at', since)
    recent = ip ? recent.eq('ip', ip) : recent.is('ip', null)
    recent = userAgent ? recent.eq('user_agent', userAgent) : recent.is('user_agent', null)
    const { data: existing, error: lookupError } = await recent.limit(1)
    if (lookupError) contextLogger.error(lookupError, "Error checking recent share accesses")
    else if (existing && existing.length > 0) return

    const { error } = await supabase
      .from('album_share_accesses')
      .insert({ share_id: shareId, ip, user_agent: userAgent })
    if (error) contextLogger.error(error, "Error recording share access")
  } catch (err) {
    contextLogger.error(err, "Error recording share access")
  }
}
