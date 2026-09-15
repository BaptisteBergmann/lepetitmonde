'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Tables } from '@utils/supabase/database.types'
import { PostWithDetails, getPosts } from '@utils/actions/posts'
import { StoryGroup } from '@utils/actions/stories'
import { HighlightWithStories } from '@utils/actions/story_highlights'
import { Button } from '@/components/ui/button'
import { Loader2, Plus } from 'lucide-react'
import PostCard from './_components/post_card'
import CreatePostModal from './_components/create_post_modal'
import StoryTray from './_components/story_tray'

type Circle = Tables<'circles'>

export default function FeedView({
  babyId,
  isAdmin,
  currentUserId,
  circles,
  circleMemberCounts,
  initialPosts,
  pageSize,
  initialHasMore,
  initialHighlights,
  initialStories,
  highlightPostId,
}: {
  babyId: string
  isAdmin: boolean
  currentUserId: string | null
  circles: Circle[]
  circleMemberCounts: Record<string, number>
  initialPosts: PostWithDetails[]
  pageSize: number
  initialHasMore: boolean
  initialHighlights: HighlightWithStories[]
  initialStories: StoryGroup[]
  highlightPostId?: string
}) {
  const t = useTranslations('feed')
  const [posts, setPosts] = useState<PostWithDetails[]>(initialPosts)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [createOpen, setCreateOpen] = useState(false)
  const [highlightedId, setHighlightedId] = useState(highlightPostId)
  const scrolledRef = useRef(false)

  // Scroll to and briefly highlight the post a notification deep-linked to.
  // Guarded to run at most once, so a later `loadMore` re-render (which also
  // changes `posts`) doesn't re-trigger the scroll.
  useEffect(() => {
    if (!highlightPostId || scrolledRef.current) return
    const el = document.getElementById(`post-${highlightPostId}`)
    if (!el) return
    scrolledRef.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timeout = setTimeout(() => setHighlightedId(undefined), 3000)
    return () => clearTimeout(timeout)
  }, [highlightPostId, posts])

  const loadMore = async () => {
    if (posts.length === 0) return
    setLoadingMore(true)
    try {
      const last = posts[posts.length - 1]
      const before = { takenAt: last.taken_at, createdAt: last.created_at }
      const next = await getPosts(babyId, { limit: pageSize, before })
      setPosts((prev) => [...prev, ...next])
      setHasMore(next.length === pageSize)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="relative space-y-4">
      <StoryTray
        babyId={babyId}
        isAdmin={isAdmin}
        circles={circles}
        initialHighlights={initialHighlights}
        initialStories={initialStories}
      />

      {isAdmin && (
        <div className="flex justify-end">
          <Button className="gap-2 rounded-2xl cursor-pointer" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>{t('newPost')}</span>
          </Button>
        </div>
      )}

      {posts.length === 0 && (
        <p className="text-sm text-landing-muted text-center py-12">
          {t('empty')}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            babyId={babyId}
            post={post}
            circles={circles}
            circleMemberCounts={circleMemberCounts}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            highlighted={post.id === highlightedId}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            className="gap-2 rounded-2xl cursor-pointer"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>{t('loadMore')}</span>
          </Button>
        </div>
      )}

      {createOpen && (
        <CreatePostModal
          babyId={babyId}
          circles={circles}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  )
}
