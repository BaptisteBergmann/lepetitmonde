'use client'

import { useEffect, useState } from 'react'
import { addReaction, getReactions, removeReaction } from '@utils/actions/reactions'
import { REACTIONS } from '@utils/reactions'
import { cn } from '@utils/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { SmilePlus } from 'lucide-react'

type Reactions = { counts: Record<string, number>; myEmoji: string | null }

export default function ReactionPicker({ postId, babyId }: { postId: string; babyId: string }) {
  const [reactions, setReactions] = useState<Reactions | null>(null)
  const [pending, setPending] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    getReactions(postId).then(setReactions)
  }, [postId])

  const totalCount = reactions ? Object.values(reactions.counts).reduce((a, b) => a + b, 0) : 0

  const pick = async (emoji: string) => {
    if (!reactions || pending) return
    setOpen(false)
    setPending(true)
    const previous = reactions
    const wasMine = reactions.myEmoji === emoji
    const nextCounts = { ...reactions.counts }
    if (reactions.myEmoji) nextCounts[reactions.myEmoji] = Math.max(0, (nextCounts[reactions.myEmoji] ?? 1) - 1)
    if (!wasMine) nextCounts[emoji] = (nextCounts[emoji] ?? 0) + 1
    setReactions({ counts: nextCounts, myEmoji: wasMine ? null : emoji })
    try {
      if (wasMine) {
        await removeReaction(postId, babyId)
      } else {
        await addReaction(postId, babyId, emoji)
      }
    } catch (err) {
      console.error(err)
      setReactions(previous)
    } finally {
      setPending(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={!reactions || pending}
        className={cn(
          "flex items-center gap-1.5 text-sm cursor-pointer transition-colors disabled:opacity-50",
          reactions?.myEmoji ? "text-rose-500" : "text-landing-muted hover:text-landing-foreground"
        )}
      >
        {reactions?.myEmoji ? (
          <span className="text-base leading-none">{reactions.myEmoji}</span>
        ) : (
          <SmilePlus className="h-4 w-4" />
        )}
        <span>{totalCount}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto flex-row gap-0.5 p-1.5">
        {REACTIONS.map(({ emoji, label }) => (
          <button
            key={emoji}
            type="button"
            onClick={() => pick(emoji)}
            title={label}
            className={cn(
              "rounded-full p-1.5 text-xl leading-none transition-transform cursor-pointer hover:scale-110 hover:bg-landing-background",
              reactions?.myEmoji === emoji && "scale-110 bg-landing-background"
            )}
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
