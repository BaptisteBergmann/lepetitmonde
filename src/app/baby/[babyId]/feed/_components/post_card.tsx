'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { getDateFnsLocale } from '@utils/formatting'
import { Tables } from '@utils/supabase/database.types'
import { PostWithDetails, deletePost } from '@utils/actions/posts'
import { getComments } from '@utils/actions/comments'
import { Trash2, Pencil, Loader2, Play, BarChart3, Share2 } from 'lucide-react'
import { cn } from '@utils/utils'
import { Badge } from '@components/ui/badge'
import CommentList from './comment_list'
import CommentInput from './comment_input'
import PhotoLightbox from './photo_lightbox'
import EditPostModal from './edit_post_modal'
import PostStatsModal from './post_stats_modal'
import ReactionPicker from './reaction_picker'
import PollVoter from './poll_voter'
import PostViews from './post_views'

type Circle = Tables<'circles'>

export default function PostCard({
  babyId,
  post,
  circles,
  circleMemberCounts,
  isAdmin,
  currentUserId,
  highlighted = false,
}: {
  babyId: string
  post: PostWithDetails
  circles: Circle[]
  circleMemberCounts: Record<string, number>
  isAdmin: boolean
  currentUserId: string | null
  highlighted?: boolean
}) {
  const router = useRouter()
  const t = useTranslations('feed')
  const dateFnsLocale = getDateFnsLocale(useLocale())
  const [deleting, setDeleting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [comments, setComments] = useState(post.comments)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const loadComments = useCallback(async () => {
    setComments(await getComments(post.id, babyId))
  }, [post.id, babyId])

  const handleDelete = async () => {
    if (!confirm(t('postCard.deleteConfirm'))) return

    setDeleting(true)
    try {
      await deletePost(post.id, babyId)
      router.refresh()
    } catch (err) {
      console.error(err)
      alert(t('postCard.deleteError'))
    } finally {
      setDeleting(false)
    }
  }

  const postCircles = post.circle_ids.map((id) => circles.find((c) => c.id === id))

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/baby/${babyId}/feed?postId=${post.id}`
    if (navigator.share) {
      try {
        await navigator.share({ url: shareUrl })
      } catch {
        // User cancelled the native share sheet — not an error.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success(t('postCard.linkCopied'))
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div
      id={`post-${post.id}`}
      className={cn(
        "rounded-3xl bg-landing-surface text-landing-foreground border border-landing-border shadow-sm overflow-hidden transition-shadow duration-700",
        highlighted && "ring-2 ring-primary ring-offset-2 ring-offset-landing-background"
      )}
    >
      {post.photos.length > 0 && (
        <div className={cn(
          "grid gap-0.5",
          post.photos.length === 1 ? "grid-cols-1" : "grid-cols-2"
        )}>
          {post.photos.map((photo, index) => (
            photo.url && (
              photo.mime_type?.startsWith('video/') ? (
                <div
                  key={photo.id}
                  onClick={() => setLightboxIndex(index)}
                  className="relative w-full aspect-square cursor-pointer contain-paint"
                >
                  <video
                    src={photo.url}
                    poster={photo.thumbnailUrl ?? undefined}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                    <div className="rounded-full bg-black/50 p-2.5">
                      <Play className="h-5 w-5 text-white fill-white" />
                    </div>
                  </div>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={photo.id}
                  src={photo.thumbnailUrl ?? photo.url}
                  alt={post.caption ?? ""}
                  onClick={() => setLightboxIndex(index)}
                  loading="lazy"
                  decoding="async"
                  className="w-full aspect-square object-cover cursor-pointer contain-paint"
                />
              )
            )
          ))}
        </div>
      )}

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={post.photos}
          initialIndex={lightboxIndex}
          alt={post.caption ?? ""}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {isEditing && (
        <EditPostModal
          babyId={babyId}
          post={post}
          circles={circles}
          onClose={() => setIsEditing(false)}
        />
      )}

      {statsOpen && (
        <PostStatsModal
          babyId={babyId}
          post={post}
          circles={circles}
          circleMemberCounts={circleMemberCounts}
          onClose={() => setStatsOpen(false)}
        />
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-landing-foreground capitalize">
              {format(parseISO(post.taken_at), 'EEEE d MMMM yyyy', { locale: dateFnsLocale })}
            </p>
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-1 mt-1">
                {postCircles.length > 0 ? (
                  postCircles.map((circle, index) => {
                    const isEmpty = !!circle && (circleMemberCounts[circle.id] ?? 0) === 0
                    return (
                      <Badge key={circle?.id ?? index} variant={isEmpty ? "destructive" : "secondary"}>
                        {circle?.name ?? t('circleFallback')}
                        {isEmpty && ` (${t('emptyCircleSuffix')})`}
                      </Badge>
                    )
                  })
                ) : (
                  <Badge variant="destructive">{t('adminOnly')}</Badge>
                )}
              </div>
            )}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleShare}
                title={t('postCard.shareTitle')}
                className="p-1.5 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setStatsOpen(true)}
                className="p-1.5 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-1.5 hover:bg-landing-background rounded-lg text-landing-muted hover:text-destructive transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </div>

        {post.caption && (
          <p className="text-sm text-landing-foreground whitespace-pre-wrap">{post.caption}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <ReactionPicker postId={post.id} babyId={babyId} initialReactions={post.reactions} />
          <PostViews postId={post.id} babyId={babyId} excludeUserId={post.created_by} isAdmin={isAdmin} initialViews={post.views} />
        </div>

        <PollVoter postId={post.id} babyId={babyId} initialPoll={post.poll} />

        <div className="border-t border-landing-border pt-3 space-y-3">
          <CommentList
            comments={comments}
            babyId={babyId}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onChanged={loadComments}
          />
          <CommentInput postId={post.id} babyId={babyId} onAdded={loadComments} />
        </div>
      </div>
    </div>
  )
}
