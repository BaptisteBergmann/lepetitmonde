'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@utils/utils'

// Structural — any photo-with-resolved-url shape works here (post photos,
// album photos, ...), not just `PostPhotoWithUrl`.
export type LightboxPhoto = {
  id: string
  url: string | null
  thumbnailUrl: string | null
  mime_type?: string | null
}

const SWIPE_THRESHOLD = 50
const MIN_SCALE = 1
const MAX_SCALE = 4
const DOUBLE_TAP_ZOOM = 2.5
const DOUBLE_TAP_DELAY_MS = 300
const TAP_MOVE_THRESHOLD = 10

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function distance(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

export default function PhotoLightbox({
  photos,
  initialIndex,
  alt,
  onClose,
}: {
  photos: LightboxPhoto[]
  initialIndex: number
  alt: string
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const touchStartX = useRef<number | null>(null)

  const imageAreaRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(1)
  const pinchStartDistance = useRef<number | null>(null)
  const pinchStartScale = useRef(1)
  const panStart = useRef<{ x: number; y: number } | null>(null)
  const translateStart = useRef({ x: 0, y: 0 })
  const tapInfo = useRef<{ x: number; y: number } | null>(null)
  const lastTapTime = useRef(0)

  const resetZoom = () => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }

  const goPrev = () => {
    setIndex((i) => Math.max(0, i - 1))
    resetZoom()
  }
  const goNext = () => {
    setIndex((i) => Math.min(photos.length - 1, i + 1))
    resetZoom()
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  const clampTranslate = (s: number, t: { x: number; y: number }) => {
    const el = imageAreaRef.current
    if (!el || s <= 1) return { x: 0, y: 0 }
    const maxX = (el.clientWidth * (s - 1)) / 2
    const maxY = (el.clientHeight * (s - 1)) / 2
    return { x: clamp(t.x, -maxX, maxX), y: clamp(t.y, -maxY, maxY) }
  }

  const zoomTo = (newScale: number) => {
    const clamped = clamp(newScale, MIN_SCALE, MAX_SCALE)
    setScale(clamped)
    setTranslate((t) => clampTranslate(clamped, clamped === MIN_SCALE ? { x: 0, y: 0 } : t))
  }

  // preventDefault() on touchmove only works via a non-passive native listener,
  // React's synthetic onTouchMove is registered passive and can't stop native scroll/zoom.
  useEffect(() => {
    const el = imageAreaRef.current
    if (!el) return

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDistance.current !== null) {
        e.preventDefault()
        const dist = distance(e.touches[0], e.touches[1])
        const newScale = clamp(
          pinchStartScale.current * (dist / pinchStartDistance.current),
          MIN_SCALE,
          MAX_SCALE
        )
        setScale(newScale)
        setTranslate((t) => clampTranslate(newScale, t))
      } else if (e.touches.length === 1 && panStart.current) {
        e.preventDefault()
        const dx = e.touches[0].clientX - panStart.current.x
        const dy = e.touches[0].clientY - panStart.current.y
        setTranslate(
          clampTranslate(scaleRef.current, {
            x: translateStart.current.x + dx,
            y: translateStart.current.y + dy,
          })
        )
      }
    }

    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchStartDistance.current = distance(e.touches[0], e.touches[1])
      pinchStartScale.current = scale
      panStart.current = null
      touchStartX.current = null
      return
    }
    if (e.touches.length === 1) {
      tapInfo.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      if (scale > 1) {
        panStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        translateStart.current = translate
        touchStartX.current = null
      } else {
        touchStartX.current = e.touches[0].clientX
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const wasPinching = pinchStartDistance.current !== null
    const wasPanning = panStart.current !== null
    pinchStartDistance.current = null
    panStart.current = null

    if (wasPinching) {
      if (scale <= 1) zoomTo(1)
      tapInfo.current = null
      return
    }
    if (wasPanning) {
      tapInfo.current = null
      return
    }

    if (tapInfo.current && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - tapInfo.current.x
      const dy = e.changedTouches[0].clientY - tapInfo.current.y
      if (Math.hypot(dx, dy) < TAP_MOVE_THRESHOLD) {
        const now = Date.now()
        if (now - lastTapTime.current < DOUBLE_TAP_DELAY_MS) {
          zoomTo(scale > 1 ? 1 : DOUBLE_TAP_ZOOM)
          lastTapTime.current = 0
          tapInfo.current = null
          touchStartX.current = null
          return
        }
        lastTapTime.current = now
      }
    }
    tapInfo.current = null

    if (touchStartX.current === null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (delta > SWIPE_THRESHOLD) goPrev()
    else if (delta < -SWIPE_THRESHOLD) goNext()
    touchStartX.current = null
  }

  // Portal to <body> so no ancestor stacking context can trap the overlay under the fixed header.
  return createPortal(
    <div className="fixed inset-0 w-full h-full bg-black/95 z-[60] flex flex-col animate-in fade-in-0 duration-200">
      <div className="flex justify-between items-center px-4 py-3 shrink-0" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        {photos.length > 1 ? (
          <span className="text-sm text-white/70">{index + 1} / {photos.length}</span>
        ) : <span />}
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={imageAreaRef}
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {photos.map((photo, i) => (
            <div key={photo.id} className="w-full h-full shrink-0 flex items-center justify-center">
              {/* Only the current slide plus its immediate neighbors actually mount
                  media — this row is fully rendered (all slides exist for the
                  swipe/translateX layout), but without this guard every photo's
                  full-res `url` would load immediately on open, not just the one
                  being viewed. */}
              {photo.url && Math.abs(i - index) <= 1 && (
                photo.mime_type?.startsWith('video/') ? (
                  <video
                    src={photo.url}
                    poster={photo.thumbnailUrl ?? undefined}
                    controls
                    playsInline
                    className="max-w-full max-h-full object-contain select-none"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.url}
                    alt={alt}
                    className={cn(
                      "max-w-full max-h-full object-contain select-none",
                      i === index && scale > 1 ? "" : "transition-transform duration-200 ease-out"
                    )}
                    style={
                      i === index
                        ? { transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)` }
                        : undefined
                    }
                    draggable={false}
                  />
                )
              )}
            </div>
          ))}
        </div>

        {photos.length > 1 && (
          <>
            <button
              onClick={goPrev}
              disabled={index === 0}
              className={cn(
                "absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-colors cursor-pointer disabled:opacity-0 disabled:pointer-events-none",
                "hidden sm:flex items-center justify-center"
              )}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={goNext}
              disabled={index === photos.length - 1}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-colors cursor-pointer disabled:opacity-0 disabled:pointer-events-none",
                "hidden sm:flex items-center justify-center"
              )}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {photos.length > 1 && (
        <div className="flex justify-center gap-1.5 py-3 shrink-0">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => { setIndex(i); resetZoom() }}
              className={cn(
                "h-1.5 rounded-full transition-all cursor-pointer",
                i === index ? "w-4 bg-white" : "w-1.5 bg-white/30"
              )}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}
