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
import { copyStoryPhotoToLibrary } from '@utils/albums-internal'
import { notifyUsers } from './notify'
import { bestEffort } from '@utils/side-effects'
import { getStoryReactionsForStories, getViewedStoryIds } from '@utils/feed-loaders'
import type { ReactionsData } from './reactions'
import { logger } from '../logger'
import { actionError } from './errors'
import { ALLOWED_IMAGE_CONTENT_TYPES, ALLOWED_VIDEO_CONTENT_TYPES } from '@utils/upload-content-types'
import { hasUnsafePathSegment } from '@utils/storage-path'
import { assertAdmin, assertCirclesInBaby, assertStoryVisible, findVisibleStory, getFeedViewer } from '@utils/feed-access'
import { FEED_LIMITS, normalizeText } from '@utils/feed-validation'

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
  // Filenames come back from /api/upload as a single path segment; anything
  // else would let the row point outside this story's folder.
  if (hasUnsafePathSegment(story.thumbnailFilename === undefined ? [story.mediaFilename] : [story.mediaFilename, story.thumbnailFilename])) {
    contextLogger.warn("Rejected unsafe filename")
    throw await actionError('invalidFilename')
  }
  if (!ALLOWED_IMAGE_CONTENT_TYPES.has(story.mimeType) && !ALLOWED_VIDEO_CONTENT_TYPES.has(story.mimeType)) {
    throw await actionError('invalidFileType')
  }
  await assertCirclesInBaby(circleIds, story.baby_id)
  const caption = await normalizeText(story.caption, FEED_LIMITS.storyCaption)
  const groupLabel = await normalizeText(story.groupLabel, FEED_LIMITS.groupLabel)
  await ensureBabyBucket(story.baby_id)

  const expiresAt = story.durationHours
    ? new Date(Date.now() + story.durationHours * 60 * 60 * 1000).toISOString()
    : null

  const mediaPath = `stories/${story.id}/${story.mediaFilename}`
  const thumbnailPath = story.thumbnailFilename ? `stories/${story.id}/thumbnails/${story.thumbnailFilename}` : null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')

  const { error } = await supabase
    .from('stories')
    .insert([{
      id: story.id,
      baby_id: story.baby_id,
      caption,
      expires_at: expiresAt,
      group_label: groupLabel,
      media_path: mediaPath,
      thumbnail_path: thumbnailPath,
      mime_type: story.mimeType,
    }])

  // The client reuses its story id when retrying. If the first call landed
  // but a later step failed or the response was lost, resume it instead of
  // failing on the duplicate id: only when it's the caller's own story in
  // this baby with the same media, so nobody can resume someone else's.
  let resumed = false
  if (error) {
    // stories has no unique constraint besides its primary key, so 23505
    // can only mean the id already exists.
    if (error.code !== '23505') {
      contextLogger.error(error, "Error creating story")
      throw error
    }

    const { data: existing, error: existingError } = await supabase
      .from('stories')
      .select('id, created_by, media_path')
      .eq('id', story.id)
      .eq('baby_id', story.baby_id)
      .maybeSingle()

    if (existingError) { contextLogger.error(existingError, "Error checking existing story on retry"); throw existingError }
    if (!existing || existing.created_by !== user.id || existing.media_path !== mediaPath) {
      contextLogger.warn("Rejected resume of a story that is not the caller's")
      throw await actionError('unauthorized')
    }
    resumed = true

    // Bring the row in line with the retried values (the user may have
    // edited them, and nobody has been notified yet).
    const { error: updateError } = await supabase
      .from('stories')
      .update({ caption, group_label: groupLabel })
      .eq('id', story.id)
      .eq('baby_id', story.baby_id)

    if (updateError) { contextLogger.error(updateError, "Error updating retried story"); throw updateError }

    let staleCircles = supabase.from('stories_circles').delete().eq('story_id', story.id)
    // assertCirclesInBaby already matched every circleId to a uuid row, so
    // none can hold the commas or parentheses that would break this filter.
    if (circleIds.length > 0) staleCircles = staleCircles.not('circle_id', 'in', `(${circleIds.join(',')})`)
    const { error: deleteError } = await staleCircles

    if (deleteError) { contextLogger.error(deleteError, "Error clearing stale circles on retried story"); throw deleteError }
  }
  const storyId = story.id

  if (circleIds.length > 0) {
    // Upsert so a resumed call can't trip on links the first attempt wrote.
    const { error: circlesError } = await supabase
      .from('stories_circles')
      .upsert(
        circleIds.map((circleId) => ({ story_id: storyId, circle_id: circleId })),
        { onConflict: 'story_id,circle_id', ignoreDuplicates: true }
      )

    if (circlesError) { contextLogger.error(circlesError, "Error linking story circles"); throw circlesError }
  }

  contextLogger.info({ storyId, resumed }, resumed ? "Story already existed (retry)" : "Story created")

  // Mirror onto the Photos page as an independent copy (see
  // .claude/plans/post-story-photos-to-photo-page.md) so it survives the
  // story expiring or being deleted — unlike posts, stories can't just
  // share their storage object. Best-effort: the story is already committed,
  // and publishStory (a separate step) sends the notification.
  await bestEffort(contextLogger, "Error mirroring story to Photos page", async () => {
    if (resumed) {
      const { data: mirrored, error: mirrorError } = await supabase
        .from('album_photos')
        .select('id')
        .eq('baby_id', story.baby_id)
        .eq('source_story_id', storyId)
        .limit(1)
      if (mirrorError) throw mirrorError
      if (mirrored.length > 0) return
    }
    await copyStoryPhotoToLibrary(storyId, story.baby_id, {
      storagePath: mediaPath,
      thumbnailPath,
      mimeType: story.mimeType,
    })
  })

  revalidatePath(`/baby/${story.baby_id}/feed`)
  revalidatePath(`/baby/${story.baby_id}/albums`)

  return storyId
}

// Sends the new-story push once the story exists. Recipients come from the
// circles stored on the story, never from client input. Not idempotent on the
// server: the modal's `published` flag and pending lock are what prevent a
// double send (admin-only action), same as publishPost.
export async function publishStory(storyId: string, babyId: string) {
  const contextLogger = logger.child({ function: publishStory.name, storyId, babyId })

  const { viewer, story } = await assertStoryVisible(storyId, babyId, await assertAdmin(babyId))

  const recipients = await getVisibleUserIds(babyId, story.circleIds, viewer.userId)
  const t = await getTranslations('pushNotifications')
  await notifyUsers(babyId, 'new_story', {
    title: t('newStory.title'),
    body: t('newStory.body'),
    url: `/baby/${babyId}/feed?storyId=${storyId}`,
  }, recipients)

  contextLogger.info({ recipientCount: recipients.length }, "Story published")

  revalidatePath(`/baby/${babyId}/feed`)
}

type StoryUpdate = { caption: string | null; groupLabel: string | null }

// Caption/group/visibility only — the media itself and the duration/expiry
// are immutable once posted (no UI exposes editing them). Highlighted
// stories aren't editable here either; the caller (story_viewer.tsx) only
// offers this for active, non-highlighted stories, same restriction as delete.
export async function updateStory(storyId: string, babyId: string, update: StoryUpdate, circleIds: string[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updateStory.name, storyId, babyId })

  // The stories_circles delete/insert below is keyed by storyId alone, so
  // the story must be proven to belong to this baby first.
  await assertStoryVisible(storyId, babyId, await assertAdmin(babyId))
  await assertCirclesInBaby(circleIds, babyId)
  const caption = await normalizeText(update.caption, FEED_LIMITS.storyCaption)
  const groupLabel = await normalizeText(update.groupLabel, FEED_LIMITS.groupLabel)

  // Snapshot who could see this story *before* the circle change, so that
  // after re-linking we can notify only the people newly able to see it —
  // never re-notifying admins or members of a circle that was already
  // assigned (see getVisibleUserIds' "newly visible" doc comment).
  const { data: { user } } = await supabase.auth.getUser()
  const { data: oldLinks, error: oldLinksError } = await supabase
    .from('stories_circles')
    .select('circle_id')
    .eq('story_id', storyId)

  if (oldLinksError) { contextLogger.error(oldLinksError, "Error fetching current story circles"); throw oldLinksError }

  const oldCircleIds = oldLinks.map((row) => row.circle_id)
  const previouslyVisible = new Set(await getVisibleUserIds(babyId, oldCircleIds, user?.id))

  const { error } = await supabase
    .from('stories')
    .update({
      caption,
      group_label: groupLabel,
    })
    .eq('id', storyId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error updating story"); throw error }

  const { error: deleteCirclesError } = await supabase
    .from('stories_circles')
    .delete()
    .eq('story_id', storyId)

  if (deleteCirclesError) { contextLogger.error(deleteCirclesError, "Error clearing story circles"); throw deleteCirclesError }

  if (circleIds.length > 0) {
    const { error: circlesError } = await supabase
      .from('stories_circles')
      .insert(circleIds.map((circleId) => ({ story_id: storyId, circle_id: circleId })))

    if (circlesError) { contextLogger.error(circlesError, "Error linking story circles"); throw circlesError }
  }

  contextLogger.info("Story updated")

  const nowVisible = await getVisibleUserIds(babyId, circleIds, user?.id)
  const newlyVisible = nowVisible.filter((id) => !previouslyVisible.has(id))
  if (newlyVisible.length > 0) {
    const t = await getTranslations('pushNotifications')
    await notifyUsers(babyId, 'new_story', {
      title: t('newStory.title'),
      body: t('newStory.body'),
      url: `/baby/${babyId}/feed?storyId=${storyId}`,
    }, newlyVisible)
  }

  revalidatePath(`/baby/${babyId}/feed`)
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

export async function getActiveStories(babyId: string): Promise<StoryGroup[]> {
  const contextLogger = logger.child({ function: getActiveStories.name, babyId })
  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) return []

  // Fire-and-forget: the query below already filters out expired rows, so
  // the sweep is pure housekeeping and shouldn't delay the feed render.
  // Only after the membership check so outsiders can't trigger deletes.
  pruneExpiredStories(babyId).catch((err) => contextLogger.error(err, "Error pruning expired stories"))

  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()

  const isAdmin = access.access_level === 'admin'
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

  const found = await findVisibleStory(storyId, babyId)
  if (!found) return
  const user = { id: found.viewer.userId }

  const { error } = await supabase
    .from('story_views')
    .upsert([{ story_id: storyId, user_id: user.id }], { onConflict: 'story_id,user_id', ignoreDuplicates: true })

  if (error) { contextLogger.error(error, "Error marking story viewed"); return }

  contextLogger.debug("Story marked viewed")
}

// Admin-only "seen by" report, same rule as getPostViews.
export async function getStoryViews(storyId: string, babyId: string, excludeUserId?: string | null): Promise<StoryViewsData> {
  const contextLogger = logger.child({ function: getStoryViews.name, storyId, babyId })

  const viewer = await getFeedViewer(babyId)
  if (!viewer?.isAdmin || !(await findVisibleStory(storyId, babyId, viewer))) return { count: 0, names: [] }

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
  // deliberately survives this — see copyStoryPhotoToLibrary in albums-internal.ts.
  revalidatePath(`/baby/${babyId}/feed`)
  revalidatePath(`/baby/${babyId}/albums`)
}
