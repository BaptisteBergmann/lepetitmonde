'use client'

import { useConfirm } from '@/components/confirm_provider'
import { toast } from 'sonner'
import { useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { format, isThisYear, parseISO } from 'date-fns'
import { getDateFnsLocale } from '@utils/formatting'
import { updateComment, deleteComment } from '@utils/actions/comments'
import { getDisplayName } from '@utils/users'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pencil, Trash2, Loader2, Check, X } from 'lucide-react'
import CommentReactionPicker from './comment_reaction_picker'
import type { Comment } from '@utils/actions/comments'
import { FEED_LIMITS } from '@utils/feed-limits'
import { logger } from '@/utils/logger'

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
  onChanged: () => void | Promise<void>
}) {
  const t = useTranslations('feed.comments')
  const tA11y = useTranslations('a11y')
  const confirmAction = useConfirm()
  const tCommon = useTranslations('common')
  const dateFnsLocale = getDateFnsLocale(useLocale())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  if (comments.length === 0) return null

  // Comments are sorted oldest first, so the collapsed view shows the latest 2.
  const COLLAPSED_COUNT = 2
  const collapsed = !expanded && comments.length > COLLAPSED_COUNT
  const visibleComments = collapsed ? comments.slice(-COLLAPSED_COUNT) : comments

  const expand = () => {
    setExpanded(true)
    // The "View all" button unmounts; land keyboard/screen reader users on the list.
    listRef.current?.focus()
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
      logger.child({ function: 'CommentList.saveEdit', babyId, commentId: comment.id }).error(err, 'Error updating comment')
      toast.error(t('editError'))
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (comment: Comment) => {
    if (!(await confirmAction(t('deleteConfirm')))) return

    setDeletingId(comment.id)
    try {
      await deleteComment(comment.id, comment.post_id, babyId)
      onChanged()
    } catch (err) {
      logger.child({ function: 'CommentList.handleDelete', babyId, commentId: comment.id }).error(err, 'Error deleting comment')
      toast.error(t('deleteError'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div ref={listRef} tabIndex={-1} className="flex flex-col gap-2 outline-none">
      {collapsed && (
        <button
          type="button"
          onClick={expand}
          className="self-start text-xs font-semibold text-landing-muted hover:text-landing-foreground hover:underline underline-offset-4 py-1 rounded-md cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring touch-target relative"
        >
          {t('viewAll', { count: comments.length })}
        </button>
      )}
      {visibleComments.map((comment) => {
        const createdAt = parseISO(comment.created_at)
        const author = getDisplayName(comment.users, comment.nickname) || t('unknownUser')
        const isOwner = currentUserId !== null && comment.user_id === currentUserId
        const isEditing = editingId === comment.id

        return (
          <div key={comment.id} className="rounded-2xl bg-landing-background px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-landing-foreground">{author || t('unknownUser')}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-landing-muted">
                  {tCommon('dateAtTime', {
                    date: format(createdAt, isThisYear(createdAt) ? 'd MMM' : 'd MMM yyyy', { locale: dateFnsLocale }),
                    time: format(createdAt, 'HH:mm', { locale: dateFnsLocale }),
                  })}
                </span>
                {!isEditing && (isOwner || isAdmin) && (
                  <div className="flex items-center gap-0.5">
                    {isOwner && (
                      <button
                        aria-label={tA11y('edit')}
                        onClick={() => startEditing(comment)}
                        className="p-1 hover:bg-landing-surface rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer touch-target relative pointer-coarse:p-2"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      aria-label={tA11y('delete')}
                      onClick={() => handleDelete(comment)}
                      disabled={deletingId === comment.id}
                      className="p-1 hover:bg-landing-surface rounded-lg text-landing-muted hover:text-destructive transition-colors cursor-pointer disabled:opacity-50 touch-target relative pointer-coarse:p-2"
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
                  maxLength={FEED_LIMITS.comment}
                  onChange={(e) => setEditBody(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter that confirms an IME composition (CJK input) must not save.
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveEdit(comment)
                    if (e.key === 'Escape') cancelEditing()
                  }}
                  autoFocus
                  className="flex-1 h-8 text-sm"
                />
                <Button
                  aria-label={tA11y('save')}
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 rounded-xl cursor-pointer shrink-0"
                  onClick={() => saveEdit(comment)}
                  disabled={!editBody.trim() || savingId === comment.id}
                >
                  {savingId === comment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  aria-label={tA11y('cancel')}
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

            <CommentReactionPicker
              commentId={comment.id}
              babyId={babyId}
              initialReactions={comment.reactions}
              onChanged={onChanged}
            />
          </div>
        )
      })}
    </div>
  )
}
