'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Tables } from '@utils/supabase/database.types'
import { AnecdoteWithDetails, deleteAnecdote } from '@utils/actions/anecdotes'
import { Trash2, Pencil, Loader2 } from 'lucide-react'
import { Badge } from '@components/ui/badge'
import EditAnecdoteModal from './edit_anecdote_modal'

type Circle = Tables<'circles'>

export default function AnecdoteCard({
  babyId,
  anecdote,
  circles,
  isAdmin,
}: {
  babyId: string
  anecdote: AnecdoteWithDetails
  circles: Circle[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const handleDelete = async () => {
    if (!confirm("Supprimer cette anecdote ? Cette action est irréversible.")) return

    setDeleting(true)
    try {
      await deleteAnecdote(anecdote.id, babyId)
      router.refresh()
    } catch (err) {
      console.error(err)
      alert("Une erreur est survenue lors de la suppression.")
    } finally {
      setDeleting(false)
    }
  }

  const anecdoteCircles = anecdote.circleIds.map((id) => circles.find((c) => c.id === id))

  return (
    <div className="rounded-3xl bg-landing-surface text-landing-foreground border border-landing-border shadow-sm overflow-hidden">
      {anecdote.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={anecdote.photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full aspect-square object-cover contain-paint"
        />
      )}

      {isEditing && (
        <EditAnecdoteModal
          babyId={babyId}
          anecdote={anecdote}
          circles={circles}
          onClose={() => setIsEditing(false)}
        />
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-landing-foreground capitalize">
              {format(parseISO(anecdote.happened_at), 'EEEE d MMMM yyyy', { locale: fr })}
            </p>
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-1 mt-1">
                {anecdoteCircles.length > 0 ? (
                  anecdoteCircles.map((circle, index) => (
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

        <p className="font-display text-lg italic text-landing-foreground whitespace-pre-wrap">
          &ldquo;{anecdote.content}&rdquo;
        </p>
      </div>
    </div>
  )
}
