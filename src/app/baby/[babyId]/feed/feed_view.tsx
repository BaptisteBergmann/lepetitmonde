'use client'

import { useState } from 'react'
import { Tables } from '@utils/supabase/database.types'
import { PostWithDetails, getPosts } from '@utils/actions/posts'
import { StoryAuthorGroup } from '@utils/actions/stories'
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
  initialPosts,
  pageSize,
  initialHighlights,
  initialStories,
}: {
  babyId: string
  isAdmin: boolean
  currentUserId: string | null
  circles: Circle[]
  initialPosts: PostWithDetails[]
  pageSize: number
  initialHighlights: HighlightWithStories[]
  initialStories: StoryAuthorGroup[]
}) {
  const [posts, setPosts] = useState<PostWithDetails[]>(initialPosts)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialPosts.length === pageSize)
  const [createOpen, setCreateOpen] = useState(false)

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
            <span>Nouvelle publication</span>
          </Button>
        </div>
      )}

      {posts.length === 0 && (
        <p className="text-sm text-landing-muted text-center py-12">
          Aucune publication pour l&apos;instant.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <PostCard key={post.id} babyId={babyId} post={post} circles={circles} isAdmin={isAdmin} currentUserId={currentUserId} />
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
            <span>Charger plus</span>
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
