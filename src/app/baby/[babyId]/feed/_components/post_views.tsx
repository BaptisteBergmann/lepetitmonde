'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye } from 'lucide-react'
import { getPostViews, markPostViewed, PostViewsData } from '@utils/actions/views'
import { formatNamesPreview } from '@utils/users'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'

export default function PostViews({
  postId,
  babyId,
  excludeUserId,
  isAdmin,
  initialViews,
}: {
  postId: string
  babyId: string
  excludeUserId?: string | null
  isAdmin: boolean
  initialViews: PostViewsData
}) {
  const [views, setViews] = useState(initialViews)
  const [open, setOpen] = useState(false)
  // Always non-zero size (even with no children yet) so the IntersectionObserver
  // below has a real box to measure — a collapsed 0x0 target never reaches a
  // positive intersection ratio.
  const ref = useRef<HTMLDivElement>(null)

  // The "seen by" report is admin-only, but everyone's view still gets
  // recorded below — otherwise the report would have nothing to show.
  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        // Refetch just this post's count after a real view event — the
        // initial count already arrived as a prop with the rest of the feed.
        markPostViewed(postId, babyId).then(() => {
          if (isAdmin) getPostViews(postId, excludeUserId, babyId).then(setViews)
        })
      },
      { threshold: 0.6 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [postId, babyId, excludeUserId, isAdmin])

  return (
    <div ref={ref} className="inline-flex min-h-[1px] min-w-[1px] items-center">
      {isAdmin && views.count > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger className="flex items-center gap-1 h-7 px-2 rounded-full bg-landing-background text-landing-muted cursor-pointer hover:bg-landing-border hover:text-landing-foreground transition-colors">
            <Eye className="h-3.5 w-3.5" />
            <span className="text-xs">{views.count}</span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <p className="text-xs text-landing-foreground whitespace-nowrap">
              Vu par {formatNamesPreview(views.names)}
            </p>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
