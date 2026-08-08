'use client'

import { useMemo, useState } from 'react'
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
import { createStory } from '@utils/actions/stories'
import { captureVideoThumbnail } from '@utils/video-thumbnail'
import { Tables } from '@utils/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Sparkles, X } from 'lucide-react'

type Circle = Tables<'circles'>

const DURATION_LABELS: Record<string, string> = {
  '24': '24 heures',
  '72': '3 jours',
  '168': '7 jours',
  never: 'Ne expire jamais',
}

export default function CreateStoryModal({
  babyId,
  circles,
  onClose,
  onCreated,
}: {
  babyId: string
  circles: Circle[]
  onClose: () => void
  onCreated: () => void
}) {
  const [storyId] = useState(() => crypto.randomUUID())

  const [caption, setCaption] = useState("")
  const [duration, setDuration] = useState<string>('24')
  const [circleIds, setCircleIds] = useState<string[]>([])
  const [isPending, setIsPending] = useState(false)

  const upload = useSupabaseUpload({
    bucketName: babyId,
    path: `stories/${storyId}`,
    maxFiles: 1,
    maxFileSize: 500 * 1024 * 1024,
    allowedMimeTypes: ['image/*', 'video/*'],
  })

  const circleItems = useMemo(
    () => Object.fromEntries(circles.map((circle) => [circle.id, circle.name])),
    [circles]
  )

  const handleConfirm = async () => {
    if (upload.files.length !== 1) return

    setIsPending(true)
    try {
      const newlyUploaded = await upload.onUpload()
      const finalNames = { ...upload.finalNames, ...newlyUploaded }
      const successNames = new Set([...upload.successes, ...Object.keys(newlyUploaded)])
      const file = upload.files.find((f) => successNames.has(f.name))
      if (!file) throw new Error("Échec de l'envoi du fichier")

      const filename = finalNames[file.name] ?? file.name
      const mimeType = file.type || 'application/octet-stream'

      let thumbnailFilename: string | undefined
      if (mimeType.startsWith('video/')) {
        const thumbnailBlob = await captureVideoThumbnail(file)
        if (thumbnailBlob) {
          const thumbName = `${filename}.jpg`
          const { error } = await uploadFile(
            babyId,
            `stories/${storyId}/thumbnails/${thumbName}`,
            thumbnailBlob,
            { cacheControl: '3600', upsert: false }
          )
          if (!error) thumbnailFilename = thumbName
        }
      }

      await createStory({
        id: storyId,
        baby_id: babyId,
        caption: caption || null,
        durationHours: duration === 'never' ? null : Number(duration),
        mediaFilename: filename,
        mimeType,
        thumbnailFilename,
      }, circleIds)

      onCreated()
      onClose()
    } catch (err) {
      console.error(err)
      alert("Une erreur est survenue lors de la publication de la story.")
    } finally {
      setIsPending(false)
    }
  }

  const hasFileErrors = upload.files.some((file) => file.errors.length !== 0)

  return (
    <div
      className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] max-h-[90vh] bg-landing-surface text-landing-foreground shadow-2xl rounded-3xl overflow-hidden flex flex-col border border-landing-border animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="flex justify-between items-center border-b border-landing-border py-4 px-5">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
            Nouvelle story
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
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Photo / vidéo
            </Label>
            <Dropzone {...upload}>
              <DropzoneEmptyState />
              <DropzoneContent />
            </Dropzone>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="story-caption" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Légende (facultative)
            </Label>
            <textarea
              id="story-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              className="w-full border border-transparent bg-input/50 rounded-2xl p-3 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground resize-none transition-[color,box-shadow] duration-200"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Durée
            </Label>
            <Select items={DURATION_LABELS} value={duration} onValueChange={(value) => value && setDuration(value as string)}>
              <SelectTrigger className="w-full text-foreground bg-input/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.entries(DURATION_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Visible par
            </Label>
            <Select
              items={circleItems}
              multiple
              value={circleIds}
              onValueChange={(value) => setCircleIds(value as string[])}
            >
              <SelectTrigger className="w-full text-foreground bg-input/50">
                <SelectValue placeholder="Masqué (aucun cercle)" />
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
              Aucun cercle sélectionné = story masquée, visible uniquement par les administrateurs.
            </p>
          </div>

        </div>

        <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
          <Button
            variant="outline"
            className="rounded-2xl cursor-pointer"
            onClick={onClose}
          >
            Annuler
          </Button>
          <Button
            disabled={upload.files.length !== 1 || hasFileErrors || isPending}
            className="rounded-2xl cursor-pointer"
            onClick={handleConfirm}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Publication...</span>
              </>
            ) : (
              <span>Publier</span>
            )}
          </Button>
        </div>

      </div>
    </div>
  )
}
