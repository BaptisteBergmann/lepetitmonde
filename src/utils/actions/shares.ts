'use server'

import { createClient } from '@utils/supabase/server'
import { createAdminClient } from '@utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin } from './access'
import { assertAlbumInBaby } from '@utils/albums-internal'
import { normalizeText } from '@utils/feed-validation'
import { SHARE_DURATIONS_HOURS, SHARE_LIMITS } from '@utils/album-limits'
import { generateShareToken, hashShareToken } from '@utils/share-token'
import { logger } from '../logger'
import { actionError } from './errors'

export type ShareSummary = {
  id: string
  kind: 'album' | 'photos'
  label: string | null
  albumId: string | null
  albumName: string | null
  photoCount: number | null
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  accessCount: number
  lastAccessedAt: string | null
}

export type ShareAccess = { accessed_at: string; ip: string | null; user_agent: string | null }

type CreateShareInput = {
  babyId: string
  kind: 'album' | 'photos'
  albumId?: string
  photoIds?: string[]
  hoursValid: number
  label?: string | null
}

// Returns the full URL, which is the only time the token exists in clear:
// only its hash is stored. Never log the token; log shareId only.
export async function createShare(input: CreateShareInput) {
  const { babyId, kind, albumId, hoursValid } = input
  const supabase = await createClient()
  const contextLogger = logger.child({ function: createShare.name, babyId, kind })

  await assertIsAdmin(supabase, babyId)

  if (kind !== 'album' && kind !== 'photos') throw await actionError('unauthorized')
  if (!(Object.values(SHARE_DURATIONS_HOURS) as number[]).includes(hoursValid)) throw await actionError('invalidShareDuration')
  const label = await normalizeText(input.label, SHARE_LIMITS.label)

  let photoIds: string[] = []
  if (kind === 'album') {
    if (typeof albumId !== 'string') throw await actionError('unauthorized')
    await assertAlbumInBaby(albumId, babyId)
  } else {
    if (!Array.isArray(input.photoIds) || input.photoIds.some((id) => typeof id !== 'string')) throw await actionError('invalidSharePhotos')
    photoIds = [...new Set(input.photoIds)]
    if (photoIds.length === 0) throw await actionError('invalidSharePhotos')
    if (photoIds.length > SHARE_LIMITS.photosPerShare) throw await actionError('tooManySharePhotos')

    const { data: found, error: photosError } = await supabase
      .from('album_photos')
      .select('id')
      .in('id', photoIds)
      .eq('baby_id', babyId)
    if (photosError) { contextLogger.error(photosError, "Error checking photos to share"); throw photosError }
    if (found.length !== photoIds.length) throw await actionError('invalidSharePhotos')
  }

  const expiresAt = new Date(Date.now() + hoursValid * 3600 * 1000)
  const { data: { user } } = await supabase.auth.getUser()
  const token = generateShareToken()

  const { data, error } = await supabase
    .from('album_shares')
    .insert([{
      baby_id: babyId,
      kind,
      album_id: kind === 'album' ? albumId : null,
      token_hash: hashShareToken(token),
      label,
      created_by: user?.id ?? null,
      expires_at: expiresAt.toISOString(),
    }])
    .select('id')
    .single()

  if (error) { contextLogger.error(error, "Error creating share"); throw error }

  if (kind === 'photos') {
    const { error: linkError } = await supabase
      .from('album_share_photos')
      .insert(photoIds.map((photoId, position) => ({ share_id: data.id, photo_id: photoId, position })))
    if (linkError) {
      contextLogger.error(linkError, "Error attaching photos to share")
      // Don't leave a live, empty share behind.
      await supabase.from('album_shares').delete().eq('id', data.id).eq('baby_id', babyId)
      throw linkError
    }
  }

  contextLogger.info({ shareId: data.id }, "Share created")

  revalidatePath(`/baby/${babyId}/albums`, 'layout')

  return `${process.env.SITE_URL}/share/${token}`
}

export async function getBabyShares(babyId: string, options: { albumId?: string } = {}): Promise<ShareSummary[]> {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: getBabyShares.name, babyId })

  await assertIsAdmin(supabase, babyId)

  const endedCutoff = new Date(Date.now() - SHARE_LIMITS.endedListDays * 86400 * 1000).toISOString()

  let query = supabase
    .from('album_shares')
    .select('id, kind, label, album_id, created_at, expires_at, revoked_at, albums (name), album_share_photos (count), album_share_accesses (count)')
    .eq('baby_id', babyId)
    .gt('expires_at', endedCutoff)
    .order('created_at', { ascending: false })
  if (options.albumId) query = query.eq('album_id', options.albumId)

  const { data, error } = await query
  if (error) { contextLogger.error(error, "Error fetching shares"); throw error }

  const ids = data.map((s) => s.id)
  const lastAccess = new Map<string, string>()
  if (ids.length > 0) {
    // PostgREST aggregates (max) may be disabled; newest-first rows with a
    // first-wins map give the same answer.
    const { data: rows, error: accessError } = await supabase
      .from('album_share_accesses')
      .select('share_id, accessed_at')
      .in('share_id', ids)
      .order('accessed_at', { ascending: false })
      .limit(1000)
    if (accessError) contextLogger.error(accessError, "Error fetching last accesses")
    for (const row of rows ?? []) if (!lastAccess.has(row.share_id)) lastAccess.set(row.share_id, row.accessed_at)
  }

  // Housekeeping, off the request path (same idea as pruneExpiredStories).
  pruneShareAccesses(ids).catch((err) => contextLogger.error(err, "Error pruning share accesses"))

  return data.map((s) => ({
    id: s.id,
    kind: s.kind === 'photos' ? 'photos' : 'album',
    label: s.label,
    albumId: s.album_id,
    albumName: (Array.isArray(s.albums) ? s.albums[0]?.name : (s.albums as { name: string } | null)?.name) ?? null,
    photoCount: s.kind === 'photos' ? (s.album_share_photos[0]?.count ?? 0) : null,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
    revokedAt: s.revoked_at,
    accessCount: s.album_share_accesses[0]?.count ?? 0,
    lastAccessedAt: lastAccess.get(s.id) ?? null,
  }))
}

// Service role: the visit log has no DELETE policy for users. Scoped by hand
// to share ids that getBabyShares just read for this baby as an admin.
async function pruneShareAccesses(shareIds: string[]) {
  if (shareIds.length === 0) return
  const cutoff = new Date(Date.now() - SHARE_LIMITS.accessRetentionDays * 86400 * 1000).toISOString()
  const { error } = await createAdminClient()
    .from('album_share_accesses')
    .delete()
    .in('share_id', shareIds)
    .lt('accessed_at', cutoff)
  if (error) throw error
}

async function assertShareInBaby(supabase: Awaited<ReturnType<typeof createClient>>, shareId: string, babyId: string) {
  const { data: share, error } = await supabase
    .from('album_shares')
    .select('id')
    .eq('id', shareId)
    .eq('baby_id', babyId)
    .maybeSingle()
  if (error) throw error
  if (!share) throw await actionError('unauthorized')
}

export async function getShareAccesses(shareId: string, babyId: string): Promise<ShareAccess[]> {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: getShareAccesses.name, babyId, shareId })

  await assertIsAdmin(supabase, babyId)
  await assertShareInBaby(supabase, shareId, babyId)

  const { data, error } = await supabase
    .from('album_share_accesses')
    .select('accessed_at, ip, user_agent')
    .eq('share_id', shareId)
    .order('accessed_at', { ascending: false })
    .limit(SHARE_LIMITS.accessLogRows)

  if (error) { contextLogger.error(error, "Error fetching share accesses"); throw error }

  return data.map((row) => ({ accessed_at: row.accessed_at, ip: row.ip == null ? null : String(row.ip), user_agent: row.user_agent }))
}

export async function revokeShare(shareId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: revokeShare.name, babyId, shareId })

  await assertIsAdmin(supabase, babyId)
  await assertShareInBaby(supabase, shareId, babyId)

  const { error } = await supabase
    .from('album_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error revoking share"); throw error }

  contextLogger.info("Share revoked")

  revalidatePath(`/baby/${babyId}/albums`, 'layout')
}
