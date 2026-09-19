'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { addCommentReaction, removeCommentReaction } from '@utils/actions/comment_reactions'
import { ReactionsData } from '@utils/actions/reactions'
import { REACTIONS } from '@utils/reactions'
import { formatNamesPreview } from '@utils/users'
import { cn } from '@utils/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { SmilePlus } from 'lucide-react'

export default function CommentReactionPicker({
  commentId,
  babyId,
  initialReactions,
  onChanged,
}: {
  commentId: string
  babyId: string
  initialReactions: ReactionsData
  onChanged: () => void
}) {
  const t = useTranslations('reactions')
  const tA11y = useTranslations('a11y')
  const [pending, setPending] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const pick = async (emoji: string) => {
    if (pending) return
    setPickerOpen(false)
    setPending(true)
    const wasMine = initialReactions.myEmoji === emoji
    try {
      if (wasMine) {
        await removeCommentReaction(commentId, babyId)
      } else {
        await addCommentReaction(commentId, babyId, emoji)
      }
      onChanged()
    } catch (err) {
      console.error(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger
          aria-label={tA11y('react')}
          disabled={pending}
          className={cn(
            "flex items-center justify-center h-5 w-5 rounded-full cursor-pointer transition-colors disabled:opacity-50 touch-target relative",
            initialReactions.myEmoji ? "text-rose-500" : "text-landing-muted hover:text-landing-foreground hover:bg-landing-surface"
          )}
        >
          {initialReactions.myEmoji ? (
            <span className="text-sm leading-none">{initialReactions.myEmoji}</span>
          ) : (
            <SmilePlus className="h-3 w-3" />
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto flex-row gap-0.5 p-1.5">
          {REACTIONS.map(({ emoji, key }) => (
            <button
              key={emoji}
              type="button"
              onClick={() => pick(emoji)}
              title={t(key)}
              className={cn(
                "rounded-full p-1.5 text-xl leading-none transition-transform cursor-pointer hover:scale-110 hover:bg-landing-background",
                initialReactions.myEmoji === emoji && "scale-110 bg-landing-background"
              )}
            >
              {emoji}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {initialReactions.breakdown.map(({ emoji, count, names }) => (
        <CommentReactionPill key={emoji} emoji={emoji} count={count} names={names} />
      ))}
    </div>
  )
}

function CommentReactionPill({ emoji, count, names }: { emoji: string; count: number; names: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-landing-surface text-landing-foreground cursor-pointer hover:bg-landing-border transition-colors">
        <span className="text-sm leading-none">{emoji}</span>
        <span className="text-[10px]">{count}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <p className="text-xs text-landing-foreground whitespace-nowrap">{formatNamesPreview(names)}</p>
      </PopoverContent>
    </Popover>
  )
}
