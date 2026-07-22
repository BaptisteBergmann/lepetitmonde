'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { cn } from '@utils/utils'

const PULL_THRESHOLD = 70
const MAX_PULL = 110
const RESISTANCE = 0.4

export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [pullDistance, setPullDistance] = useState(0)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef<number | null>(null)
  const pulling = useRef(false)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // isPending stays true until the router.refresh() RSC payload lands, so it
  // doubles as our "refreshing" flag — no extra state/effect needed to clear it.
  const refreshing = isPending
  const height = refreshing ? PULL_THRESHOLD : pullDistance

  // preventDefault() on touchmove only works via a non-passive native listener,
  // React's synthetic onTouchMove is registered passive and can't stop native scroll.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || touchStartY.current === null) return
      const delta = e.touches[0].clientY - touchStartY.current
      if (delta <= 0) {
        pulling.current = false
        setDragging(false)
        setPullDistance(0)
        return
      }
      e.preventDefault()
      setPullDistance(Math.min(delta * RESISTANCE, MAX_PULL))
    }

    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
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
    setDragging(true)
  }

  const handleTouchEnd = () => {
    if (!pulling.current) return
    pulling.current = false
    touchStartY.current = null
    setDragging(false)

    if (pullDistance >= PULL_THRESHOLD) {
      startTransition(() => {
        router.refresh()
      })
    }
    setPullDistance(0)
  }

  return (
    <div ref={containerRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div
        className={cn(
          'flex items-center justify-center overflow-hidden',
          !dragging && 'transition-[height] duration-200 ease-out'
        )}
        style={{ height }}
      >
        <RefreshCw
          className={cn('h-5 w-5 text-primary', refreshing && 'animate-spin')}
          style={
            !refreshing
              ? { transform: `rotate(${(pullDistance / PULL_THRESHOLD) * 180}deg)` }
              : undefined
          }
        />
      </div>
      {children}
    </div>
  )
}
