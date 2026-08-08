'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { Tables } from '@utils/supabase/database.types'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin, getVisibleUserIds } from './access'
import { getUserCircleIds } from './circles'
import { getUserAccess } from './users'
import { ensureBabyBucket, removeStorageObjects } from './storage'
import { notifyUsers } from './notify'
import { logger } from '../logger'

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

export async function createAnecdote(anecdote: NewAnecdote, circleIds: string[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: createAnecdote.name, babyId: anecdote.baby_id })

  await assertIsAdmin(supabase, anecdote.baby_id)
  await ensureBabyBucket(anecdote.baby_id)

  const { data, error } = await supabase
    .from('anecdotes')
    .insert([{
      id: anecdote.id,
      baby_id: anecdote.baby_id,
      content: anecdote.content,
      happened_at: anecdote.happened_at,
    }])
    .select('id')
    .single()

  if (error) { contextLogger.error(error, "Error creating anecdote"); throw error }

  if (circleIds.length > 0) {
    const { error: circlesError } = await supabase
      .from('anecdotes_circles')
      .insert(circleIds.map((circleId) => ({ anecdote_id: data.id, circle_id: circleId })))

    if (circlesError) { contextLogger.error(circlesError, "Error linking anecdote circles"); throw circlesError }
  }

  contextLogger.info({ anecdoteId: data.id }, "Anecdote created")

  const { data: { user } } = await supabase.auth.getUser()
  const recipients = await getVisibleUserIds(anecdote.baby_id, circleIds, user?.id)
  await notifyUsers(anecdote.baby_id, 'new_anecdote', {
    title: 'Nouvelle anecdote',
    body: anecdote.content.slice(0, 120),
    url: `/baby/${anecdote.baby_id}/anecdotes`,
  }, recipients)

  revalidatePath(`/baby/${anecdote.baby_id}/anecdotes`)

  return data.id
}

export async function attachAnecdotePhoto(
  anecdoteId: string,
  babyId: string,
  { filename, mimeType }: { filename: string; mimeType: string }
) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: attachAnecdotePhoto.name, anecdoteId, babyId })

  await assertIsAdmin(supabase, babyId)

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

  const { error } = await supabase
    .from('anecdotes')
    .update({
      content: update.content,
      happened_at: update.happened_at,
    })
    .eq('id', anecdoteId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error updating anecdote"); throw error }

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

async function withVisibility(babyId: string) {
  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()

  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'
  const userCircleIds = new Set(user ? await getUserCircleIds(babyId, user.id) : [])

  return { supabase, isAdmin, userCircleIds }
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
  const contextLogger = logger.child({ function: getAnecdotes.name, babyId, limit, before })
  const { supabase, isAdmin, userCircleIds } = await withVisibility(babyId)

  let query = supabase
    .from('anecdotes')
    .select('*, anecdotes_circles (circle_id)')
    .eq('baby_id', babyId)
    .order('happened_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) {
    query = query.or(
      `happened_at.lt.${before.happenedAt},and(happened_at.eq.${before.happenedAt},created_at.lt.${before.createdAt})`
    )
  }

  const { data, error } = await query

  if (error) { contextLogger.error(error, "Error fetching anecdotes"); return [] }

  const visibleRows = data.filter(
    (row) => isAdmin || row.anecdotes_circles.some((ac: { circle_id: string }) => userCircleIds.has(ac.circle_id))
  )
  const visible = visibleRows.map(toAnecdoteWithDetails)

  contextLogger.debug({ count: visible.length }, "Anecdotes received")

  return visible
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
