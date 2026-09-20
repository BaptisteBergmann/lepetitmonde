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
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/dropzone'
import { useSupabaseUpload, uploadFile } from '@utils/actions/use-supabase-upload'
import { createPost, attachPostPhotos } from '@utils/actions/posts'
import { createPoll } from '@utils/actions/polls'
import { captureVideoThumbnail } from '@utils/video-thumbnail'
import { Tables } from '@utils/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, ImagePlus, X, BarChart3, Plus } from 'lucide-react'
import { format } from 'date-fns'

type Circle = Tables<'circles'>

export default function CreatePostModal({
  babyId,
  circles,
  onClose,
}: {
  babyId: string
  circles: Circle[]
  onClose: () => void
}) {
  const router = useRouter()
  const t = useTranslations('feed.postForm')
  const tA11y = useTranslations('a11y')
  const [postId] = useState(() => crypto.randomUUID())

  const [caption, setCaption] = useState("")
  const [takenAt, setTakenAt] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [circleIds, setCircleIds] = useState<string[]>([])
  const [sendEmail, setSendEmail] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const [pollEnabled, setPollEnabled] = useState(false)
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""])

  const validPollOptionsCount = pollOptions.filter((option) => option.trim()).length
  const pollValid = !pollEnabled || (pollQuestion.trim().length > 0 && validPollOptionsCount >= 2)

  const upload = useSupabaseUpload({
    bucketName: babyId,
    path: `posts/${postId}`,
    maxFiles: 10,
    maxFileSize: 500 * 1024 * 1024,
    allowedMimeTypes: ['image/*', 'video/*'],
  })

  const circleItems = useMemo(
    () => Object.fromEntries(circles.map((circle) => [circle.id, circle.name])),
    [circles]
  )

  const handleConfirm = async () => {
    setIsPending(true)
    try {
      await createPost({ id: postId, baby_id: babyId, taken_at: takenAt, caption: caption || null }, circleIds, sendEmail)

      if (pollEnabled && pollValid) {
        await createPoll(postId, babyId, pollQuestion, pollOptions)
      }

      if (upload.files.length > 0) {
        const newlyUploaded = await upload.onUpload()
        const finalNames = { ...upload.finalNames, ...newlyUploaded.names }
        const finalThumbnails = { ...upload.finalThumbnails, ...newlyUploaded.thumbnails }
        const finalContentTypes = { ...upload.finalContentTypes, ...newlyUploaded.contentTypes }
        const successNames = new Set([...upload.successes, ...Object.keys(newlyUploaded.names)])
        const successFiles = upload.files.filter((f) => successNames.has(f.name))

        const uploadedFiles = await Promise.all(successFiles.map(async (f) => {
          const filename = finalNames[f.name] ?? f.name
          const mimeType = finalContentTypes[f.name] ?? (f.type || 'application/octet-stream')

          // Images already get a server-generated thumbnail from /api/upload
          // (finalThumbnails); only videos need the client-side capture below.
          let thumbnailFilename: string | undefined = finalThumbnails[f.name]
          if (mimeType.startsWith('video/')) {
            const thumbnailBlob = await captureVideoThumbnail(f)
            if (thumbnailBlob) {
              const thumbName = `${filename}.jpg`
              const { error } = await uploadFile(
                babyId,
                `posts/${postId}/thumbnails/${thumbName}`,
                thumbnailBlob,
                { cacheControl: '3600', upsert: false }
              )
              if (!error) thumbnailFilename = thumbName
            }
          }

          return { filename, mimeType, thumbnailFilename }
        }))

        if (uploadedFiles.length > 0) {
          await attachPostPhotos(postId, babyId, uploadedFiles)
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

  const updatePollOption = (index: number, value: string) => {
    setPollOptions((options) => options.map((option, i) => (i === index ? value : option)))
  }

  const addPollOption = () => {
    setPollOptions((options) => (options.length < 6 ? [...options, ""] : options))
  }

  const removePollOption = (index: number) => {
    setPollOptions((options) => (options.length > 2 ? options.filter((_, i) => i !== index) : options))
  }

  return (
    <Modal onClose={onClose} title={<><ImagePlus className="h-4.5 w-4.5 text-primary" />{t('newTitle')}</>}>
      <div className="p-5 space-y-4 flex-1 overflow-y-auto">

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('photosVideosLabel')}
          </Label>
          <Dropzone {...upload}>
            <DropzoneEmptyState />
            <DropzoneContent />
          </Dropzone>
        </div>

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

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="mt-0.5 cursor-pointer"
          />
          <span className="flex flex-col gap-0.5">
            <span>{t('sendEmailLabel')}</span>
            <span className="text-xs text-muted-foreground">{t('sendEmailHint')}</span>
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setPollEnabled((enabled) => !enabled)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            {pollEnabled ? t('removePoll') : t('addPoll')}
          </button>

          {pollEnabled && (
            <div className="flex flex-col gap-2 rounded-2xl border border-landing-border p-3">
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder={t('pollQuestionPlaceholder')}
                className="w-full border border-transparent bg-input/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground transition-[color,box-shadow] duration-200"
              />
              <div className="flex flex-col gap-1.5">
                {pollOptions.map((option, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => updatePollOption(index, e.target.value)}
                      placeholder={t('pollOptionPlaceholder', { number: index + 1 })}
                      className="w-full border border-transparent bg-input/50 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground transition-[color,box-shadow] duration-200"
                    />
                    <button
                      aria-label={tA11y('remove')}
                      type="button"
                      onClick={() => removePollOption(index)}
                      disabled={pollOptions.length <= 2}
                      className="p-1.5 hover:bg-landing-background rounded-lg text-landing-muted hover:text-destructive transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0 touch-target relative pointer-coarse:p-2"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addPollOption}
                disabled={pollOptions.length >= 6}
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
          disabled={!takenAt || hasFileErrors || !pollValid || isPending}
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
    </Modal>
  )
}
