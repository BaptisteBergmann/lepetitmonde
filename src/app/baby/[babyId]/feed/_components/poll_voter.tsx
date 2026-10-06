'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { votePoll, getPollWithResults, PollWithResults } from '@utils/actions/polls'
import { cn } from '@utils/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { BarChart3, Check, ChevronDown } from 'lucide-react'

const focusRing = "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"

export default function PollVoter({
  postId,
  babyId,
  initialPoll,
}: {
  postId: string
  babyId: string
  initialPoll: PollWithResults | null
}) {
  const t = useTranslations('feed.poll')
  const questionId = useId()
  const [poll, setPoll] = useState(initialPoll)
  const [pending, setPending] = useState(false)

  const vote = async (optionId: string) => {
    if (!poll || pending) return
    setPending(true)
    try {
      await votePoll(poll.id, babyId, optionId)
      setPoll(await getPollWithResults(postId, babyId))
    } catch {
      // The action already logs server-side; keep the previous results.
      toast.error(t('voteError'))
    } finally {
      setPending(false)
    }
  }

  if (!poll) return null

  return (
    <div className="rounded-2xl border border-landing-border p-3 space-y-2">
      <p id={questionId} className="text-sm font-semibold text-landing-foreground flex items-center gap-1.5">
        <BarChart3 className="h-3.5 w-3.5 text-primary" aria-hidden />
        {poll.question}
      </p>
      <div role="group" aria-labelledby={questionId} aria-busy={pending} className="space-y-1.5">
        {poll.options.map((option) => {
          const percent = poll.totalVotes > 0 ? Math.round((option.count / poll.totalVotes) * 100) : 0
          const isMine = option.id === poll.myOptionId
          return (
            // Vote button and voters trigger are siblings: a Popover trigger
            // nested inside the vote <button> was invalid HTML and fired both.
            <div
              key={option.id}
              className={cn(
                "relative flex items-stretch min-h-11 rounded-xl border overflow-hidden",
                isMine ? "border-primary" : "border-landing-border"
              )}
            >
              <div
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 pointer-events-none transition-[width] duration-300 motion-reduce:transition-none",
                  isMine ? "bg-primary/15" : "bg-landing-background"
                )}
                style={{ width: `${percent}%` }}
              />
              <button
                type="button"
                disabled={pending}
                aria-pressed={isMine}
                onClick={() => vote(option.id)}
                className={cn(
                  "relative flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left cursor-pointer disabled:opacity-50 disabled:cursor-wait",
                  focusRing
                )}
              >
                {isMine && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                <span className={cn("text-sm text-landing-foreground break-words min-w-0", isMine && "font-medium")}>
                  {option.label}
                </span>
                <span className="sr-only">, {t('resultSr', { percent, count: option.count })}</span>
              </button>
              <PollVoteCount
                count={option.count}
                percent={percent}
                names={option.voterNames}
                optionLabel={option.label}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PollVoteCount({
  count,
  percent,
  names,
  optionLabel,
}: {
  count: number
  percent: number
  names: string[]
  optionLabel: string
}) {
  const t = useTranslations('feed.poll')
  const [open, setOpen] = useState(false)

  if (count === 0) {
    // The result is already in the vote button's sr-only text.
    return (
      <span aria-hidden className="relative shrink-0 min-w-11 flex items-center justify-end px-3 text-xs tabular-nums whitespace-nowrap text-landing-muted">
        {t('zeroPercent')}
      </span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t('votersLabel', { option: optionLabel })}
        className={cn(
          "relative shrink-0 min-w-11 flex items-center justify-end gap-1 px-3 border-l border-landing-border/70 text-xs tabular-nums whitespace-nowrap text-landing-muted hover:text-landing-foreground hover:bg-landing-background/60 cursor-pointer",
          focusRing
        )}
      >
        {t('voteCount', { percent, count })}
        <ChevronDown className="h-3 w-3" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-[min(18rem,calc(100vw-2rem))] p-2">
        <p className="text-xs text-landing-foreground">{names.join(", ")}</p>
      </PopoverContent>
    </Popover>
  )
}
