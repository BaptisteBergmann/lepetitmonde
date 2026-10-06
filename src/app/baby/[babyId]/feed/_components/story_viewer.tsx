'use client'

import { ConfirmProvider, useConfirm } from '@/components/confirm_provider'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X, ChevronLeft, ChevronRight, Eye, Loader2, Pause, Pencil, Play, Plus as PlusIcon, Sparkles, Trash2, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@utils/utils'
import { logger } from '@/utils/logger'
import { formatNamesPreview } from '@utils/users'
import { StoryGroup, StoryWithUrl, StoryViewsData, markStoryViewed, getStoryViews, deleteStory } from '@utils/actions/stories'
import { HighlightWithStories, createHighlight, addStoryToHighlight } from '@utils/actions/story_highlights'
import { Tables } from '@utils/supabase/database.types'
import StoryReactionPicker from './story_reaction_picker'
import EditStoryModal from './edit_story_modal'
import type { ViewerTarget } from './story_tray'
import { FEED_LIMITS } from '@utils/feed-limits'

type Circle = Tables<'circles'>

const PHOTO_DURATION_MS = 5000
// Press-and-hold pauses without navigating; anything shorter is a tap.
const HOLD_THRESHOLD_MS = 200
// Tap zones, as a fraction of screen width: left → prev, right → next,
// the middle band in between → toggle pause.
const LEFT_ZONE = 0.3
const RIGHT_ZONE = 0.7

const viewerIconButton = "p-1.5 pointer-coarse:p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer touch-target relative outline-none focus-visible:ring-2 focus-visible:ring-white/70"

type StoryViewerProps = {
  babyId: string
  isAdmin: boolean
  circles: Circle[]
  existingGroupLabels: string[]
  highlights: HighlightWithStories[]
  groups: StoryGroup[]
  target: ViewerTarget
  onClose: () => void
  onChanged: () => void
}

// Dialog shell: Base UI gives the focus trap + restore, scroll lock and a
// layered Escape (an open reaction Popover, Select, EditStoryModal or
// confirm closes first, and only then the viewer).
export default function StoryViewer(props: StoryViewerProps) {
  const { onClose } = props
  const tA11y = useTranslations('a11y')
  const containerRef = useRef<HTMLDivElement>(null)

  // Wraps onClose: a tap on the advance/pause zones is handled on
  // `pointerup`, one event before the browser's own synthesized "click" for
  // that same tap. When that tap is what closes the viewer (goNext on the
  // last story), the overlay can already be unmounted by the time the click
  // fires, so it falls through to whatever feed post is underneath and opens
  // its lightbox. Swallowing exactly one click right after any close — no
  // matter what triggered it — stops that stray click regardless of the
  // precise browser timing that produces it.
  const closeViewer = useCallback(() => {
    const swallowNextClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('click', swallowNextClick, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallowNextClick, { capture: true }), 500)
    onClose()
  }, [onClose])

  // The popup is full-screen, so the only possible "outside" presses are on
  // things like toasts: never let those dismiss the viewer.
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open, details) => {
        if (open) return
        // Escape while typing a highlight name would lose the text: keep the
        // viewer open (it's controlled) until the field is empty.
        const target = details.reason === 'escape-key' ? details.event.target : null
        if (target instanceof HTMLInputElement && target.value.trim()) return
        closeViewer()
      }}
      disablePointerDismissal
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup
          ref={containerRef}
          initialFocus={containerRef}
          aria-label={tA11y('storyViewer')}
          tabIndex={-1}
          className="fixed inset-0 w-full h-full bg-black z-[60] flex flex-col animate-in fade-in-0 duration-200 motion-reduce:animate-none outline-none"
        >
          {/* Own provider so the delete confirm renders inside this dialog's
              tree; the page-level one would count as an outside interaction. */}
          <ConfirmProvider>
            <StoryViewerBody {...props} closeViewer={closeViewer} />
          </ConfirmProvider>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function StoryViewerBody({
  babyId,
  isAdmin,
  circles,
  existingGroupLabels,
  highlights,
  groups,
  target,
  onClose,
  onChanged,
  closeViewer,
}: StoryViewerProps & { closeViewer: () => void }) {
  const t = useTranslations('feed')
  const tA11y = useTranslations('a11y')
  const confirmAction = useConfirm()
  const isHighlight = target.kind === 'highlight'
  const targetId = target.kind === 'highlight' ? target.id : target.key
  const source = useMemo(
    () => isHighlight
      ? highlights.find((h) => h.id === targetId)
      : groups.find((g) => g.key === targetId),
    [isHighlight, highlights, groups, targetId]
  )
  // Stable reference across renders (not just across navigation) — the `?? []`
  // fallback would otherwise hand back a fresh empty array every render,
  // which defeats the neighbor-preload effect's dependency check below.
  const stories: StoryWithUrl[] = useMemo(() => source?.stories ?? [], [source])
  const title = !source ? '' : 'name' in source ? source.name : source.title

  // Resume where the user left off: land on the first unseen story in the
  // group rather than always restarting at 0. Highlights have no view-
  // tracking (see the reset effect below), so they always start at 0.
  // StoryViewer is only ever mounted fresh when a bubble is tapped
  // (story_tray.tsx renders it conditionally with no `key`), so a lazy
  // initializer is enough — it never needs to react to `target` changing
  // under an already-mounted instance.
  const [index, setIndex] = useState(() => {
    if (isHighlight) return 0
    if (target.storyId) {
      const targetIndex = stories.findIndex((s) => s.id === target.storyId)
      if (targetIndex !== -1) return targetIndex
    }
    const firstUnseen = stories.findIndex((s) => !s.viewed)
    return firstUnseen === -1 ? 0 : firstUnseen
  })
  // Momentary pause from press-and-hold; resets on release.
  const [holdPaused, setHoldPaused] = useState(false)
  // Sticky pause toggled by a tap in the middle zone; resets when the
  // story changes so autoplay resumes automatically on next/prev.
  const [manuallyPaused, setManuallyPaused] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [highlightPickerOpen, setHighlightPickerOpen] = useState(false)
  // The highlight picker counts as a pause: otherwise the photo timer
  // advances (and the reset effect closes the picker) mid-typing.
  const paused = holdPaused || manuallyPaused || confirming || editing || highlightPickerOpen
  const [videoProgress, setVideoProgress] = useState(0)
  const [views, setViews] = useState<StoryViewsData | null>(null)
  const [newHighlightName, setNewHighlightName] = useState("")
  const [highlightSaving, setHighlightSaving] = useState(false)
  // Start muted so autoplay is allowed; the choice then sticks for the rest
  // of this viewer session (deliberately not reset on navigation).
  const [muted, setMuted] = useState(true)
  // The browser refused to autoplay (e.g. iOS Low Power Mode): show an
  // explicit "Play video" control instead of a silently frozen frame.
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasHeld = useRef(false)

  const story = stories[index]
  // Primitive deps for the effects below: a refetch (onChanged) hands back
  // new story objects for the same story, which must not reset the viewer.
  const storyId = story?.id
  const storyCreatedBy = story?.created_by ?? null
  const storyIsVideo = story?.mime_type.startsWith('video/') ?? false

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i >= stories.length - 1) {
        closeViewer()
        return i
      }
      return i + 1
    })
  }, [stories.length, closeViewer])

  // Escape is left to the Dialog so the topmost layer closes first.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The delete-confirm dialog / edit modal own the keyboard while open.
      if (confirming || editing) return
      // Typing in the highlight name field: arrows move the caret instead of
      // navigating. Arrows inside the reaction popover belong to it too.
      const el = e.target
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return
      if (el instanceof Element && el.closest('[data-slot="popover-content"]')) return
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goPrev, goNext, confirming, editing])

  // "Seen" tracking is an ephemeral-stories concept — highlight-sourced
  // items skip markStoryViewed entirely. The resets below are re-derived
  // from the current story on every navigation, same pattern as the
  // file-list reset in use-supabase-upload.ts.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVideoProgress(0)
    setViews(null)
    setHighlightPickerOpen(false)
    setManuallyPaused(false)
    setEditing(false)
    setNeedsTapToPlay(false)
    if (!storyId) return
    if (!isHighlight) {
      markStoryViewed(storyId, babyId)
    }
    if (isAdmin) {
      getStoryViews(storyId, babyId, storyCreatedBy).then(setViews)
    }
  }, [storyId, storyCreatedBy, babyId, isAdmin, isHighlight])

  // The group/highlight disappeared on refetch (e.g. its last story expired
  // or was deleted): close instead of staying mounted with nothing to show.
  useEffect(() => {
    if (!source) onClose()
  }, [source, onClose])

  // Every story's media goes through this app's own storage proxy (auth
  // check + DB access check + an upstream fetch to Supabase Storage on every
  // request — see api/storage/[babyId]/[...path]/route.ts), so navigating
  // starts that whole round trip from zero. Warm the browser's HTTP cache for
  // the adjacent stories while the current one is showing, so by the time
  // the user actually taps next/prev the response the proxy set an immutable
  // Cache-Control on is already sitting in cache.
  useEffect(() => {
    const controller = new AbortController()
    const neighborUrls = [stories[index + 1]?.url, stories[index - 1]?.url]
      .filter((url): url is string => !!url)
    for (const url of neighborUrls) {
      fetch(url, { cache: 'force-cache', signal: controller.signal }).catch(() => {})
    }
    return () => controller.abort()
  }, [index, stories])

  useEffect(() => {
    if (!storyId || storyIsVideo) return
    if (paused) return
    const timeout = setTimeout(goNext, PHOTO_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [storyId, storyIsVideo, paused, goNext])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (paused) video.pause()
    else video.play().catch((err: unknown) => {
      // AbortError just means a pause/navigation interrupted play(); only a
      // policy refusal needs the manual play control.
      if (err instanceof DOMException && err.name === 'NotAllowedError') setNeedsTapToPlay(true)
    })
  }, [paused, index])

  if (!story) return null

  const isVideo = story.mime_type.startsWith('video/')

  const handlePointerDown = (e: React.PointerEvent) => {
    // Tap navigation acts on pointerup, one event before the browser's own
    // synthesized "click" for a touch tap. If that tap just closed the
    // viewer (goNext on the last story), the overlay is already unmounted
    // by the time the click fires, so it falls through to the feed post
    // underneath. preventDefault on a touch pointerdown tells the browser to
    // skip that compatibility click entirely for this gesture.
    if (e.pointerType === 'touch') e.preventDefault()
    wasHeld.current = false
    holdTimer.current = setTimeout(() => {
      wasHeld.current = true
      setHoldPaused(true)
    }, HOLD_THRESHOLD_MS)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    if (wasHeld.current) {
      setHoldPaused(false)
      return
    }
    const ratio = e.clientX / window.innerWidth
    if (ratio < LEFT_ZONE) goPrev()
    else if (ratio > RIGHT_ZONE) goNext()
    else setManuallyPaused((v) => !v)
  }

  const handleAddToHighlight = async (highlightId: string, name: string) => {
    if (highlightSaving) return
    const contextLogger = logger.child({ function: 'StoryViewer.handleAddToHighlight', babyId, storyId: story.id, highlightId })
    setHighlightSaving(true)
    try {
      await addStoryToHighlight(highlightId, story.id, babyId)
      toast.success(t('storyViewer.addedToHighlight', { name }))
      setHighlightPickerOpen(false)
      onChanged()
    } catch (err) {
      contextLogger.error(err, 'Error adding story to highlight')
      toast.error(t('storyViewer.highlightError'))
    } finally {
      setHighlightSaving(false)
    }
  }

  const handleCreateHighlight = async () => {
    const name = newHighlightName.trim()
    if (!name || highlightSaving) return
    const contextLogger = logger.child({ function: 'StoryViewer.handleCreateHighlight', babyId, storyId: story.id })
    setHighlightSaving(true)
    try {
      await createHighlight(babyId, name, story.id)
      toast.success(t('storyViewer.addedToHighlight', { name }))
      setNewHighlightName("")
      setHighlightPickerOpen(false)
      onChanged()
    } catch (err) {
      // Keep the picker open with the typed name so Enter retries.
      contextLogger.error(err, 'Error creating highlight')
      toast.error(t('storyViewer.highlightError'))
    } finally {
      setHighlightSaving(false)
    }
  }

  const handleDelete = async () => {
    setConfirming(true)
    const confirmed = await confirmAction(t('storyViewer.deleteConfirm'))
    setConfirming(false)
    if (!confirmed) return
    const contextLogger = logger.child({ function: 'StoryViewer.handleDelete', babyId, storyId: story.id })
    try {
      await deleteStory(story.id, babyId)
    } catch (err) {
      contextLogger.error(err, 'Error deleting story')
      toast.error(t('storyViewer.deleteError'))
      return
    }
    onChanged()
    goNext()
  }

  const handleTapToPlay = () => {
    setNeedsTapToPlay(false)
    setManuallyPaused(false)
    videoRef.current?.play().catch(() => setNeedsTapToPlay(true))
  }

  return (
    <>
      <div className="flex gap-1 px-3 pt-3 shrink-0" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        {stories.map((s, i) => (
          <div key={s.id} className="h-0.5 flex-1 rounded-full bg-white/25 overflow-hidden">
            <div
              className={cn("h-full bg-white", i < index && "w-full", i > index && "w-0")}
              style={
                i === index
                  ? isVideo
                    ? { width: `${videoProgress}%` }
                    : {
                      width: '100%',
                      animation: `story-progress ${PHOTO_DURATION_MS}ms linear forwards`,
                      animationPlayState: paused ? 'paused' : 'running',
                    }
                  : undefined
              }
            />
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center gap-2 px-4 py-2.5 shrink-0 text-white">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
        <div className="flex items-center gap-1 shrink-0">
          {isAdmin && !isHighlight && (
            <button
              type="button"
              aria-label={t('storyViewer.addToHighlights')}
              onClick={() => setHighlightPickerOpen((v) => !v)}
              className={viewerIconButton}
            >
              <Sparkles className="h-4.5 w-4.5" />
            </button>
          )}
          {isAdmin && !isHighlight && (
            <button
              type="button"
              aria-label={tA11y('edit')}
              onClick={() => setEditing(true)}
              className={viewerIconButton}
            >
              <Pencil className="h-4.5 w-4.5" />
            </button>
          )}
          {isAdmin && !isHighlight && (
            <button
              type="button"
              aria-label={tA11y('delete')}
              onClick={handleDelete}
              className={viewerIconButton}
            >
              <Trash2 className="h-4.5 w-4.5" />
            </button>
          )}
          {isVideo && (
            <button
              type="button"
              aria-label={tA11y('mute')}
              aria-pressed={muted}
              onClick={() => setMuted((v) => !v)}
              className={viewerIconButton}
            >
              {muted ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
            </button>
          )}
          <button
            type="button"
            aria-label={tA11y('pause')}
            aria-pressed={manuallyPaused}
            onClick={() => setManuallyPaused((v) => !v)}
            className={viewerIconButton}
          >
            {manuallyPaused ? <Play className="h-4.5 w-4.5" /> : <Pause className="h-4.5 w-4.5" />}
          </button>
          <button
            type="button"
            aria-label={tA11y('close')}
            onClick={closeViewer}
            className={viewerIconButton}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {editing && !isHighlight && (
        <EditStoryModal
          babyId={babyId}
          story={story}
          circles={circles}
          existingGroupLabels={existingGroupLabels}
          onClose={() => setEditing(false)}
          // A saved edit can change the group label, which moves the story
          // to a different tray bubble (see the `byKey` grouping in
          // getActiveStories), and this viewer is targeted by group key.
          // Simplest safe move: close the viewer and let the refreshed tray
          // render; the user can re-open whichever bubble the story landed in.
          onSaved={() => { onChanged(); onClose() }}
        />
      )}

      {highlightPickerOpen && (
        <div className="mx-4 mb-2 p-3 rounded-2xl bg-white/10 text-white space-y-2 shrink-0">
          <p className="text-xs uppercase tracking-wider text-white/60">{t('storyViewer.addToHighlights')}</p>
          {highlights.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {highlights.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  disabled={highlightSaving}
                  onClick={() => handleAddToHighlight(h.id, h.name)}
                  className="inline-flex items-center min-h-9 px-3 rounded-full bg-white/15 hover:bg-white/25 text-sm text-white cursor-pointer transition-colors touch-target relative outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50"
                >
                  {h.name}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              handleCreateHighlight()
            }}
          >
            <input
              type="text"
              value={newHighlightName}
              maxLength={FEED_LIMITS.highlightName}
              onChange={(e) => setNewHighlightName(e.target.value)}
              placeholder={t('storyViewer.newHighlightPlaceholder')}
              aria-label={t('storyViewer.newHighlightLabel')}
              className="h-10 flex-1 min-w-0 rounded-xl bg-white/10 px-3 text-base md:text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            />
            <button
              type="submit"
              aria-label={tA11y('createHighlight')}
              disabled={highlightSaving || !newHighlightName.trim()}
              className="size-10 shrink-0 inline-flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 touch-target relative"
            >
              {highlightSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
            </button>
          </form>
        </div>
      )}

      <div
        className="relative flex-1 overflow-hidden select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {/* `key={story.id}` on both branches: without it React reuses the
            same DOM node across a story change and just swaps `src`, and the
            browser keeps painting the *previous* frame until the new one
            decodes — a stale-image flash even when the new media is already
            cached. Keying by story forces a real mount, so the gap shows the
            viewer's own black background instead. */}
        {isVideo ? (
          <video
            key={story.id}
            ref={videoRef}
            src={story.url}
            poster={story.thumbnailUrl ?? undefined}
            autoPlay
            muted={muted}
            playsInline
            className="w-full h-full object-contain"
            onTimeUpdate={(e) => {
              const el = e.currentTarget
              if (el.duration) setVideoProgress((el.currentTime / el.duration) * 100)
            }}
            onEnded={goNext}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={story.id}
            src={story.url}
            alt={story.caption ?? ""}
            className="w-full h-full object-contain"
            draggable={false}
          />
        )}

        {manuallyPaused && !needsTapToPlay && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
            <span className="flex size-16 items-center justify-center rounded-full bg-black/40 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
              <Play className="h-8 w-8 text-white fill-white" />
            </span>
          </div>
        )}

        {isVideo && needsTapToPlay && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); handleTapToPlay() }}
              className="pointer-events-auto inline-flex h-12 items-center gap-2 rounded-full bg-black/60 px-5 text-sm font-medium text-white backdrop-blur-sm hover:bg-black/70 outline-none focus-visible:ring-2 focus-visible:ring-white/70 cursor-pointer"
            >
              <Play className="h-5 w-5 fill-white" />
              {tA11y('playVideo')}
            </button>
          </div>
        )}

        {/* The tap zone acts on pointerup, which bubbles before the click
            fires — stopping only the click let one mouse click navigate twice. */}
        <button
          aria-label={tA11y('previous')}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          type="button"
          disabled={index === 0}
          className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 flex items-center justify-center size-9 sm:size-auto sm:p-2 rounded-full bg-black/30 sm:bg-black/40 text-white/70 sm:text-white/80 hover:text-white hover:bg-black/60 transition-colors cursor-pointer disabled:opacity-0 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-white/70 touch-target"
        >
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
        <button
          aria-label={tA11y('next')}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); goNext() }}
          type="button"
          className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 flex items-center justify-center size-9 sm:size-auto sm:p-2 rounded-full bg-black/30 sm:bg-black/40 text-white/70 sm:text-white/80 hover:text-white hover:bg-black/60 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/70 touch-target"
        >
          <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      </div>

      <div
        className="shrink-0 px-4 pt-3 space-y-3"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {story.caption && (
          <p className="max-h-[30dvh] overflow-y-auto overscroll-contain text-sm text-white whitespace-pre-wrap">{story.caption}</p>
        )}

        <StoryReactionPicker
          storyId={story.id}
          babyId={babyId}
          initialReactions={story.reactions}
          onChanged={onChanged}
        />

        {isAdmin && !isHighlight && views && (
          <div className="flex items-center gap-1.5 text-xs text-white/70">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            {views.count > 0 ? (
              <span>{t('seenByNames', { names: formatNamesPreview(views.names) })}</span>
            ) : (
              <span>{t('nobodyYet')}</span>
            )}
          </div>
        )}
      </div>
    </>
  )
}
