'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { addReaction, getReactions, removeReaction, ReactionsData } from '@utils/actions/reactions'
import { applyMyReaction } from '@utils/reactions'
import { logger } from '@/utils/logger'
import ReactionBar from './reaction_bar'

export default function ReactionPicker({
  postId,
  babyId,
  initialReactions,
}: {
  postId: string
  babyId: string
  initialReactions: ReactionsData
}) {
  const t = useTranslations('reactions')
  // Ignore taps while a request runs instead of disabling the bar, so it
  // doesn't flash dimmed on every reaction.
  const inFlight = useRef(false)

  // Local copy for optimistic updates, re-synced whenever the parent hands
  // back new data (router.refresh or a realtime refresh of the feed).
  // Adjusted during render, same pattern as feed_view.tsx.
  const [reactions, setReactions] = useState(initialReactions)
  const [prevInitialReactions, setPrevInitialReactions] = useState(initialReactions)
  if (initialReactions !== prevInitialReactions) {
    setPrevInitialReactions(initialReactions)
    setReactions(initialReactions)
  }

  const pick = async (emoji: string) => {
    if (inFlight.current) return
    inFlight.current = true
    const contextLogger = logger.child({ function: 'ReactionPicker.pick', babyId, postId, emoji })
    const snapshot = reactions
    const wasMine = snapshot.myEmoji === emoji
    setReactions(applyMyReaction(snapshot, wasMine ? null : emoji))
    try {
      try {
        if (wasMine) {
          await removeReaction(postId, babyId)
        } else {
          await addReaction(postId, babyId, emoji)
        }
      } catch (err) {
        contextLogger.error(err, 'Error saving reaction')
        setReactions(snapshot)
        toast.error(t('error'))
        return
      }
      // The reaction is saved: a failed refetch only means stale names, so
      // keep the optimistic state rather than rolling back.
      try {
        setReactions(await getReactions(postId, babyId))
      } catch (err) {
        contextLogger.warn({ err }, 'Error refetching reactions after save')
      }
    } finally {
      inFlight.current = false
    }
  }

  return <ReactionBar reactions={reactions} onPick={pick} variant="card" />
}
