'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { updateComment, deleteComment } from '@utils/actions/comments'
import { getDisplayName } from '@utils/users'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pencil, Trash2, Loader2, Check, X } from 'lucide-react'
import type { Comment } from '@utils/actions/comments'

export default function CommentList({
  comments,
  babyId,
  currentUserId,
  isAdmin,
  onChanged,
}: {
  comments: Comment[]
  babyId: string
  currentUserId: string | null
  isAdmin: boolean
  onChanged: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  if (comments.length === 0) {
    return <p className="text-xs text-landing-muted">Aucun commentaire pour l&apos;instant.</p>
  }

  const startEditing = (comment: Comment) => {
    setEditingId(comment.id)
    setEditBody(comment.body)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditBody("")
  }

  const saveEdit = async (comment: Comment) => {
    const trimmed = editBody.trim()
    if (!trimmed) return

    setSavingId(comment.id)
    try {
      await updateComment(comment.id, comment.post_id, babyId, trimmed)
      cancelEditing()
      onChanged()
    } catch (err) {
      console.error(err)
      alert("Une erreur est survenue lors de la modification du commentaire.")
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (comment: Comment) => {
    if (!confirm("Supprimer ce commentaire ?")) return

    setDeletingId(comment.id)
    try {
      await deleteComment(comment.id, comment.post_id, babyId)
      onChanged()
    } catch (err) {
      console.error(err)
      alert("Une erreur est survenue lors de la suppression du commentaire.")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {comments.map((comment) => {
        const author = getDisplayName(comment.users, comment.nickname) || "Utilisateur"
        const isOwner = currentUserId !== null && comment.user_id === currentUserId
        const isEditing = editingId === comment.id

        return (
          <div key={comment.id} className="rounded-2xl bg-landing-background px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-landing-foreground">{author || "Utilisateur"}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-landing-muted">
                  {format(parseISO(comment.created_at), 'd MMM à HH:mm', { locale: fr })}
                </span>
                {!isEditing && (isOwner || isAdmin) && (
                  <div className="flex items-center gap-0.5">
                    {isOwner && (
                      <button
                        onClick={() => startEditing(comment)}
                        className="p-1 hover:bg-landing-surface rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(comment)}
                      disabled={deletingId === comment.id}
                      className="p-1 hover:bg-landing-surface rounded-lg text-landing-muted hover:text-destructive transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {deletingId === comment.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="flex items-center gap-1.5 mt-1">
                <Input
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(comment)
                    if (e.key === 'Escape') cancelEditing()
                  }}
                  autoFocus
                  className="flex-1 h-8 text-sm"
                />
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 rounded-xl cursor-pointer shrink-0"
                  onClick={() => saveEdit(comment)}
                  disabled={!editBody.trim() || savingId === comment.id}
                >
                  {savingId === comment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 rounded-xl cursor-pointer shrink-0"
                  onClick={cancelEditing}
                  disabled={savingId === comment.id}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <p className="text-sm text-landing-foreground whitespace-pre-wrap">{comment.body}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
