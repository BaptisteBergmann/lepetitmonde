'use client'

import { toast } from 'sonner'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/dropzone'
import { useSupabaseUpload } from '@utils/actions/use-supabase-upload'
import { attachAlbumPhotos, attachUnsortedPhotos } from '@utils/actions/albums'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, X } from 'lucide-react'

// `albumId: null` uploads unsorted photos (no album yet) — from the main
// Albums page's "Add photos" button — instead of adding to a specific album.
export default function AddPhotosModal({
  babyId,
  albumId,
  onClose,
}: {
  babyId: string
  albumId: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const t = useTranslations('albums.addPhotosForm')
  const [isPending, setIsPending] = useState(false)

  const uploadPath = albumId ? `albums/${albumId}` : `photos/${babyId}`

  const upload = useSupabaseUpload({
    bucketName: babyId,
    path: uploadPath,
    maxFiles: 30,
    maxFileSize: 50 * 1024 * 1024,
    allowedMimeTypes: ['image/*'],
  })

  const handleConfirm = async () => {
    if (upload.files.length === 0) { onClose(); return }
    setIsPending(true)
    try {
      const newlyUploaded = await upload.onUpload()
      const finalNames = { ...upload.finalNames, ...newlyUploaded.names }
      const finalThumbnails = { ...upload.finalThumbnails, ...newlyUploaded.thumbnails }
      const finalContentTypes = { ...upload.finalContentTypes, ...newlyUploaded.contentTypes }
      const successNames = new Set([...upload.successes, ...Object.keys(newlyUploaded.names)])
      const successFiles = upload.files.filter((f) => successNames.has(f.name))

      // Thumbnails are generated server-side in /api/upload (from the actual
      // stored bytes, post any HEIC→JPEG conversion), not here — see
      // .claude/plans/albums-performance.md.
      const uploadedFiles = successFiles.map((f) => ({
        filename: finalNames[f.name] ?? f.name,
        mimeType: finalContentTypes[f.name] ?? (f.type || 'application/octet-stream'),
        thumbnailFilename: finalThumbnails[f.name],
      }))

      if (uploadedFiles.length > 0) {
        if (albumId) {
          await attachAlbumPhotos(albumId, babyId, uploadedFiles)
        } else {
          await attachUnsortedPhotos(babyId, uploadedFiles)
        }
      }

      onClose()
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(t('uploadError'))
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
            <Plus className="h-4.5 w-4.5 text-primary" />
            {t('title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          <Dropzone {...upload}>
            <DropzoneEmptyState />
            <DropzoneContent />
          </Dropzone>
        </div>

        <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
          <Button variant="outline" className="rounded-2xl cursor-pointer" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            disabled={upload.files.length === 0 || hasFileErrors || isPending}
            className="rounded-2xl cursor-pointer"
            onClick={handleConfirm}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('uploading')}</span>
              </>
            ) : (
              <span>{t('upload')}</span>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
