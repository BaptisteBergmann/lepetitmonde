'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { getDisplayName } from '@utils/users'
import { Tables } from '@utils/supabase/database.types'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin, getVisibleUserIds } from './access'
import { getUserCircleIds } from './circles'
import { getUserAccess, getNicknamesByBaby } from './users'
import { ensureBabyBucket, removeStorageObjects } from './storage'
import { notifyUsers } from './notify'
import { logger } from '../logger'

export type StoryWithUrl = Tables<'stories'> & {
  url: string
  thumbnailUrl: string | null
  circleIds: string[]
}
export type StoryAuthorGroup = {
  authorId: string
  authorName: string
  stories: StoryWithUrl[]
  allViewed: boolean
}
export type StoryViewsData = { count: number; names: string[] }

type NewStory = {
  id: string
  baby_id: string
  caption: string | null
  durationHours: number | null
  mediaFilename: string
  mimeType: string
  thumbnailFilename?: string
}

export async function createStory(story: NewStory, circleIds: string[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: createStory.name, babyId: story.baby_id })

  await assertIsAdmin(supabase, story.baby_id)
  await ensureBabyBucket(story.baby_id)

  const expiresAt = story.durationHours
    ? new Date(Date.now() + story.durationHours * 60 * 60 * 1000).toISOString()
    : null

  const { data, error } = await supabase
    .from('stories')
    .insert([{
      id: story.id,
      baby_id: story.baby_id,
      caption: story.caption,
      expires_at: expiresAt,
      media_path: `stories/${story.id}/${story.mediaFilename}`,
      thumbnail_path: story.thumbnailFilename ? `stories/${story.id}/thumbnails/${story.thumbnailFilename}` : null,
      mime_type: story.mimeType,
    }])
    .select('id')
    .single()

  if (error) { contextLogger.error(error, "Error creating story"); throw error }

  if (circleIds.length > 0) {
    const { error: circlesError } = await supabase
      .from('stories_circles')
      .insert(circleIds.map((circleId) => ({ story_id: data.id, circle_id: circleId })))

    if (circlesError) { contextLogger.error(circlesError, "Error linking story circles"); throw circlesError }
  }

  contextLogger.info({ storyId: data.id }, "Story created")

  const { data: { user } } = await supabase.auth.getUser()
  const recipients = await getVisibleUserIds(story.baby_id, circleIds, user?.id)
  await notifyUsers(story.baby_id, 'new_story', {
    title: 'Nouvelle story',
    body: 'Une nouvelle story a été ajoutée au journal !',
    url: `/baby/${story.baby_id}/feed`,
  }, recipients)

  revalidatePath(`/baby/${story.baby_id}/feed`)

  return data.id
}

// Not exported: a "use server" file may only export async functions (Server
// Actions), so this small pure helper stays private here and is duplicated
// in story_highlights.ts rather than shared.
function toStoryUrl(babyId: string, path: string) {
  return `/api/storage/${babyId}/${path.split('/').map(encodeURIComponent).join('/')}`
}

// Best-effort, self-cleaning expiry: there is no cron/scheduler in this app,
// so expired stories are swept lazily whenever the tray is loaded rather
// than on a fixed schedule. A story referenced by any story_highlight_items
// row is protected from deletion even once its own expires_at has passed —
// that's what makes highlights durable.
async function pruneExpiredStories(babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: pruneExpiredStories.name, babyId })

  const { data: expired, error } = await supabase
    .from('stories')
    .select('id, media_path, thumbnail_path')
    .eq('baby_id', babyId)
    .not('expires_at', 'is', null)
    .lte('expires_at', new Date().toISOString())

  if (error) { contextLogger.error(error, "Error fetching expired stories"); return }
  if (expired.length === 0) return

  const { data: highlighted, error: highlightedError } = await supabase
    .from('story_highlight_items')
    .select('story_id')
    .in('story_id', expired.map((s) => s.id))

  if (highlightedError) { contextLogger.error(highlightedError, "Error checking highlighted stories"); return }

  const protectedIds = new Set((highlighted ?? []).map((h) => h.story_id))
  const toDelete = expired.filter((s) => !protectedIds.has(s.id))
  if (toDelete.length === 0) return

  try {
    const paths = toDelete.flatMap((s) => s.thumbnail_path ? [s.media_path, s.thumbnail_path] : [s.media_path])
    await removeStorageObjects(babyId, paths)
  } catch (err) {
    contextLogger.error(err, "Error removing expired story storage objects")
  }

  const { error: deleteError } = await supabase
    .from('stories')
    .delete()
    .in('id', toDelete.map((s) => s.id))

  if (deleteError) { contextLogger.error(deleteError, "Error deleting expired stories"); return }

  contextLogger.info({ count: toDelete.length }, "Expired stories pruned")
}

async function getViewedStoryIds(storyIds: string[], userId: string | undefined): Promise<Set<string>> {
  if (!userId || storyIds.length === 0) return new Set()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('story_views')
    .select('story_id')
    .eq('user_id', userId)
    .in('story_id', storyIds)

  if (error) return new Set()
  return new Set(data.map((row) => row.story_id))
}

export async function getActiveStories(babyId: string): Promise<StoryAuthorGroup[]> {
  const contextLogger = logger.child({ function: getActiveStories.name, babyId })
  await pruneExpiredStories(babyId)

  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()

  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'
  const userCircleIds = new Set(user ? await getUserCircleIds(babyId, user.id) : [])

  const { data, error } = await supabase
    .from('stories')
    .select('*, stories_circles (circle_id), users (first_name, last_name)')
    .eq('baby_id', babyId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })

  if (error) { contextLogger.error(error, "Error fetching active stories"); return [] }

  const visibleRows = data.filter(
    (row) => isAdmin || row.stories_circles.some((sc: { circle_id: string }) => userCircleIds.has(sc.circle_id))
  )
  if (visibleRows.length === 0) return []

  const nicknames = await getNicknamesByBaby(babyId)
  const viewedIds = await getViewedStoryIds(visibleRows.map((row) => row.id), user?.id)

  const byAuthor = new Map<string, { authorName: string; stories: StoryWithUrl[] }>()
  for (const row of visibleRows) {
    const { stories_circles, users: authorOrList, ...story } = row
    const authorId = story.created_by ?? 'unknown'
    const author = Array.isArray(authorOrList) ? authorOrList[0] : authorOrList

    const group = byAuthor.get(authorId) ?? {
      authorName: getDisplayName(author, nicknames[authorId]) || "Utilisateur",
      stories: [],
    }
    group.stories.push({
      ...story,
      circleIds: stories_circles.map((sc: { circle_id: string }) => sc.circle_id),
      url: toStoryUrl(babyId, story.media_path),
      thumbnailUrl: story.thumbnail_path ? toStoryUrl(babyId, story.thumbnail_path) : null,
    })
    byAuthor.set(authorId, group)
  }

  const groups = Array.from(byAuthor.entries()).map(([authorId, group]) => ({
    authorId,
    authorName: group.authorName,
    stories: group.stories,
    allViewed: group.stories.every((s) => viewedIds.has(s.id)),
  }))

  groups.sort((a, b) => Number(a.allViewed) - Number(b.allViewed))

  contextLogger.debug({ authorCount: groups.length }, "Active stories received")

  return groups
}

export async function markStoryViewed(storyId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: markStoryViewed.name, storyId, babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) return

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) return

  const { error } = await supabase
    .from('story_views')
    .upsert([{ story_id: storyId, user_id: user.id }], { onConflict: 'story_id,user_id', ignoreDuplicates: true })

  if (error) { contextLogger.error(error, "Error marking story viewed"); return }

  contextLogger.debug("Story marked viewed")
}

// Admin-only "seen by" report, same rule as getPostViews.
export async function getStoryViews(storyId: string, babyId: string, excludeUserId?: string | null): Promise<StoryViewsData> {
  const contextLogger = logger.child({ function: getStoryViews.name, storyId, babyId })

  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'
  if (!isAdmin) return { count: 0, names: [] }

  const supabase = await createClient()
  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('story_views')
      .select('user_id, users (first_name, last_name)')
      .eq('story_id', storyId),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching story views"); return { count: 0, names: [] } }

  const others = data.filter((row) => row.user_id !== excludeUserId)
  const names = others.map(({ user_id, users: viewerOrList }) => {
    const viewer = Array.isArray(viewerOrList) ? viewerOrList[0] : viewerOrList
    return getDisplayName(viewer, nicknames[user_id]) || "Utilisateur"
  })

  return { count: others.length, names }
}

export async function deleteStory(storyId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: deleteStory.name, storyId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { data: story, error: fetchError } = await supabase
    .from('stories')
    .select('media_path, thumbnail_path')
    .eq('id', storyId)
    .eq('baby_id', babyId)
    .single()

  if (fetchError) { contextLogger.error(fetchError, "Error fetching story before delete"); throw fetchError }

  const paths = story.thumbnail_path ? [story.media_path, story.thumbnail_path] : [story.media_path]
  await removeStorageObjects(babyId, paths)

  const { error } = await supabase
    .from('stories')
    .delete()
    .eq('id', storyId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting story"); throw error }

  contextLogger.info("Story deleted")

  revalidatePath(`/baby/${babyId}/feed`)
}
