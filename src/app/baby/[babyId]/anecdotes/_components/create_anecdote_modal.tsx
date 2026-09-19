'use client'

import { toast } from 'sonner'
import { useMemo, useState } from 'react'
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
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/dropzone'
import { useSupabaseUpload } from '@utils/actions/use-supabase-upload'
import { createAnecdote, attachAnecdotePhoto } from '@utils/actions/anecdotes'
import { Tables } from '@utils/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Sparkles, X } from 'lucide-react'
import { format } from 'date-fns'

type Circle = Tables<'circles'>

export default function CreateAnecdoteModal({
  babyId,
  circles,
  onClose,
}: {
  babyId: string
  circles: Circle[]
  onClose: () => void
}) {
  const router = useRouter()
  const t = useTranslations('anecdotes.form')
  const tA11y = useTranslations('a11y')
  const [anecdoteId] = useState(() => crypto.randomUUID())

  const [content, setContent] = useState("")
  const [happenedAt, setHappenedAt] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [circleIds, setCircleIds] = useState<string[]>([])
  const [isPending, setIsPending] = useState(false)

  const upload = useSupabaseUpload({
    bucketName: babyId,
    path: `anecdotes/${anecdoteId}`,
    maxFiles: 1,
    maxFileSize: 50 * 1024 * 1024,
    allowedMimeTypes: ['image/*'],
  })

  const circleItems = useMemo(
    () => Object.fromEntries(circles.map((circle) => [circle.id, circle.name])),
    [circles]
  )

  const handleConfirm = async () => {
    setIsPending(true)
    try {
      await createAnecdote({ id: anecdoteId, baby_id: babyId, content: content.trim(), happened_at: happenedAt }, circleIds)

      if (upload.files.length > 0) {
        const newlyUploaded = await upload.onUpload()
        const finalNames = { ...upload.finalNames, ...newlyUploaded.names }
        const successNames = new Set([...upload.successes, ...Object.keys(newlyUploaded.names)])
        const successFile = upload.files.find((f) => successNames.has(f.name))

        if (successFile) {
          const filename = finalNames[successFile.name] ?? successFile.name
          const mimeType = successFile.type || 'application/octet-stream'
          await attachAnecdotePhoto(anecdoteId, babyId, { filename, mimeType })
        }
      }

      onClose()
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(t('publishError'))
    } finally {
      setIsPending(false)
    }
  }

  const hasFileErrors = upload.files.some((file) => file.errors.length !== 0)

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
            <Sparkles className="h-4.5 w-4.5 text-primary" />
            {t('newTitle')}
          </h2>
          <button
            aria-label={tA11y('close')}
            onClick={onClose}
            className="p-1 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

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
              placeholder={t('contentPlaceholder')}
              autoFocus
              className="w-full border border-transparent bg-input/50 rounded-2xl p-3 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground resize-none transition-[color,box-shadow] duration-200"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('photoLabel')}
            </Label>
            <Dropzone {...upload}>
              <DropzoneEmptyState />
              <DropzoneContent />
            </Dropzone>
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
            disabled={!content.trim() || !happenedAt || hasFileErrors || isPending}
            className="rounded-2xl cursor-pointer"
            onClick={handleConfirm}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('publishing')}</span>
              </>
            ) : (
              <span>{t('publish')}</span>
            )}
          </Button>
        </div>

      </div>
    </div>,
    document.body,
  )
}
