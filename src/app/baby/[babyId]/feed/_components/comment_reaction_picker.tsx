'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { addCommentReaction, removeCommentReaction } from '@utils/actions/comment_reactions'
import { ReactionsData } from '@utils/actions/reactions'
import { applyMyReaction } from '@utils/reactions'
import { logger } from '@/utils/logger'
import ReactionBar from './reaction_bar'

export default function CommentReactionPicker({
  commentId,
  babyId,
  initialReactions,
  onChanged,
}: {
  commentId: string
  babyId: string
  initialReactions: ReactionsData
  onChanged: () => void | Promise<void>
}) {
  const t = useTranslations('reactions')
  // Ignore taps while a request runs instead of disabling the bar, so it
  // doesn't flash dimmed on every reaction.
  const inFlight = useRef(false)

  // Local copy for optimistic updates, re-synced whenever the parent's
  // refetch (onChanged) hands back new data. Adjusted during render, same
  // pattern as feed_view.tsx.
  const [reactions, setReactions] = useState(initialReactions)
  const [prevInitialReactions, setPrevInitialReactions] = useState(initialReactions)
  if (initialReactions !== prevInitialReactions) {
    setPrevInitialReactions(initialReactions)
    setReactions(initialReactions)
  }

  const pick = async (emoji: string) => {
    if (inFlight.current) return
    inFlight.current = true
    const contextLogger = logger.child({ function: 'CommentReactionPicker.pick', babyId, commentId, emoji })
    const snapshot = reactions
    const wasMine = snapshot.myEmoji === emoji
    setReactions(applyMyReaction(snapshot, wasMine ? null : emoji))
    try {
      if (wasMine) {
        await removeCommentReaction(commentId, babyId)
      } else {
        await addCommentReaction(commentId, babyId, emoji)
      }
    } catch (err) {
      contextLogger.error(err, 'Error saving comment reaction')
      setReactions(snapshot)
      toast.error(t('error'))
      return
    } finally {
      inFlight.current = false
    }
    // Only a failed mutation rolls back: the reaction is saved, so a failed
    // refetch only means stale data. Log it instead of leaving the parent's
    // async refetch as an unhandled rejection.
    try {
      await onChanged()
    } catch (err) {
      contextLogger.warn({ err }, 'Error refetching after reaction')
    }
  }

  return <ReactionBar reactions={reactions} onPick={pick} variant="comment" />
}
