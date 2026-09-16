'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { addStoryReaction, removeStoryReaction } from '@utils/actions/story_reactions'
import { ReactionsData } from '@utils/actions/reactions'
import { REACTIONS } from '@utils/reactions'
import { formatNamesPreview } from '@utils/users'
import { cn } from '@utils/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { SmilePlus } from 'lucide-react'

export default function StoryReactionPicker({
  storyId,
  babyId,
  initialReactions,
  onChanged,
}: {
  storyId: string
  babyId: string
  initialReactions: ReactionsData
  onChanged: () => void
}) {
  const t = useTranslations('reactions')
  const [pending, setPending] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const pick = async (emoji: string) => {
    if (pending) return
    setPickerOpen(false)
    setPending(true)
    const wasMine = initialReactions.myEmoji === emoji
    try {
      if (wasMine) {
        await removeStoryReaction(storyId, babyId)
      } else {
        await addStoryReaction(storyId, babyId, emoji)
      }
      onChanged()
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
          disabled={pending}
          className={cn(
            "flex items-center justify-center h-7 w-7 rounded-full cursor-pointer transition-colors disabled:opacity-50 bg-white/10 hover:bg-white/20",
            initialReactions.myEmoji ? "text-rose-400" : "text-white/80 hover:text-white"
          )}
        >
          {initialReactions.myEmoji ? (
            <span className="text-base leading-none">{initialReactions.myEmoji}</span>
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
        <StoryReactionPill key={emoji} emoji={emoji} count={count} names={names} />
      ))}
    </div>
  )
}

function StoryReactionPill({ emoji, count, names }: { emoji: string; count: number; names: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex items-center gap-1 h-7 px-2 rounded-full bg-white/10 text-white cursor-pointer hover:bg-white/20 transition-colors">
        <span className="text-base leading-none">{emoji}</span>
        <span className="text-xs">{count}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <p className="text-xs text-landing-foreground whitespace-nowrap">{formatNamesPreview(names)}</p>
      </PopoverContent>
    </Popover>
  )
}
