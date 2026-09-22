'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Film } from 'lucide-react'
import { Tables } from '@utils/supabase/database.types'
import { StoryGroup, StoryWithUrl, getActiveStories } from '@utils/actions/stories'
import { HighlightWithStories, getHighlights } from '@utils/actions/story_highlights'
import { useBabyRealtime } from '@/utils/hooks/use-baby-realtime'
import { cn } from '@utils/utils'
import CreateStoryModal from './create_story_modal'
import StoryViewer from './story_viewer'

type Circle = Tables<'circles'>

export type ViewerTarget =
  | { kind: 'group'; index: number; storyId?: string }
  | { kind: 'highlight'; index: number }

function bubbleImageFor(story: StoryWithUrl | undefined) {
  if (!story) return null
  if (story.thumbnailUrl) return story.thumbnailUrl
  return story.mime_type.startsWith('video/') ? null : story.url
}

function BubbleThumb({
  imageUrl,
  fallbackLabel,
  fallbackIsVideo,
  rounded,
}: {
  imageUrl: string | null
  fallbackLabel: string
  fallbackIsVideo?: boolean
  rounded: 'full' | '2xl'
}) {
  return (
    <span
      className={cn(
        "w-full h-full overflow-hidden bg-landing-background flex items-center justify-center",
        rounded === 'full' ? "rounded-full" : "rounded-2xl"
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={fallbackLabel} width={56} height={56} loading="lazy" decoding="async" className="w-full h-full object-cover" />
      ) : fallbackIsVideo ? (
        <Film className="h-5 w-5 text-landing-muted" />
      ) : (
        <span className="text-sm font-semibold text-landing-muted">
          {fallbackLabel.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  )
}

export default function StoryTray({
  babyId,
  isAdmin,
  circles,
  initialHighlights,
  initialStories,
  highlightStoryId,
}: {
  babyId: string
  isAdmin: boolean
  circles: Circle[]
  initialHighlights: HighlightWithStories[]
  initialStories: StoryGroup[]
  highlightStoryId?: string
}) {
  const t = useTranslations('feed.storyTray')
  const [highlights, setHighlights] = useState(initialHighlights)
  const [groups, setGroups] = useState(initialStories)
  const [createOpen, setCreateOpen] = useState(false)
  // Re-sync when the server hands us new props, e.g. after a pull-to-refresh
  // triggers `router.refresh()`. Since this component stays mounted across
  // that refresh, `useState(initialX)`'s initial value alone would never pick
  // up the new data. Adjusted during render (not an effect) to avoid an extra
  // render pass — see https://react.dev/learn/you-might-not-need-an-effect.
  const [prevInitialHighlights, setPrevInitialHighlights] = useState(initialHighlights)
  if (initialHighlights !== prevInitialHighlights) {
    setPrevInitialHighlights(initialHighlights)
    setHighlights(initialHighlights)
  }
  const [prevInitialStories, setPrevInitialStories] = useState(initialStories)
  if (initialStories !== prevInitialStories) {
    setPrevInitialStories(initialStories)
    setGroups(initialStories)
  }
  // Auto-open the story a notification deep-linked to. Lazy-initialized
  // (rather than set from an effect) since `initialStories` is already
  // fully loaded on mount — stories aren't paginated like posts. If the
  // story has since expired or isn't visible to this user, it's simply not
  // found and the tray renders normally with no viewer opened.
  const [viewerTarget, setViewerTarget] = useState<ViewerTarget | null>(() => {
    if (!highlightStoryId) return null
    const groupIndex = initialStories.findIndex((g) => g.stories.some((s) => s.id === highlightStoryId))
    return groupIndex === -1 ? null : { kind: 'group', index: groupIndex, storyId: highlightStoryId }
  })

  const refresh = async () => {
    const [nextHighlights, nextStories] = await Promise.all([
      getHighlights(babyId),
      getActiveStories(babyId),
    ])
    setHighlights(nextHighlights)
    setGroups(nextStories)
  }

  // Debounced so a burst of related row changes (a `stories` insert plus its
  // `stories_circles` links, or several stories posted back to back) collapses
  // into one refetch instead of one per event.
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useBabyRealtime(babyId, (event) => {
    if (event.table !== 'stories' && event.table !== 'story_highlights') return
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    refreshTimeoutRef.current = setTimeout(refresh, 500)
  })
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    }
  }, [])

  // Existing labeled group names, offered as autocomplete so continuing a
  // group (e.g. "Beach day") doesn't fragment into two by a typo.
  const existingGroupLabels = groups.filter((g) => g.isLabeled).map((g) => g.title)

  if (highlights.length === 0 && groups.length === 0 && !isAdmin) return null

  return (
    <div className="space-y-3">
      {highlights.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {highlights.map((highlight, index) => (
            <button
              key={highlight.id}
              onClick={() => setViewerTarget({ kind: 'highlight', index })}
              className="flex flex-col items-center gap-1 shrink-0 w-16 cursor-pointer"
            >
              <span className="flex size-14 rounded-2xl border border-landing-border p-0.5">
                <BubbleThumb
                  imageUrl={highlight.coverUrl}
                  fallbackLabel={highlight.name}
                  fallbackIsVideo={!highlight.coverUrl}
                  rounded="2xl"
                />
              </span>
              <span className="text-xs text-landing-muted truncate w-full text-center">{highlight.name}</span>
            </button>
          ))}
        </div>
      )}

      {(groups.length > 0 || isAdmin) && (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {isAdmin && (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex flex-col items-center gap-1 shrink-0 w-16 cursor-pointer"
            >
              <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-landing-border text-landing-muted hover:text-primary hover:border-primary transition-colors">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-xs text-landing-muted">{t('add')}</span>
            </button>
          )}

          {groups.map((group, index) => (
            <button
              key={group.key}
              onClick={() => setViewerTarget({ kind: 'group', index })}
              className="flex flex-col items-center gap-1 shrink-0 w-16 cursor-pointer"
            >
              <span
                className={cn(
                  "flex size-14 p-0.5 ring-2",
                  group.isLabeled ? "rounded-2xl" : "rounded-full",
                  group.allViewed ? "ring-landing-border" : "ring-primary"
                )}
              >
                <BubbleThumb
                  imageUrl={bubbleImageFor(group.stories[0])}
                  fallbackLabel={group.title}
                  fallbackIsVideo={group.stories[0]?.mime_type?.startsWith('video/')}
                  rounded={group.isLabeled ? '2xl' : 'full'}
                />
              </span>
              <span className="text-xs text-landing-muted truncate w-full text-center">{group.title}</span>
            </button>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateStoryModal
          babyId={babyId}
          circles={circles}
          existingGroupLabels={existingGroupLabels}
          onClose={() => setCreateOpen(false)}
          onCreated={refresh}
        />
      )}

      {viewerTarget && (
        <StoryViewer
          babyId={babyId}
          isAdmin={isAdmin}
          circles={circles}
          existingGroupLabels={existingGroupLabels}
          highlights={highlights}
          groups={groups}
          target={viewerTarget}
          onClose={() => setViewerTarget(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}
