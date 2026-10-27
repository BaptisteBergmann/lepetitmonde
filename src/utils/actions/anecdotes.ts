'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { Tables } from '@utils/supabase/database.types'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin } from './access'
import { removeStorageObjects } from './storage'
import { logger } from '../logger'
import { ActionError, actionError } from './errors'
import { ALLOWED_IMAGE_CONTENT_TYPES } from '@utils/upload-content-types'
import { normalizeText } from '@utils/feed-validation'
import { INPUT_LIMITS } from '@utils/input-limits'
import { hasUnsafePathSegment } from '@utils/storage-path'
import { assertCirclesInBaby } from '@utils/feed-access'
import { createAnecdoteCore, listAnecdotesCore } from '@utils/anecdotes-core'

export type AnecdoteWithDetails = Tables<'anecdotes'> & {
  circleIds: string[]
  photoUrl: string | null
  photoThumbnailUrl: string | null
}

type NewAnecdote = {
  id: string
  baby_id: string
  content: string
  happened_at: string
}

function toAnecdoteUrl(babyId: string, path: string) {
  return `/api/storage/${babyId}/${path.split('/').map(encodeURIComponent).join('/')}`
}

// Thin session wrapper: the logic lives in anecdotes-core.ts so the MCP
// endpoint applies the same rules. enforcePage: false keeps the web action's
// access rules exactly as they were (the page does the page check).
export async function createAnecdote(anecdote: NewAnecdote, circleIds: string[]) {
  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  return createAnecdoteCore(await createClient(), user.id, anecdote.baby_id, {
    id: anecdote.id,
    content: anecdote.content,
    happenedAt: anecdote.happened_at,
  }, circleIds, { enforcePage: false })
}

export async function attachAnecdotePhoto(
  anecdoteId: string,
  babyId: string,
  { filename, mimeType }: { filename: string; mimeType: string }
) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: attachAnecdotePhoto.name, anecdoteId, babyId })

  await assertIsAdmin(supabase, babyId)

  // Filenames come back from /api/upload as a single path segment; anything
  // else would let the row point outside this anecdote's folder.
  if (hasUnsafePathSegment([filename])) {
    contextLogger.warn("Rejected unsafe filename")
    throw await actionError('invalidFilename')
  }
  if (!ALLOWED_IMAGE_CONTENT_TYPES.has(mimeType)) throw await actionError('invalidFileType')

  const { error } = await supabase
    .from('anecdotes')
    .update({
      photo_path: `anecdotes/${anecdoteId}/${filename}`,
      photo_mime_type: mimeType,
    })
    .eq('id', anecdoteId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error attaching anecdote photo"); throw error }

  contextLogger.info("Anecdote photo attached")

  revalidatePath(`/baby/${babyId}/anecdotes`)
}

export async function updateAnecdote(
  anecdoteId: string,
  babyId: string,
  update: { content: string; happened_at: string },
  circleIds: string[]
) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updateAnecdote.name, anecdoteId, babyId })

  await assertIsAdmin(supabase, babyId)

  if (!Array.isArray(circleIds) || !circleIds.every((id) => typeof id === 'string')) {
    contextLogger.warn("Rejected malformed circleIds")
    throw await actionError('unauthorized')
  }
  await assertCirclesInBaby(circleIds, babyId)

  const content = await normalizeText(update?.content, INPUT_LIMITS.anecdoteContent, { requiredKey: 'textRequired' })

  const { data: updated, error } = await supabase
    .from('anecdotes')
    .update({
      content,
      happened_at: update.happened_at,
    })
    .eq('id', anecdoteId)
    .eq('baby_id', babyId)
    .select('id')
    .maybeSingle()

  if (error) { contextLogger.error(error, "Error updating anecdote"); throw error }

  // anecdotes_circles is keyed by anecdoteId alone: only touch it once the
  // anecdote is confirmed to belong to this baby.
  if (!updated) {
    contextLogger.warn("Anecdote not found in baby")
    throw await actionError('unauthorized')
  }

  const { error: deleteCirclesError } = await supabase
    .from('anecdotes_circles')
    .delete()
    .eq('anecdote_id', anecdoteId)

  if (deleteCirclesError) { contextLogger.error(deleteCirclesError, "Error clearing anecdote circles"); throw deleteCirclesError }

  if (circleIds.length > 0) {
    const { error: circlesError } = await supabase
      .from('anecdotes_circles')
      .insert(circleIds.map((circleId) => ({ anecdote_id: anecdoteId, circle_id: circleId })))

    if (circlesError) { contextLogger.error(circlesError, "Error linking anecdote circles"); throw circlesError }
  }

  contextLogger.info("Anecdote updated")

  revalidatePath(`/baby/${babyId}/anecdotes`)
}

function toAnecdoteWithDetails(row: {
  baby_id: string
  anecdotes_circles: { circle_id: string }[]
  photo_path: string | null
  photo_thumbnail_path: string | null
  [key: string]: unknown
}): AnecdoteWithDetails {
  const { anecdotes_circles, ...anecdote } = row

  return {
    ...(anecdote as Tables<'anecdotes'>),
    circleIds: anecdotes_circles.map((ac) => ac.circle_id),
    photoUrl: row.photo_path ? toAnecdoteUrl(row.baby_id, row.photo_path) : null,
    photoThumbnailUrl: row.photo_thumbnail_path ? toAnecdoteUrl(row.baby_id, row.photo_thumbnail_path) : null,
  }
}

export async function getAnecdotes(
  babyId: string,
  { limit, before }: { limit: number; before?: { happenedAt: string; createdAt: string } }
): Promise<AnecdoteWithDetails[]> {
  const { data: { user } } = await getAuthUser()
  if (!user) return []

  try {
    const rows = await listAnecdotesCore(await createClient(), user.id, babyId, { limit, before }, { enforcePage: false })
    return rows.map(({ circleIds, ...row }) => toAnecdoteWithDetails({
      ...row,
      anecdotes_circles: circleIds.map((circle_id) => ({ circle_id })),
    }))
  } catch (err) {
    // Same as before: a query failure gave an empty list.
    if (err instanceof ActionError) throw err
    logger.child({ function: getAnecdotes.name, babyId }).error(err, "Error fetching anecdotes")
    return []
  }
}

export async function deleteAnecdote(anecdoteId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: deleteAnecdote.name, anecdoteId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { data: anecdote, error: fetchError } = await supabase
    .from('anecdotes')
    .select('photo_path, photo_thumbnail_path')
    .eq('id', anecdoteId)
    .eq('baby_id', babyId)
    .single()

  if (fetchError) { contextLogger.error(fetchError, "Error fetching anecdote before delete"); throw fetchError }

  if (anecdote.photo_path) {
    const paths = anecdote.photo_thumbnail_path
      ? [anecdote.photo_path, anecdote.photo_thumbnail_path]
      : [anecdote.photo_path]
    await removeStorageObjects(babyId, paths)
  }

  const { error } = await supabase
    .from('anecdotes')
    .delete()
    .eq('id', anecdoteId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting anecdote"); throw error }

  contextLogger.info("Anecdote deleted")

  revalidatePath(`/baby/${babyId}/anecdotes`)
}
