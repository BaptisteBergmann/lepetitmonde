'use client'

import { useEffect, useState } from 'react'
import { addReaction, getReactions, removeReaction, ReactionsData } from '@utils/actions/reactions'
import { REACTIONS } from '@utils/reactions'
import { formatNamesPreview } from '@utils/users'
import { cn } from '@utils/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { SmilePlus } from 'lucide-react'

export default function ReactionPicker({ postId, babyId }: { postId: string; babyId: string }) {
  const [reactions, setReactions] = useState<ReactionsData | null>(null)
  const [pending, setPending] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    getReactions(postId).then(setReactions)
  }, [postId])

  const pick = async (emoji: string) => {
    if (!reactions || pending) return
    setPickerOpen(false)
    setPending(true)
    const wasMine = reactions.myEmoji === emoji
    try {
      if (wasMine) {
        await removeReaction(postId, babyId)
      } else {
        await addReaction(postId, babyId, emoji)
      }
      setReactions(await getReactions(postId))
    } catch (err) {
      console.error(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger
          disabled={!reactions || pending}
          className={cn(
            "flex items-center justify-center h-7 w-7 rounded-full cursor-pointer transition-colors disabled:opacity-50",
            reactions?.myEmoji ? "text-rose-500" : "text-landing-muted hover:text-landing-foreground hover:bg-landing-background"
          )}
        >
          {reactions?.myEmoji ? (
            <span className="text-base leading-none">{reactions.myEmoji}</span>
          ) : (
            <SmilePlus className="h-4 w-4" />
          )}
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

      {reactions?.breakdown.map(({ emoji, count, names }) => (
        <ReactionPill key={emoji} emoji={emoji} count={count} names={names} />
      ))}
    </div>
  )
}

function ReactionPill({ emoji, count, names }: { emoji: string; count: number; names: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex items-center gap-1 h-7 px-2 rounded-full bg-landing-background text-landing-foreground cursor-pointer hover:bg-landing-border transition-colors">
        <span className="text-base leading-none">{emoji}</span>
        <span className="text-xs">{count}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <p className="text-xs text-landing-foreground whitespace-nowrap">{formatNamesPreview(names)}</p>
      </PopoverContent>
    </Popover>
  )
}
