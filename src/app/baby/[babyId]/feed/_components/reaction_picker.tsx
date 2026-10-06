'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { addReaction, getReactions, removeReaction, ReactionsData } from '@utils/actions/reactions'
import { REACTIONS, applyMyReaction } from '@utils/reactions'
import { formatNamesPreview } from '@utils/users'
import { cn } from '@utils/utils'
import { logger } from '@/utils/logger'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { SmilePlus } from 'lucide-react'

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
  const tA11y = useTranslations('a11y')
  const [reactions, setReactions] = useState(initialReactions)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Ignore taps while a request runs instead of disabling the trigger, so it
  // doesn't flash dimmed on every reaction.
  const inFlight = useRef(false)

  const pick = async (emoji: string) => {
    if (inFlight.current) return
    inFlight.current = true
    const contextLogger = logger.child({ function: 'ReactionPicker.pick', babyId, postId, emoji })
    const snapshot = reactions
    const wasMine = snapshot.myEmoji === emoji
    setReactions(applyMyReaction(snapshot, wasMine ? null : emoji))
    setPickerOpen(false)
    try {
      if (wasMine) {
        await removeReaction(postId, babyId)
      } else {
        await addReaction(postId, babyId, emoji)
      }
      setReactions(await getReactions(postId, babyId))
    } catch (err) {
      contextLogger.error(err, 'Error saving reaction')
      setReactions(snapshot)
      toast.error(t('error'))
    } finally {
      inFlight.current = false
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger
          aria-label={tA11y('react')}
          className={cn(
            "flex items-center justify-center h-7 w-7 rounded-full cursor-pointer transition-colors touch-target relative outline-none focus-visible:ring-2 focus-visible:ring-ring",
            reactions.myEmoji ? "text-rose-500" : "text-landing-muted hover:text-landing-foreground hover:bg-landing-background"
          )}
        >
          {reactions.myEmoji ? (
            <span className="text-base leading-none">{reactions.myEmoji}</span>
          ) : (
            <SmilePlus className="h-4 w-4" />
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto flex-row gap-0.5 p-1.5">
          {REACTIONS.map(({ emoji, key }) => (
            <button
              key={emoji}
              type="button"
              onClick={() => pick(emoji)}
              aria-label={t(key)}
              aria-pressed={reactions.myEmoji === emoji}
              className={cn(
                "inline-flex min-h-9 min-w-9 items-center justify-center rounded-full text-xl leading-none cursor-pointer transition-transform hover:scale-110 hover:bg-landing-background outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:scale-100",
                reactions.myEmoji === emoji && "bg-landing-background ring-1 ring-primary/40 scale-110 motion-reduce:scale-100"
              )}
            >
              {emoji}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {reactions.breakdown.map(({ emoji, count, names }) => (
        <ReactionPill key={emoji} emoji={emoji} count={count} names={names} />
      ))}
    </div>
  )
}

function ReactionPill({ emoji, count, names }: { emoji: string; count: number; names: string[] }) {
  const t = useTranslations('reactions')
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t('pillLabel', { emoji, count })}
        className="flex items-center gap-1 h-7 px-2 rounded-full bg-landing-background text-landing-foreground cursor-pointer hover:bg-landing-border transition-colors touch-target relative outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-base leading-none">{emoji}</span>
        <span className="text-xs">{count}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <p className="text-xs text-landing-foreground whitespace-nowrap">{formatNamesPreview(names)}</p>
      </PopoverContent>
    </Popover>
  )
}
