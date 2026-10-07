'use client'

import { useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { SmilePlus } from 'lucide-react'
import type { ReactionsData } from '@utils/actions/reactions'
import { REACTIONS } from '@utils/reactions'
import { formatNamesPreview } from '@utils/users'
import { cn } from '@utils/utils'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@components/ui/popover'

export type ReactionBarVariant = 'card' | 'comment' | 'dark'

const REACTION_ORDER: Map<string, number> = new Map(REACTIONS.map(({ emoji }, index) => [emoji, index]))
const REACTION_KEYS: Map<string, (typeof REACTIONS)[number]['key']> = new Map(REACTIONS.map(({ emoji, key }) => [emoji, key]))

const styles: Record<ReactionBarVariant, {
  root: string
  trigger: string
  triggerIcon: string
  pill: string
  pillIdle: string
  pillMine: string
  pillEmoji: string
  names: string
}> = {
  card: {
    root: '',
    trigger: 'text-landing-muted hover:text-landing-foreground hover:bg-landing-background focus-visible:ring-ring',
    triggerIcon: 'h-4 w-4',
    pill: 'h-7 gap-1 focus-visible:ring-ring',
    pillIdle: 'bg-landing-background text-landing-foreground hover:bg-landing-border',
    pillMine: 'bg-primary/15 text-landing-foreground ring-1 ring-inset ring-primary',
    pillEmoji: 'text-base',
    names: 'h-7 max-w-[12rem] text-landing-muted hover:text-landing-foreground focus-visible:ring-ring',
  },
  comment: {
    root: 'mt-1',
    trigger: 'text-landing-muted hover:text-landing-foreground hover:bg-landing-surface focus-visible:ring-ring',
    triggerIcon: 'h-3.5 w-3.5',
    pill: 'h-6 gap-0.5 focus-visible:ring-ring',
    pillIdle: 'bg-landing-surface text-landing-foreground hover:bg-landing-border',
    pillMine: 'bg-primary/15 text-landing-foreground ring-1 ring-inset ring-primary',
    pillEmoji: 'text-sm',
    names: 'h-6 max-w-[9rem] text-landing-muted hover:text-landing-foreground focus-visible:ring-ring',
  },
  dark: {
    root: '',
    trigger: 'bg-white/10 hover:bg-white/20 text-white/80 hover:text-white focus-visible:ring-white/70',
    triggerIcon: 'h-4 w-4',
    pill: 'h-7 gap-1 focus-visible:ring-white/70',
    pillIdle: 'bg-white/10 text-white hover:bg-white/20',
    pillMine: 'bg-white/25 text-white ring-1 ring-inset ring-white',
    pillEmoji: 'text-base',
    names: 'h-7 max-w-[12rem] text-white/70 hover:text-white focus-visible:ring-white/70',
  },
}

// Shared by the post, comment and story pickers: each owns its state, the
// optimistic update and the server action; this only renders and reports
// which emoji was picked, from the ☺+ picker or by tapping a pill.
export default function ReactionBar({
  reactions,
  onPick,
  variant,
}: {
  reactions: ReactionsData
  onPick: (emoji: string) => void
  variant: ReactionBarVariant
}) {
  const t = useTranslations('reactions')
  const tA11y = useTranslations('a11y')
  const locale = useLocale()
  const [pickerOpen, setPickerOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const s = styles[variant]

  // The optimistic update appends a new emoji at the end; sorting keeps
  // every pill in its fixed REACTIONS slot so nothing jumps around.
  const breakdown = useMemo(
    () => [...reactions.breakdown].sort((a, b) => (REACTION_ORDER.get(a.emoji) ?? 99) - (REACTION_ORDER.get(b.emoji) ?? 99)),
    [reactions.breakdown]
  )
  const allNames = breakdown.flatMap((entry) => entry.names)
  const namesPreview = formatNamesPreview(allNames, 2)
  const listFormat = useMemo(() => new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }), [locale])

  const pickFromPicker = (emoji: string) => {
    setPickerOpen(false)
    onPick(emoji)
  }

  const pickFromPill = (emoji: string, count: number) => {
    onPick(emoji)
    // Removing your own single reaction unmounts the focused pill; keep
    // keyboard users in the bar instead of dropping focus to <body>.
    if (emoji === reactions.myEmoji && count === 1) triggerRef.current?.focus()
  }

  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', s.root)}>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger
          ref={triggerRef}
          aria-label={tA11y('react')}
          className={cn(
            'flex items-center justify-center h-7 w-7 rounded-full cursor-pointer transition-colors touch-target relative outline-none focus-visible:ring-2 motion-reduce:transition-none',
            s.trigger
          )}
        >
          <SmilePlus className={s.triggerIcon} />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto flex-row gap-0.5 p-1.5">
          {REACTIONS.map(({ emoji, key }) => (
            <button
              key={emoji}
              type="button"
              onClick={() => pickFromPicker(emoji)}
              aria-label={t(key)}
              aria-pressed={reactions.myEmoji === emoji}
              className={cn(
                'inline-flex min-h-9 min-w-9 items-center justify-center rounded-full text-xl leading-none cursor-pointer transition-transform hover:scale-110 hover:bg-landing-background outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:scale-100',
                reactions.myEmoji === emoji && 'bg-landing-background ring-1 ring-primary/40 scale-110 motion-reduce:scale-100'
              )}
            >
              {emoji}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {breakdown.map(({ emoji, count }) => {
        const mine = emoji === reactions.myEmoji
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => pickFromPill(emoji, count)}
            aria-pressed={mine}
            aria-label={t('pillLabel', { emoji, count })}
            className={cn(
              'relative touch-target inline-flex items-center rounded-full px-2 cursor-pointer outline-none focus-visible:ring-2 transition-[background-color,transform] active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
              'animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none',
              s.pill,
              mine ? s.pillMine : s.pillIdle
            )}
          >
            <span className={cn('leading-none', s.pillEmoji)}>{emoji}</span>
            <span className={cn('text-xs tabular-nums', mine && 'font-semibold')}>{count}</span>
          </button>
        )
      })}

      {/* Names only arrive with the refetch after a save, so right after a
          first optimistic reaction there is nothing to show yet. */}
      {allNames.length > 0 && (
        <Popover>
          <PopoverTrigger
            aria-label={t('whoReactedLabel', { names: namesPreview })}
            className={cn(
              'relative touch-target inline-flex items-center rounded-full px-1.5 text-xs cursor-pointer underline-offset-2 hover:underline outline-none focus-visible:ring-2',
              s.names
            )}
          >
            <span className="min-w-0 truncate">{namesPreview}</span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto max-w-[min(18rem,calc(100vw-2rem))] gap-2 p-3">
            <PopoverTitle className="text-sm font-medium">{t('whoReactedTitle')}</PopoverTitle>
            <ul className="flex flex-col gap-1.5">
              {breakdown.filter((entry) => entry.names.length > 0).map(({ emoji, names }) => {
                const key = REACTION_KEYS.get(emoji)
                return (
                  <li key={emoji} className="flex items-start gap-2 text-sm text-popover-foreground">
                    <span role="img" aria-label={key ? t(key) : emoji} className="text-base leading-none shrink-0">{emoji}</span>
                    <span>{listFormat.format(names)}</span>
                  </li>
                )
              })}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
