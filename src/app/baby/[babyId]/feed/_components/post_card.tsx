'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Tables } from '@utils/supabase/database.types'
import { PostWithDetails, deletePost } from '@utils/actions/posts'
import { addReaction, getReactions, removeReaction } from '@utils/actions/reactions'
import { getComments } from '@utils/actions/comments'
import { Heart, Trash2, Loader2, Play } from 'lucide-react'
import { cn } from '@utils/utils'
import CommentList from './comment_list'
import CommentInput from './comment_input'
import PhotoLightbox from './photo_lightbox'

export type Comment = Awaited<ReturnType<typeof getComments>>[number]

type Circle = Tables<'circles'>

export default function PostCard({
  babyId,
  post,
  circles,
  isAdmin,
}: {
  babyId: string
  post: PostWithDetails
  circles: Circle[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [reactions, setReactions] = useState<{ counts: Record<string, number>; reactedByMe: boolean } | null>(null)
  const [reacting, setReacting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    getReactions(post.id).then(setReactions)
  }, [post.id])

  const loadComments = useCallback(async () => {
    setComments(await getComments(post.id, babyId))
  }, [post.id, babyId])

  useEffect(() => {
    getComments(post.id, babyId).then(setComments)
  }, [post.id, babyId])

  const heartCount = reactions?.counts['❤️'] ?? 0

  const toggleReaction = async () => {
    if (!reactions || reacting) return
    setReacting(true)
    const wasReacted = reactions.reactedByMe
    setReactions({
      reactedByMe: !wasReacted,
      counts: { ...reactions.counts, '❤️': heartCount + (wasReacted ? -1 : 1) },
    })
    try {
      if (wasReacted) {
        await removeReaction(post.id, babyId)
      } else {
        await addReaction(post.id, babyId)
      }
    } catch (err) {
      console.error(err)
      setReactions(reactions)
    } finally {
      setReacting(false)
    }
  }

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

  const circleNames = post.circle_ids.length > 0
    ? post.circle_ids.map((id) => circles.find((c) => c.id === id)?.name ?? "Cercle").join(", ")
    : "Masqué — administrateurs uniquement"

  return (
    <div className="rounded-3xl bg-card text-card-foreground border border-border shadow-sm overflow-hidden">
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
                  className="relative w-full aspect-square cursor-pointer"
                >
                  <video
                    src={photo.url}
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
                  src={photo.url}
                  alt={post.caption ?? ""}
                  onClick={() => setLightboxIndex(index)}
                  className="w-full aspect-square object-cover cursor-pointer"
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

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground capitalize">
              {format(parseISO(post.taken_at), 'EEEE d MMMM yyyy', { locale: fr })}
            </p>
            <p className="text-xs text-muted-foreground">{circleNames}</p>
          </div>
          {isAdmin && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-destructive transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {post.caption && (
          <p className="text-sm text-foreground whitespace-pre-wrap">{post.caption}</p>
        )}

        <button
          onClick={toggleReaction}
          disabled={!reactions || reacting}
          className={cn(
            "flex items-center gap-1.5 text-sm cursor-pointer transition-colors disabled:opacity-50",
            reactions?.reactedByMe ? "text-rose-500" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Heart className={cn("h-4 w-4", reactions?.reactedByMe && "fill-current")} />
          <span>{heartCount}</span>
        </button>

        <div className="border-t border-border pt-3 space-y-3">
          <CommentList comments={comments} />
          <CommentInput postId={post.id} babyId={babyId} onAdded={loadComments} />
        </div>
      </div>
    </div>
  )
}
