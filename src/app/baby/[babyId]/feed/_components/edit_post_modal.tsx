'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updatePost, PostWithDetails } from '@utils/actions/posts'
import { createPoll, updatePoll, deletePoll, getPollWithResults } from '@utils/actions/polls'
import { Tables } from '@utils/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Pencil, X, BarChart3, Plus } from 'lucide-react'
import { format, parseISO } from 'date-fns'

type Circle = Tables<'circles'>

export default function EditPostModal({
  babyId,
  post,
  circles,
  onClose,
}: {
  babyId: string
  post: PostWithDetails
  circles: Circle[]
  onClose: () => void
}) {
  const router = useRouter()
  const t = useTranslations('feed.postForm')

  const [caption, setCaption] = useState(post.caption ?? "")
  const [takenAt, setTakenAt] = useState(format(parseISO(post.taken_at), 'yyyy-MM-dd'))
  const [circleIds, setCircleIds] = useState<string[]>(post.circle_ids)
  const [isPending, setIsPending] = useState(false)

  const [existingPollId, setExistingPollId] = useState<string | null>(null)
  const [pollHasVotes, setPollHasVotes] = useState(false)
  const [pollEnabled, setPollEnabled] = useState(false)
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""])

  useEffect(() => {
    getPollWithResults(post.id, babyId).then((poll) => {
      if (!poll) return
      setExistingPollId(poll.id)
      setPollHasVotes(poll.totalVotes > 0)
      setPollEnabled(true)
      setPollQuestion(poll.question)
      setPollOptions(poll.options.map((option) => option.label))
    })
  }, [post.id, babyId])

  const validPollOptionsCount = pollOptions.filter((option) => option.trim()).length
  const pollValid = !pollEnabled || (pollQuestion.trim().length > 0 && validPollOptionsCount >= 2)

  const circleItems = useMemo(
    () => Object.fromEntries(circles.map((circle) => [circle.id, circle.name])),
    [circles]
  )

  const handleConfirm = async () => {
    setIsPending(true)
    try {
      await updatePost(post.id, babyId, { taken_at: takenAt, caption: caption || null }, circleIds)

      if (pollEnabled && pollValid) {
        if (existingPollId) {
          if (!pollHasVotes) await updatePoll(existingPollId, post.id, babyId, pollQuestion, pollOptions)
        } else {
          await createPoll(post.id, babyId, pollQuestion, pollOptions)
        }
      } else if (existingPollId && !pollHasVotes) {
        await deletePoll(existingPollId, post.id, babyId)
      }

      onClose()
      router.refresh()
    } catch (err) {
      console.error(err)
      alert(t('editError'))
    } finally {
      setIsPending(false)
    }
  }

  const updatePollOption = (index: number, value: string) => {
    setPollOptions((options) => options.map((option, i) => (i === index ? value : option)))
  }

  const addPollOption = () => {
    setPollOptions((options) => (options.length < 6 ? [...options, ""] : options))
  }

  const removePollOption = (index: number) => {
    setPollOptions((options) => (options.length > 2 ? options.filter((_, i) => i !== index) : options))
  }

  return createPortal(
    <div
      className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs flex justify-center items-center z-[60] p-4 animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] max-h-[90vh] bg-landing-surface text-landing-foreground shadow-2xl rounded-3xl overflow-hidden flex flex-col border border-landing-border animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="flex justify-between items-center border-b border-landing-border py-4 px-5">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Pencil className="h-4.5 w-4.5 text-primary" />
            {t('editTitle')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caption" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('captionLabel')}
            </Label>
            <textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              className="w-full border border-transparent bg-input/50 rounded-2xl p-3 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground resize-none transition-[color,box-shadow] duration-200"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="taken_at" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('photoDateLabel')}
            </Label>
            <input
              type="date"
              id="taken_at"
              value={takenAt}
              onChange={(e) => setTakenAt(e.target.value)}
              required
              className="w-full border border-transparent bg-input/50 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring transition-[color,box-shadow] duration-200"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('visibleByLabel')}
            </Label>
            <Select
              items={circleItems}
              multiple
              value={circleIds}
              onValueChange={(value) => setCircleIds(value as string[])}
            >
              <SelectTrigger className="w-full text-foreground bg-input/50">
                <SelectValue placeholder={t('visibleByPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {circles.map((circle) => (
                    <SelectItem key={circle.id} value={circle.id}>{circle.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('visibleByHint')}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPollEnabled((enabled) => !enabled)}
              disabled={pollHasVotes}
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              {pollEnabled ? t('removePoll') : t('addPoll')}
            </button>

            {pollHasVotes && (
              <p className="text-xs text-muted-foreground">
                {t('pollLockedNotice')}
              </p>
            )}

            {pollEnabled && (
              <div className="flex flex-col gap-2 rounded-2xl border border-landing-border p-3">
                <input
                  type="text"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  disabled={pollHasVotes}
                  placeholder={t('pollQuestionPlaceholder')}
                  className="w-full border border-transparent bg-input/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground transition-[color,box-shadow] duration-200 disabled:opacity-60"
                />
                <div className="flex flex-col gap-1.5">
                  {pollOptions.map((option, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={option}
                        onChange={(e) => updatePollOption(index, e.target.value)}
                        disabled={pollHasVotes}
                        placeholder={t('pollOptionPlaceholder', { number: index + 1 })}
                        className="w-full border border-transparent bg-input/50 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground transition-[color,box-shadow] duration-200 disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => removePollOption(index)}
                        disabled={pollHasVotes || pollOptions.length <= 2}
                        className="p-1.5 hover:bg-landing-background rounded-lg text-landing-muted hover:text-destructive transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addPollOption}
                  disabled={pollHasVotes || pollOptions.length >= 6}
                  className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('addPollOption')}
                </button>
              </div>
            )}
          </div>

        </div>

        <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
          <Button
            variant="outline"
            className="rounded-2xl cursor-pointer"
            onClick={onClose}
          >
            {t('cancel')}
          </Button>
          <Button
            disabled={!takenAt || !pollValid || isPending}
            className="rounded-2xl cursor-pointer"
            onClick={handleConfirm}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('saving')}</span>
              </>
            ) : (
              <span>{t('save')}</span>
            )}
          </Button>
        </div>

      </div>
    </div>,
    document.body,
  )
}
