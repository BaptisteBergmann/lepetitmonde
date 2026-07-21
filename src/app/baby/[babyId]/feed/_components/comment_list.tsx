'use client'

import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Comment } from './post_card'

export default function CommentList({ comments }: { comments: Comment[] }) {
  if (comments.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucun commentaire pour l&apos;instant.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {comments.map((comment) => {
        const author = comment.users
          ? [comment.users.first_name, comment.users.last_name].filter(Boolean).join(" ")
          : "Utilisateur"

        return (
          <div key={comment.id} className="rounded-2xl bg-muted/40 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">{author || "Utilisateur"}</span>
              <span className="text-[10px] text-muted-foreground">
                {format(parseISO(comment.created_at), 'd MMM à HH:mm', { locale: fr })}
              </span>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{comment.body}</p>
          </div>
        )
      })}
    </div>
  )
}
