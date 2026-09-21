'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { getDisplayName } from '@utils/users'
import { Tables } from '@utils/supabase/database.types'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { assertIsAdmin, getVisibleUserIds } from './access'
import { getUserCircleIds } from './circles'
import { getUserAccess, getNicknamesByBaby } from './users'
import { ensureBabyBucket, removeStorageObjects } from './storage'
import { copyStoryPhotoToLibrary } from './albums'
import { notifyUsers } from './notify'
import { getStoryReactionsForStories } from './story_reactions'
import type { ReactionsData } from './reactions'
import { logger } from '../logger'

export type StoryWithUrl = Tables<'stories'> & {
  url: string
  thumbnailUrl: string | null
  circleIds: string[]
  reactions: ReactionsData
  viewed: boolean
}
// A tray bubble: either one author's stream (key = "author:<id>") or a
// shared, cross-author group_label like "Beach day" (key = "label:<label>").
export type StoryGroup = {
  key: string
  title: string
  isLabeled: boolean
  stories: StoryWithUrl[]
  allViewed: boolean
}
export type StoryViewsData = { count: number; names: string[] }

type NewStory = {
  id: string
  baby_id: string
  caption: string | null
  durationHours: number | null
  groupLabel: string | null
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

  const mediaPath = `stories/${story.id}/${story.mediaFilename}`
  const thumbnailPath = story.thumbnailFilename ? `stories/${story.id}/thumbnails/${story.thumbnailFilename}` : null

  const { data, error } = await supabase
    .from('stories')
    .insert([{
      id: story.id,
      baby_id: story.baby_id,
      caption: story.caption,
      expires_at: expiresAt,
      group_label: story.groupLabel,
      media_path: mediaPath,
      thumbnail_path: thumbnailPath,
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

  // Mirror onto the Photos page as an independent copy (see
  // .claude/plans/post-story-photos-to-photo-page.md) so it survives the
  // story expiring or being deleted — unlike posts, stories can't just
  // share their storage object.
  await copyStoryPhotoToLibrary(data.id, story.baby_id, {
    storagePath: mediaPath,
    thumbnailPath,
    mimeType: story.mimeType,
  })

  const { data: { user } } = await supabase.auth.getUser()
  const recipients = await getVisibleUserIds(story.baby_id, circleIds, user?.id)
  const t = await getTranslations('pushNotifications')
  await notifyUsers(story.baby_id, 'new_story', {
    title: t('newStory.title'),
    body: t('newStory.body'),
    url: `/baby/${story.baby_id}/feed?storyId=${data.id}`,
  }, recipients)

  revalidatePath(`/baby/${story.baby_id}/feed`)
  revalidatePath(`/baby/${story.baby_id}/albums`)

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
// than on a fixed schedule. Highlighted stories never show up here — adding
// a story to a highlight clears its expires_at to null (see
// story_highlights.ts), so it's already excluded by the `not is null` check.
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

  try {
    const paths = expired.flatMap((s) => s.thumbnail_path ? [s.media_path, s.thumbnail_path] : [s.media_path])
    await removeStorageObjects(babyId, paths)
  } catch (err) {
    contextLogger.error(err, "Error removing expired story storage objects")
  }

  const { error: deleteError } = await supabase
    .from('stories')
    .delete()
    .in('id', expired.map((s) => s.id))

  if (deleteError) { contextLogger.error(deleteError, "Error deleting expired stories"); return }

  contextLogger.info({ count: expired.length }, "Expired stories pruned")
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

export async function getActiveStories(babyId: string): Promise<StoryGroup[]> {
  const contextLogger = logger.child({ function: getActiveStories.name, babyId })
  // Fire-and-forget: the query below already filters out expired rows, so
  // the sweep is pure housekeeping and shouldn't delay the feed render.
  pruneExpiredStories(babyId).catch((err) => contextLogger.error(err, "Error pruning expired stories"))

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

  const storyIds = visibleRows.map((row) => row.id)
  const [nicknames, viewedIds, reactionsByStory] = await Promise.all([
    getNicknamesByBaby(babyId),
    getViewedStoryIds(storyIds, user?.id),
    getStoryReactionsForStories(storyIds, babyId),
  ])
  const tCommon = await getTranslations('common')

  const byKey = new Map<string, { title: string; isLabeled: boolean; stories: StoryWithUrl[] }>()
  for (const row of visibleRows) {
    const { stories_circles, users: authorOrList, ...story } = row
    const authorId = story.created_by ?? 'unknown'
    const author = Array.isArray(authorOrList) ? authorOrList[0] : authorOrList

    const isLabeled = !!story.group_label
    const key = isLabeled ? `label:${story.group_label}` : `author:${authorId}`
    const group = byKey.get(key) ?? {
      title: isLabeled ? story.group_label! : (getDisplayName(author, nicknames[authorId]) || tCommon('userFallback')),
      isLabeled,
      stories: [] as StoryWithUrl[],
    }
    group.stories.push({
      ...story,
      circleIds: stories_circles.map((sc: { circle_id: string }) => sc.circle_id),
      url: toStoryUrl(babyId, story.media_path),
      thumbnailUrl: story.thumbnail_path ? toStoryUrl(babyId, story.thumbnail_path) : null,
      reactions: reactionsByStory[story.id] ?? { breakdown: [], myEmoji: null },
      viewed: viewedIds.has(story.id),
    })
    byKey.set(key, group)
  }

  const groups = Array.from(byKey.entries()).map(([key, group]) => ({
    key,
    title: group.title,
    isLabeled: group.isLabeled,
    stories: group.stories,
    allViewed: group.stories.every((s) => viewedIds.has(s.id)),
  }))

  groups.sort((a, b) => Number(a.allViewed) - Number(b.allViewed))

  contextLogger.debug({ groupCount: groups.length }, "Active stories received")

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

  const tCommon = await getTranslations('common')
  const others = data.filter((row) => row.user_id !== excludeUserId)
  const names = others.map(({ user_id, users: viewerOrList }) => {
    const viewer = Array.isArray(viewerOrList) ? viewerOrList[0] : viewerOrList
    return getDisplayName(viewer, nicknames[user_id]) || tCommon('userFallback')
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

  // The story's Photos-page copy (source_story_id, ON DELETE SET NULL)
  // deliberately survives this — see copyStoryPhotoToLibrary in albums.ts.
  revalidatePath(`/baby/${babyId}/feed`)
  revalidatePath(`/baby/${babyId}/albums`)
}
