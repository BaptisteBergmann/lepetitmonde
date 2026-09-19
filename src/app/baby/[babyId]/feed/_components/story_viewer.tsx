'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, Eye, Plus as PlusIcon, Sparkles, Trash2 } from 'lucide-react'
import { cn } from '@utils/utils'
import { StoryGroup, StoryWithUrl, StoryViewsData, markStoryViewed, getStoryViews, deleteStory } from '@utils/actions/stories'
import { HighlightWithStories, createHighlight, addStoryToHighlight } from '@utils/actions/story_highlights'
import StoryReactionPicker from './story_reaction_picker'
import type { ViewerTarget } from './story_tray'

const PHOTO_DURATION_MS = 5000
// Press-and-hold pauses without navigating; anything shorter is a tap.
const HOLD_THRESHOLD_MS = 200
// Tap zones, as a fraction of screen width: left → prev, right → next,
// the middle band in between → toggle pause.
const LEFT_ZONE = 0.3
const RIGHT_ZONE = 0.7

export default function StoryViewer({
  babyId,
  isAdmin,
  highlights,
  groups,
  target,
  onClose,
  onChanged,
}: {
  babyId: string
  isAdmin: boolean
  highlights: HighlightWithStories[]
  groups: StoryGroup[]
  target: ViewerTarget
  onClose: () => void
  onChanged: () => void
}) {
  const t = useTranslations('feed')
  const isHighlight = target.kind === 'highlight'
  const stories: StoryWithUrl[] = isHighlight
    ? highlights[target.index]?.stories ?? []
    : groups[target.index]?.stories ?? []
  const title = isHighlight
    ? highlights[target.index]?.name ?? ''
    : groups[target.index]?.title ?? ''

  // Resume where the user left off: land on the first unseen story in the
  // group rather than always restarting at 0. Highlights have no view-
  // tracking (see the reset effect below), so they always start at 0.
  // StoryViewer is only ever mounted fresh when a bubble is tapped
  // (story_tray.tsx renders it conditionally with no `key`), so a lazy
  // initializer is enough — it never needs to react to `target` changing
  // under an already-mounted instance.
  const [index, setIndex] = useState(() => {
    if (isHighlight) return 0
    const firstUnseen = stories.findIndex((s) => !s.viewed)
    return firstUnseen === -1 ? 0 : firstUnseen
  })
  // Momentary pause from press-and-hold; resets on release.
  const [holdPaused, setHoldPaused] = useState(false)
  // Sticky pause toggled by a tap in the middle zone; resets when the
  // story changes so autoplay resumes automatically on next/prev.
  const [manuallyPaused, setManuallyPaused] = useState(false)
  const paused = holdPaused || manuallyPaused
  const [videoProgress, setVideoProgress] = useState(0)
  const [views, setViews] = useState<StoryViewsData | null>(null)
  const [highlightPickerOpen, setHighlightPickerOpen] = useState(false)
  const [newHighlightName, setNewHighlightName] = useState("")

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasHeld = useRef(false)

  const story = stories[index]

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i >= stories.length - 1) {
        onClose()
        return i
      }
      return i + 1
    })
  }, [stories.length, onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, goPrev, goNext])

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
    if (!story) return
    if (!isHighlight) {
      markStoryViewed(story.id, babyId)
    }
    if (isAdmin) {
      getStoryViews(story.id, babyId, story.created_by).then(setViews)
    }
  }, [story, babyId, isAdmin, isHighlight])

  useEffect(() => {
    if (!story || story.mime_type.startsWith('video/')) return
    if (paused) return
    const timeout = setTimeout(goNext, PHOTO_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [story, paused, goNext])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (paused) video.pause()
    else video.play().catch(() => {})
  }, [paused, index])

  if (!story) return null

  const isVideo = story.mime_type.startsWith('video/')

  const handlePointerDown = () => {
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

  const handleAddToHighlight = async (highlightId: string) => {
    await addStoryToHighlight(highlightId, story.id, babyId)
    setHighlightPickerOpen(false)
    onChanged()
  }

  const handleCreateHighlight = async () => {
    const name = newHighlightName.trim()
    if (!name) return
    await createHighlight(babyId, name, story.id)
    setNewHighlightName("")
    setHighlightPickerOpen(false)
    onChanged()
  }

  const handleDelete = async () => {
    if (!confirm(t('storyViewer.deleteConfirm'))) return
    await deleteStory(story.id, babyId)
    onChanged()
    goNext()
  }

  // Portal to <body> so no ancestor stacking context can trap the overlay under the fixed header.
  return createPortal(
    <div className="fixed inset-0 w-full h-full bg-black z-[60] flex flex-col animate-in fade-in-0 duration-200">
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

      <div className="flex justify-between items-center px-4 py-2.5 shrink-0 text-white">
        <span className="text-sm font-semibold truncate">{title}</span>
        <div className="flex items-center gap-1">
          {isAdmin && !isHighlight && (
            <button
              onClick={() => setHighlightPickerOpen((v) => !v)}
              className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              <Sparkles className="h-4.5 w-4.5" />
            </button>
          )}
          {isAdmin && !isHighlight && (
            <button
              onClick={handleDelete}
              className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              <Trash2 className="h-4.5 w-4.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {highlightPickerOpen && (
        <div className="mx-4 mb-2 p-3 rounded-2xl bg-white/10 text-white space-y-2 shrink-0">
          <p className="text-xs uppercase tracking-wider text-white/60">{t('storyViewer.addToHighlights')}</p>
          {highlights.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {highlights.map((h) => (
                <button
                  key={h.id}
                  onClick={() => handleAddToHighlight(h.id)}
                  className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-xs cursor-pointer transition-colors"
                >
                  {h.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newHighlightName}
              onChange={(e) => setNewHighlightName(e.target.value)}
              placeholder={t('storyViewer.newHighlightPlaceholder')}
              className="flex-1 bg-white/10 rounded-xl px-3 py-1.5 text-sm placeholder:text-white/40 focus:outline-none"
            />
            <button
              onClick={handleCreateHighlight}
              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 cursor-pointer transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div
        className="relative flex-1 overflow-hidden select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {isVideo ? (
          <video
            ref={videoRef}
            src={story.url}
            poster={story.thumbnailUrl ?? undefined}
            autoPlay
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
            src={story.url}
            alt={story.caption ?? ""}
            className="w-full h-full object-contain"
            draggable={false}
          />
        )}

        <button
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          disabled={index === 0}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-colors cursor-pointer disabled:opacity-0 disabled:pointer-events-none hidden sm:flex items-center justify-center"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); goNext() }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-colors cursor-pointer hidden sm:flex items-center justify-center"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {story.caption && (
        <p className="px-4 py-3 text-sm text-white shrink-0">{story.caption}</p>
      )}

      <div className={cn("px-4 shrink-0", story.caption ? "pb-3" : "pt-3 pb-3")}>
        <StoryReactionPicker
          storyId={story.id}
          babyId={babyId}
          initialReactions={story.reactions}
          onChanged={onChanged}
        />
      </div>

      {isAdmin && !isHighlight && views && (
        <div className="flex items-center gap-1.5 px-4 pb-4 text-white/70 text-xs shrink-0">
          <Eye className="h-3.5 w-3.5" />
          {views.count > 0 ? (
            <span>{t('seenByNames', { names: views.names.join(", ") })}</span>
          ) : (
            <span>{t('nobodyYet')}</span>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
