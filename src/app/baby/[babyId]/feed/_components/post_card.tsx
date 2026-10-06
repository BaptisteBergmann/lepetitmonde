'use client'

import { useConfirm } from '@/components/confirm_provider'
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { getDateFnsLocale } from '@utils/formatting'
import { Tables } from '@utils/supabase/database.types'
import { PostWithDetails, deletePost } from '@utils/actions/posts'
import { getComments } from '@utils/actions/comments'
import { Trash2, Pencil, Loader2, Play, BarChart3, Share2, MoreHorizontal } from 'lucide-react'
import { cn } from '@utils/utils'
import { Badge } from '@components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import CommentList from './comment_list'
import CommentInput from './comment_input'
import PhotoLightbox from '@/components/photo_lightbox'
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
  const tA11y = useTranslations('a11y')
  const confirmAction = useConfirm()
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
    if (!(await confirmAction(t('postCard.deleteConfirm')))) return

    setDeleting(true)
    try {
      await deletePost(post.id, babyId)
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(t('postCard.deleteError'))
    } finally {
      setDeleting(false)
    }
  }

  // At most 4 tiles; the 4th carries a "+N" for the photos not shown at all.
  const MAX_TILES = 4
  const totalMedia = post.photos.length
  const visibleMedia = post.photos.slice(0, MAX_TILES)
  const hiddenCount = totalMedia - visibleMedia.length

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
    <article
      id={`post-${post.id}`}
      aria-labelledby={`post-${post.id}-date`}
      className={cn(
        "rounded-3xl bg-landing-surface text-landing-foreground border border-landing-border shadow-sm overflow-hidden transition-shadow duration-700",
        highlighted && "ring-2 ring-primary ring-offset-2 ring-offset-landing-background"
      )}
    >
      {post.photos.length > 0 && (
        <div className={cn(
          "grid gap-0.5",
          totalMedia === 1 ? "grid-cols-1" : "grid-cols-2"
        )}>
          {visibleMedia.map((photo, index) => {
            if (!photo.url) return null
            const isVideo = photo.mime_type?.startsWith('video/') ?? false
            const showMore = index === MAX_TILES - 1 && hiddenCount > 0
            const baseLabel = isVideo
              ? tA11y('playVideoNOfM', { n: index + 1, total: totalMedia })
              : tA11y('photoNOfM', { n: index + 1, total: totalMedia })
            return (
              <button
                key={photo.id}
                type="button"
                aria-label={showMore ? `${baseLabel}, ${tA11y('moreMedia', { count: hiddenCount })}` : baseLabel}
                onClick={() => setLightboxIndex(index)}
                className={cn(
                  "relative block w-full overflow-hidden bg-landing-background cursor-pointer contain-paint outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:opacity-90",
                  // 3 photos: a wide first tile keeps the block square, like a 2×2 grid.
                  totalMedia === 3 && index === 0 ? "col-span-2 aspect-[2/1]" : "aspect-square"
                )}
              >
                {isVideo ? (
                  <>
                    <video
                      src={photo.url}
                      poster={photo.thumbnailUrl ?? undefined}
                      muted
                      playsInline
                      preload={photo.thumbnailUrl ? 'none' : 'metadata'}
                      aria-hidden
                      className="h-full w-full object-cover"
                    />
                    {!showMore && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/10" aria-hidden>
                        <span className="rounded-full bg-black/50 p-2.5">
                          <Play className="h-5 w-5 text-white fill-white" />
                        </span>
                      </span>
                    )}
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.thumbnailUrl ?? photo.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                )}
                {showMore && (
                  <span
                    className="absolute inset-0 flex items-center justify-center bg-black/50 text-white font-display text-3xl font-semibold"
                    aria-hidden
                  >
                    +{hiddenCount}
                  </span>
                )}
              </button>
            )
          })}
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
            <h2 id={`post-${post.id}-date`} className="text-sm font-semibold text-landing-foreground capitalize">
              {format(parseISO(post.taken_at), 'EEEE d MMMM yyyy', { locale: dateFnsLocale })}
            </h2>
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
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label={tA11y('postActions')} />}
                disabled={deleting}
                className="-mr-1.5 -mt-1 shrink-0 rounded-xl text-landing-muted hover:bg-landing-background hover:text-landing-foreground aria-expanded:bg-landing-background aria-expanded:text-landing-foreground"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4.5 w-4.5" />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-48">
                <DropdownMenuItem onClick={handleShare} className="min-h-10 pointer-coarse:min-h-11 gap-3 px-3 cursor-pointer">
                  <Share2 className="text-muted-foreground" />
                  {t('postCard.share')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatsOpen(true)} className="min-h-10 pointer-coarse:min-h-11 gap-3 px-3 cursor-pointer">
                  <BarChart3 className="text-muted-foreground" />
                  {t('postCard.stats')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsEditing(true)} className="min-h-10 pointer-coarse:min-h-11 gap-3 px-3 cursor-pointer">
                  <Pencil className="text-muted-foreground" />
                  {t('postCard.edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} variant="destructive" className="min-h-10 pointer-coarse:min-h-11 gap-3 px-3 cursor-pointer">
                  <Trash2 />
                  {t('postCard.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
    </article>
  )
}
