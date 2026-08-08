'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin } from './access'
import { getUserCircleIds } from './circles'
import { getUserAccess } from './users'
import { StoryWithUrl } from './stories'
import { logger } from '../logger'

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

  const highlights: HighlightWithStories[] = []

  for (const row of data) {
    const items = [...row.story_highlight_items].sort((a, b) => a.position - b.position)
    const visibleStories: StoryWithUrl[] = []

    for (const item of items) {
      const storyRow = Array.isArray(item.stories) ? item.stories[0] : item.stories
      if (!storyRow) continue

      const { stories_circles, ...story } = storyRow
      const visible = isAdmin || stories_circles.some((sc: { circle_id: string }) => userCircleIds.has(sc.circle_id))
      if (!visible) continue

      visibleStories.push({
        ...story,
        circleIds: stories_circles.map((sc: { circle_id: string }) => sc.circle_id),
        url: toStoryUrl(babyId, story.media_path),
        thumbnailUrl: story.thumbnail_path ? toStoryUrl(babyId, story.thumbnail_path) : null,
      })
    }

    if (visibleStories.length === 0) continue

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

export async function createHighlight(babyId: string, name: string, storyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: createHighlight.name, babyId, storyId })

  await assertIsAdmin(supabase, babyId)

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

  contextLogger.info({ highlightId: data.id }, "Highlight created")

  revalidatePath(`/baby/${babyId}/feed`)

  return data.id
}

export async function addStoryToHighlight(highlightId: string, storyId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: addStoryToHighlight.name, highlightId, storyId, babyId })

  await assertIsAdmin(supabase, babyId)

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

  contextLogger.info("Story added to highlight")

  revalidatePath(`/baby/${babyId}/feed`)
}

// Un-protects the story from pruneExpiredStories if its expires_at has
// already passed — the next getActiveStories call sweeps it.
export async function removeStoryFromHighlight(highlightId: string, storyId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: removeStoryFromHighlight.name, highlightId, storyId, babyId })

  await assertIsAdmin(supabase, babyId)

  const { error } = await supabase
    .from('story_highlight_items')
    .delete()
    .eq('highlight_id', highlightId)
    .eq('story_id', storyId)

  if (error) { contextLogger.error(error, "Error removing story from highlight"); throw error }

  revalidatePath(`/baby/${babyId}/feed`)
}

export async function renameHighlight(highlightId: string, babyId: string, name: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: renameHighlight.name, highlightId, babyId })

  await assertIsAdmin(supabase, babyId)

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
