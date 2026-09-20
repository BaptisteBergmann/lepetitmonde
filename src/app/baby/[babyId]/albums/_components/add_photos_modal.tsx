'use client'

import { Modal } from '@/components/modal'
import { toast } from 'sonner'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/dropzone'
import { useSupabaseUpload } from '@utils/actions/use-supabase-upload'
import { attachAlbumPhotos, attachUnsortedPhotos } from '@utils/actions/albums'
import { Button } from '@/components/ui/button'
import { Loader2, Plus } from 'lucide-react'

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

  return (
    <Modal onClose={onClose} title={<><Plus className="h-4.5 w-4.5 text-primary" />{t('title')}</>}>
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
    </Modal>
  )
}
