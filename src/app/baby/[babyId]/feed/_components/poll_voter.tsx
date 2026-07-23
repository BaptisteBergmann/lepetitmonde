'use client'

import { useEffect, useState } from 'react'
import { votePoll, getPollWithResults, PollWithResults } from '@utils/actions/polls'
import { cn } from '@utils/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { BarChart3 } from 'lucide-react'

export default function PollVoter({ postId, babyId }: { postId: string; babyId: string }) {
  const [poll, setPoll] = useState<PollWithResults | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    getPollWithResults(postId).then((data) => { setPoll(data); setLoaded(true) })
  }, [postId])

  const vote = async (optionId: string) => {
    if (!poll || pending) return
    setPending(true)
    try {
      await votePoll(poll.id, babyId, optionId)
      setPoll(await getPollWithResults(postId))
    } catch (err) {
      console.error(err)
    } finally {
      setPending(false)
    }
  }

  if (!loaded || !poll) return null

  return (
    <div className="rounded-2xl border border-landing-border p-3 space-y-2">
      <p className="text-sm font-semibold text-landing-foreground flex items-center gap-1.5">
        <BarChart3 className="h-3.5 w-3.5 text-primary" />
        {poll.question}
      </p>
      <div className="space-y-1.5">
        {poll.options.map((option) => {
          const percent = poll.totalVotes > 0 ? Math.round((option.count / poll.totalVotes) * 100) : 0
          const isMine = option.id === poll.myOptionId
          return (
            <button
              key={option.id}
              type="button"
              disabled={pending}
              onClick={() => vote(option.id)}
              className={cn(
                "relative w-full text-left rounded-xl border overflow-hidden cursor-pointer transition-colors disabled:opacity-50",
                isMine ? "border-primary" : "border-landing-border hover:border-landing-muted"
              )}
            >
              <div
                className={cn("absolute inset-y-0 left-0 transition-all", isMine ? "bg-primary/15" : "bg-landing-background")}
                style={{ width: `${percent}%` }}
              />
              <div className="relative flex items-center justify-between gap-2 px-3 py-1.5">
                <span className={cn("text-sm", isMine && "font-medium text-primary")}>{option.label}</span>
                <PollVoteCount count={option.count} percent={percent} names={option.voterNames} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PollVoteCount({ count, percent, names }: { count: number; percent: number; names: string[] }) {
  const [open, setOpen] = useState(false)

  if (count === 0) {
    return <span className="text-xs text-landing-muted shrink-0">0</span>
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={(e) => e.stopPropagation()}
        className="text-xs text-landing-muted shrink-0 cursor-pointer hover:text-landing-foreground"
      >
        {percent}% · {count}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs text-landing-foreground whitespace-nowrap">{names.join(", ")}</p>
      </PopoverContent>
    </Popover>
  )
}
