'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Tables } from '@utils/supabase/database.types'
import { PostWithDetails, deletePost } from '@utils/actions/posts'
import { getComments } from '@utils/actions/comments'
import { Trash2, Pencil, Loader2, Play } from 'lucide-react'
import { cn } from '@utils/utils'
import { Badge } from '@components/ui/badge'
import CommentList from './comment_list'
import CommentInput from './comment_input'
import PhotoLightbox from './photo_lightbox'
import EditPostModal from './edit_post_modal'
import ReactionPicker from './reaction_picker'

export type Comment = Awaited<ReturnType<typeof getComments>>[number]

type Circle = Tables<'circles'>

export default function PostCard({
  babyId,
  post,
  circles,
  isAdmin,
  currentUserId,
}: {
  babyId: string
  post: PostWithDetails
  circles: Circle[]
  isAdmin: boolean
  currentUserId: string | null
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const loadComments = useCallback(async () => {
    setComments(await getComments(post.id, babyId))
  }, [post.id, babyId])

  useEffect(() => {
    getComments(post.id, babyId).then(setComments)
  }, [post.id, babyId])

  const handleDelete = async () => {
    if (!confirm("Supprimer cette publication ? Cette action est irréversible.")) return

    setDeleting(true)
    try {
      await deletePost(post.id, babyId)
      router.refresh()
    } catch (err) {
      console.error(err)
      alert("Une erreur est survenue lors de la suppression.")
    } finally {
      setDeleting(false)
    }
  }

  const postCircles = post.circle_ids.map((id) => circles.find((c) => c.id === id))

  return (
    <div className="rounded-3xl bg-landing-surface text-landing-foreground border border-landing-border shadow-sm overflow-hidden">
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

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-landing-foreground capitalize">
              {format(parseISO(post.taken_at), 'EEEE d MMMM yyyy', { locale: fr })}
            </p>
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-1 mt-1">
                {postCircles.length > 0 ? (
                  postCircles.map((circle, index) => (
                    <Badge key={circle?.id ?? index} variant="secondary">
                      {circle?.name ?? "Cercle"}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="destructive">Administrateurs uniquement</Badge>
                )}
              </div>
            )}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1 shrink-0">
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

        <ReactionPicker postId={post.id} babyId={babyId} />

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
