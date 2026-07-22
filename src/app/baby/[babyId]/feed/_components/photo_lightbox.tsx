'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@utils/utils'
import { PostPhotoWithUrl } from '@utils/actions/posts'

const SWIPE_THRESHOLD = 50

export default function PhotoLightbox({
  photos,
  initialIndex,
  alt,
  onClose,
}: {
  photos: PostPhotoWithUrl[]
  initialIndex: number
  alt: string
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const touchStartX = useRef<number | null>(null)

  const goPrev = () => setIndex((i) => Math.max(0, i - 1))
  const goNext = () => setIndex((i) => Math.min(photos.length - 1, i + 1))

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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (delta > SWIPE_THRESHOLD) goPrev()
    else if (delta < -SWIPE_THRESHOLD) goNext()
    touchStartX.current = null
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-black/95 z-50 flex flex-col animate-in fade-in-0 duration-200">
      <div className="flex justify-between items-center px-4 py-3 shrink-0">
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
        className="relative flex-1 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {photos.map((photo) => (
            <div key={photo.id} className="w-full h-full shrink-0 flex items-center justify-center">
              {photo.url && (
                photo.mime_type?.startsWith('video/') ? (
                  <video
                    src={photo.url}
                    controls
                    playsInline
                    className="max-w-full max-h-full object-contain select-none"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.url}
                    alt={alt}
                    className="max-w-full max-h-full object-contain select-none"
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
              onClick={() => setIndex(i)}
              className={cn(
                "h-1.5 rounded-full transition-all cursor-pointer",
                i === index ? "w-4 bg-white" : "w-1.5 bg-white/30"
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
