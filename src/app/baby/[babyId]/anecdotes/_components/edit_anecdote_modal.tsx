'use client'

import { Modal } from '@/components/modal'
import { toast } from 'sonner'
import { useMemo, useState } from 'react'
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
import { updateAnecdote, AnecdoteWithDetails } from '@utils/actions/anecdotes'
import { Tables } from '@utils/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Pencil } from 'lucide-react'
import { format, parseISO } from 'date-fns'

type Circle = Tables<'circles'>

export default function EditAnecdoteModal({
  babyId,
  anecdote,
  circles,
  onClose,
}: {
  babyId: string
  anecdote: AnecdoteWithDetails
  circles: Circle[]
  onClose: () => void
}) {
  const router = useRouter()
  const t = useTranslations('anecdotes.form')

  const [content, setContent] = useState(anecdote.content)
  const [happenedAt, setHappenedAt] = useState(format(parseISO(anecdote.happened_at), 'yyyy-MM-dd'))
  const [circleIds, setCircleIds] = useState<string[]>(anecdote.circleIds)
  const [isPending, setIsPending] = useState(false)

  const circleItems = useMemo(
    () => Object.fromEntries(circles.map((circle) => [circle.id, circle.name])),
    [circles]
  )

  const handleConfirm = async () => {
    setIsPending(true)
    try {
      await updateAnecdote(anecdote.id, babyId, { content: content.trim(), happened_at: happenedAt }, circleIds)

      onClose()
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(t('editError'))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Modal onClose={onClose} title={<><Pencil className="h-4.5 w-4.5 text-primary" />{t('editTitle')}</>}>
      <div className="p-5 space-y-4 flex-1 overflow-y-auto">

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('contentLabel')}
          </Label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="w-full border border-transparent bg-input/50 rounded-2xl p-3 text-base md:text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground resize-none transition-[color,box-shadow] duration-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="happened_at" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('dateLabel')}
          </Label>
          <input
            type="date"
            id="happened_at"
            value={happenedAt}
            onChange={(e) => setHappenedAt(e.target.value)}
            required
            className="w-full border border-transparent bg-input/50 rounded-2xl px-3 py-2 text-base md:text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring transition-[color,box-shadow] duration-200"
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
          disabled={!content.trim() || !happenedAt || isPending}
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
    </Modal>
  )
}
