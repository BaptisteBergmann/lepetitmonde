'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { createPost, attachPostPhotos } from '@utils/actions/posts'
import { Tables } from '@utils/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, ImagePlus, X } from 'lucide-react'
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
  const [postId] = useState(() => crypto.randomUUID())

  const [caption, setCaption] = useState("")
  const [takenAt, setTakenAt] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [circleIds, setCircleIds] = useState<string[]>([])
  const [isPending, setIsPending] = useState(false)

  const upload = useSupabaseUpload({
    bucketName: babyId,
    path: `posts/${postId}`,
    maxFiles: 10,
    allowedMimeTypes: ['image/*'],
  })

  const circleItems = useMemo(
    () => Object.fromEntries(circles.map((circle) => [circle.id, circle.name])),
    [circles]
  )

  const handleConfirm = async () => {
    setIsPending(true)
    try {
      await createPost({ id: postId, baby_id: babyId, taken_at: takenAt, caption: caption || null }, circleIds)

      if (upload.files.length > 0) {
        await upload.onUpload()
        await attachPostPhotos(postId, babyId, upload.files.map((f) => f.name))
      }

      onClose()
      router.refresh()
    } catch (err) {
      console.error(err)
      alert("Une erreur est survenue lors de la publication.")
    } finally {
      setIsPending(false)
    }
  }

  const hasFileErrors = upload.files.some((file) => file.errors.length !== 0)

  return (
    <div className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 animate-in fade-in-0 duration-200">
      <div className="w-full max-w-[460px] max-h-[90vh] bg-card text-card-foreground shadow-2xl rounded-3xl overflow-hidden flex flex-col border border-border animate-in zoom-in-95 duration-200">

        <div className="flex justify-between items-center border-b border-border py-4 px-5">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <ImagePlus className="h-4.5 w-4.5 text-primary" />
            Nouvelle publication
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto text-card-foreground">

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Photos
            </Label>
            <Dropzone {...upload}>
              <DropzoneEmptyState />
              <DropzoneContent />
            </Dropzone>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caption" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Légende (facultative)
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
              Date de la photo
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
              Aucun cercle sélectionné = publication masquée, visible uniquement par les administrateurs.
            </p>
          </div>

        </div>

        <div className="border-t border-border bg-muted/20 flex justify-end gap-2 items-center px-5 py-3.5">
          <Button
            variant="outline"
            className="rounded-2xl cursor-pointer"
            onClick={onClose}
          >
            Annuler
          </Button>
          <Button
            disabled={!takenAt || hasFileErrors || isPending}
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
