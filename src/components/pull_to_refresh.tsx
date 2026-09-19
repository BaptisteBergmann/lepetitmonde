'use client'

import { useCallback, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { cn } from '@utils/utils'

const PULL_THRESHOLD = 70
const MAX_PULL = 110
const RESISTANCE = 0.4

export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const iconRef = useRef<SVGSVGElement>(null)
  const touchStartY = useRef<number | null>(null)
  const pulling = useRef(false)
  const pullDistance = useRef(0)
  const frame = useRef<number | null>(null)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // isPending stays true until the router.refresh() RSC payload lands, so it
  // doubles as our "refreshing" flag — no extra state/effect needed to clear it.
  const refreshing = isPending

  // The drag is driven imperatively (transform on a ref) rather than through
  // React state + an animated `height`: changing height re-lays-out the whole
  // page on every touchmove, which is what made the pull janky on heavy pages
  // like the journal feed. A transform is composited and skips layout.
  const applyOffset = useCallback((distance: number, animate: boolean) => {
    const content = contentRef.current
    const indicator = indicatorRef.current
    const icon = iconRef.current
    if (!content || !indicator || !icon) return

    // Nothing to animate from: skip, otherwise no transitionend fires and the
    // transform would never get cleared.
    if (distance === 0 && !content.style.transform) animate = false
    content.style.transition = animate ? 'transform 200ms ease-out' : 'none'
    // At rest the transform must be removed entirely: any transform (even
    // translateY(0)) makes this wrapper the containing block for the
    // `fixed` modals/lightbox rendered inside `children`.
    content.style.transform = distance === 0 && !animate ? '' : `translateY(${distance}px)`
    content.style.willChange = distance === 0 ? '' : 'transform'

    const progress = Math.min(distance / PULL_THRESHOLD, 1)
    indicator.style.opacity = String(progress)
    icon.style.transform = `rotate(${progress * 180}deg)`
  }, [])

  const scheduleOffset = (distance: number) => {
    pullDistance.current = distance
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      applyOffset(pullDistance.current, false)
    })
  }

  const cancelScheduledOffset = () => {
    if (frame.current === null) return
    cancelAnimationFrame(frame.current)
    frame.current = null
  }

  useEffect(() => {
    applyOffset(refreshing ? PULL_THRESHOLD : 0, true)
  }, [refreshing, applyOffset])

  // preventDefault() on touchmove only works via a non-passive native listener,
  // React's synthetic onTouchMove is registered passive and can't stop native scroll.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || touchStartY.current === null) return
      const delta = e.touches[0].clientY - touchStartY.current
      if (delta <= 0) {
        // Don't cancel the gesture here: a single noisy touchmove sample can
        // report delta <= 0 right at the start of a real downward swipe. Just
        // collapse the indicator; `pulling` stays true so tracking resumes if
        // the finger keeps moving down. It only ends on touchend/touchcancel.
        scheduleOffset(0)
        return
      }
      e.preventDefault()
      scheduleOffset(Math.min(delta * RESISTANCE, MAX_PULL))
    }

    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      el.removeEventListener('touchmove', onTouchMove)
      cancelScheduledOffset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTouchStart = (e: React.TouchEvent) => {
    if (refreshing) return
    // Only start tracking when the page is scrolled to the very top, and not
    // while a full-screen overlay (lightbox/modals all use `fixed inset-0`) is open.
    if (window.scrollY > 0 || (e.target as HTMLElement).closest('.fixed.inset-0')) {
      touchStartY.current = null
      return
    }
    touchStartY.current = e.touches[0].clientY
    pulling.current = true
    pullDistance.current = 0
  }

  const handleTouchEnd = () => {
    if (!pulling.current) return
    pulling.current = false
    touchStartY.current = null
    cancelScheduledOffset()

    if (pullDistance.current >= PULL_THRESHOLD) {
      // Hold at the threshold while the refresh runs; the `refreshing` effect
      // releases it back to 0 once the RSC payload lands.
      applyOffset(PULL_THRESHOLD, true)
      startTransition(() => {
        router.refresh()
      })
    } else {
      applyOffset(0, true)
    }
    pullDistance.current = 0
  }

  const handleTouchCancel = () => {
    pulling.current = false
    touchStartY.current = null
    pullDistance.current = 0
    cancelScheduledOffset()
    applyOffset(0, true)
  }

  // Drop the transform once the settle-to-rest animation ends (see applyOffset).
  const handleTransitionEnd = () => {
    if (pullDistance.current === 0 && !pulling.current && !refreshing) applyOffset(0, false)
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      <div
        ref={indicatorRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-0 flex items-center justify-center opacity-0"
        style={{ height: PULL_THRESHOLD }}
      >
        <RefreshCw ref={iconRef} className={cn('h-5 w-5 text-primary', refreshing && 'animate-spin')} />
      </div>
      {/* No z-index here: it would create a stacking context that traps the
          `fixed z-50` story viewer/modals below the app header and nav. DOM
          order alone keeps this above the indicator. */}
      <div ref={contentRef} className="relative" onTransitionEnd={handleTransitionEnd}>
        {children}
      </div>
    </div>
  )
}
