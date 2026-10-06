'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin } from './access'
import { getUserCircleIds } from './circles'
import { getUserAccess } from './users'
import { StoryWithUrl } from './stories'
import { getStoryReactionsForStories, getViewedStoryIds } from '@utils/feed-loaders'
import type { Tables } from '@utils/supabase/database.types'
import { logger } from '../logger'
import { assertAdmin, assertHighlightInBaby, assertStoryVisible } from '@utils/feed-access'
import { FEED_LIMITS, normalizeText } from '@utils/feed-validation'

export type HighlightWithStories = {
  id: string
  name: string
  // null when the cover story is a video with no captured thumbnail — the
  // UI falls back to a generic icon rather than pointing an <img> at a
  // video file.
  coverUrl: string | null
  stories: StoryWithUrl[]
}

function toStoryUrl(babyId: string, path: string) {
  return `/api/storage/${babyId}/${path.split('/').map(encodeURIComponent).join('/')}`
}

// Highlights have no circle scoping of their own — visibility flows entirely
// from each contained story's own stories_circles rows. A highlight with
// zero stories visible to the current viewer is dropped from the result
// rather than shown empty.
export async function getHighlights(babyId: string): Promise<HighlightWithStories[]> {
  const contextLogger = logger.child({ function: getHighlights.name, babyId })

  const supabase = await createClient()
  const { data: { user } } = await getAuthUser()

  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'
  const userCircleIds = new Set(user ? await getUserCircleIds(babyId, user.id) : [])

  const { data, error } = await supabase
    .from('story_highlights')
    .select('id, name, cover_story_id, story_highlight_items (position, stories (*, stories_circles (circle_id)))')
    .eq('baby_id', babyId)
    .order('created_at', { ascending: true })

  if (error) { contextLogger.error(error, "Error fetching highlights"); return [] }

  // First pass: resolve which stories this viewer can see, so reactions and
  // viewed state are fetched once for the whole tray instead of per highlight.
  type StoryRow = (Tables<'stories'> & { stories_circles: { circle_id: string }[] }) | null
  const visibleByHighlight = data.map((row) => {
    const items = [...row.story_highlight_items].sort((a, b) => a.position - b.position)
    const rows: Exclude<StoryRow, null>[] = []

    for (const item of items) {
      const storyRow: StoryRow = Array.isArray(item.stories) ? item.stories[0] : item.stories
      if (!storyRow) continue
      // Defense in depth: a highlight item should never point at another
      // baby's story, but nothing in the schema enforces that.
      if (storyRow.baby_id !== babyId) continue

      const visible = isAdmin || storyRow.stories_circles.some((sc) => userCircleIds.has(sc.circle_id))
      if (visible) rows.push(storyRow)
    }

    return { row, rows }
  })

  const storyIds = Array.from(new Set(visibleByHighlight.flatMap(({ rows }) => rows.map((r) => r.id))))
  const [reactionsByStory, viewedIds] = await Promise.all([
    getStoryReactionsForStories(storyIds, babyId),
    getViewedStoryIds(storyIds, user?.id),
  ])

  const highlights: HighlightWithStories[] = []

  for (const { row, rows } of visibleByHighlight) {
    if (rows.length === 0) continue

    const visibleStories: StoryWithUrl[] = rows.map(({ stories_circles, ...story }) => ({
      ...story,
      circleIds: stories_circles.map((sc) => sc.circle_id),
      url: toStoryUrl(babyId, story.media_path),
      thumbnailUrl: story.thumbnail_path ? toStoryUrl(babyId, story.thumbnail_path) : null,
      reactions: reactionsByStory[story.id] ?? { breakdown: [], myEmoji: null },
      viewed: viewedIds.has(story.id),
    }))

    const cover = visibleStories.find((s) => s.id === row.cover_story_id) ?? visibleStories[0]
    highlights.push({
      id: row.id,
      name: row.name,
      coverUrl: cover.thumbnailUrl ?? (cover.mime_type.startsWith('video/') ? null : cover.url),
      stories: visibleStories,
    })
  }

  return highlights
}

// A highlighted story never expires — added to a highlight, its expires_at
// is cleared to null rather than merely being protected from the prune
// sweep. Removing it from a highlight later doesn't restore a countdown
// (matches Instagram: once saved, it stays saved).
async function clearStoryExpiry(supabase: Awaited<ReturnType<typeof createClient>>, storyId: string, babyId: string) {
  const { error } = await supabase
    .from('stories')
    .update({ expires_at: null })
    .eq('id', storyId)
    .eq('baby_id', babyId)

  return error
}

export async function createHighlight(babyId: string, rawName: string, storyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: createHighlight.name, babyId, storyId })

  await assertStoryVisible(storyId, babyId, await assertAdmin(babyId))
  const name = await normalizeText(rawName, FEED_LIMITS.highlightName, { requiredKey: 'textRequired' })

  const { data, error } = await supabase
    .from('story_highlights')
    .insert([{ baby_id: babyId, name, cover_story_id: storyId }])
    .select('id')
    .single()

  if (error) { contextLogger.error(error, "Error creating highlight"); throw error }

  const { error: itemError } = await supabase
    .from('story_highlight_items')
    .insert([{ highlight_id: data.id, story_id: storyId, position: 0 }])

  if (itemError) { contextLogger.error(itemError, "Error adding story to new highlight"); throw itemError }

  const expiryError = await clearStoryExpiry(supabase, storyId, babyId)
  if (expiryError) contextLogger.error(expiryError, "Error clearing story expiry after adding to highlight")

  contextLogger.info({ highlightId: data.id }, "Highlight created")

  revalidatePath(`/baby/${babyId}/feed`)

  return data.id
}

export async function addStoryToHighlight(highlightId: string, storyId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: addStoryToHighlight.name, highlightId, storyId, babyId })

  const viewer = await assertAdmin(babyId)
  await assertHighlightInBaby(highlightId, babyId)
  await assertStoryVisible(storyId, babyId, viewer)

  const { data: existing, error: existingError } = await supabase
    .from('story_highlight_items')
    .select('position')
    .eq('highlight_id', highlightId)
    .order('position', { ascending: false })
    .limit(1)

  if (existingError) { contextLogger.error(existingError, "Error reading highlight items"); throw existingError }

  const nextPosition = (existing[0]?.position ?? -1) + 1

  const { error } = await supabase
    .from('story_highlight_items')
    .insert([{ highlight_id: highlightId, story_id: storyId, position: nextPosition }])

  if (error) { contextLogger.error(error, "Error adding story to highlight"); throw error }

  const expiryError = await clearStoryExpiry(supabase, storyId, babyId)
  if (expiryError) contextLogger.error(expiryError, "Error clearing story expiry after adding to highlight")

  contextLogger.info("Story added to highlight")

  revalidatePath(`/baby/${babyId}/feed`)
}

// Un-protects the story from pruneExpiredStories if its expires_at has
// already passed — the next getActiveStories call sweeps it.
export async function removeStoryFromHighlight(highlightId: string, storyId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: removeStoryFromHighlight.name, highlightId, storyId, babyId })

  const viewer = await assertAdmin(babyId)
  await assertHighlightInBaby(highlightId, babyId)
  await assertStoryVisible(storyId, babyId, viewer)

  const { error } = await supabase
    .from('story_highlight_items')
    .delete()
    .eq('highlight_id', highlightId)
    .eq('story_id', storyId)

  if (error) { contextLogger.error(error, "Error removing story from highlight"); throw error }

  revalidatePath(`/baby/${babyId}/feed`)
}

export async function renameHighlight(highlightId: string, babyId: string, rawName: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: renameHighlight.name, highlightId, babyId })

  await assertIsAdmin(supabase, babyId)
  const name = await normalizeText(rawName, FEED_LIMITS.highlightName, { requiredKey: 'textRequired' })

  const { error } = await supabase
    .from('story_highlights')
    .update({ name })
    .eq('id', highlightId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error renaming highlight"); throw error }

  revalidatePath(`/baby/${babyId}/feed`)
}

// Only removes the grouping (story_highlight_items cascades) — never the
// underlying stories rows, which live and expire independently.
export async function deleteHighlight(highlightId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: deleteHighlight.name, highlightId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { error } = await supabase
    .from('story_highlights')
    .delete()
    .eq('id', highlightId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting highlight"); throw error }

  revalidatePath(`/baby/${babyId}/feed`)
}
