'use client'

import { Modal } from '@/components/modal'
import { toast } from 'sonner'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/dropzone'
import { useSupabaseUpload } from '@utils/actions/use-supabase-upload'
import { attachAlbumPhotos, attachUnsortedPhotos } from '@utils/actions/albums'
import { ALBUM_LIMITS } from '@utils/album-limits'
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
    maxFiles: ALBUM_LIMITS.filesPerUpload,
    maxFileSize: 50 * 1024 * 1024,
    allowedMimeTypes: ['image/*'],
  })

  // Files already attached stay recorded so a retry only sends the rest.
  const [attachedNames, setAttachedNames] = useState<Set<string>>(() => new Set())

  const handleConfirm = async () => {
    if (isPending) return
    if (upload.files.length === 0) { onClose(); return }
    setIsPending(true)
    try {
      // On a retry every file may already be uploaded; calling onUpload then
      // would re-send them all and hit "already exists".
      const needsUpload = upload.files.some((f) => !upload.successes.includes(f.name))
      const newlyUploaded = needsUpload
        ? await upload.onUpload()
        : { names: {}, thumbnails: {}, contentTypes: {} }
      const finalNames = { ...upload.finalNames, ...newlyUploaded.names }
      const finalThumbnails = { ...upload.finalThumbnails, ...newlyUploaded.thumbnails }
      const finalContentTypes = { ...upload.finalContentTypes, ...newlyUploaded.contentTypes }
      const successNames = new Set([...upload.successes, ...Object.keys(newlyUploaded.names)])
      const successFiles = upload.files.filter((f) => successNames.has(f.name) && !attachedNames.has(f.name))
      const failedCount = upload.files.filter((f) => !successNames.has(f.name)).length

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
        setAttachedNames((prev) => new Set([...prev, ...successFiles.map((f) => f.name)]))
      }

      if (failedCount > 0) {
        // Keep the modal open so the Dropzone's per-file errors stay visible
        // and the user can retry only the failed files.
        router.refresh()
        toast.error(t('uploadsFailed', { count: failedCount }))
        return
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

  // Closing after a partial success must still show the photos that made it.
  const handleClose = () => {
    if (attachedNames.size > 0) router.refresh()
    onClose()
  }

  const hasFileErrors = upload.files.some((file) => file.errors.length !== 0)
  const uploadFailedCount = upload.files.filter((file) => upload.errors.some((e) => e.name === file.name)).length

  const progress = upload.uploadProgress
  const pendingLabel = progress && progress.total > 1
    ? t('uploadProgress', { current: Math.min(progress.done + 1, progress.total), total: progress.total })
    : progress
      ? t('uploadingOne')
      : t('uploading')

  return (
    <Modal onClose={handleClose} title={<><Plus className="h-4.5 w-4.5 text-primary" />{t('title')}</>}>
      <div className="p-5 flex-1 overflow-y-auto">
        <Dropzone {...upload} disabled={isPending}>
          <DropzoneEmptyState />
          <DropzoneContent />
        </Dropzone>
      </div>

      <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
        <Button variant="outline" className="rounded-2xl cursor-pointer" onClick={handleClose}>
          {t('cancel')}
        </Button>
        <Button
          disabled={upload.files.length === 0 || hasFileErrors || isPending}
          className="rounded-2xl cursor-pointer"
          onClick={handleConfirm}
          aria-busy={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{pendingLabel}</span>
            </>
          ) : (
            <span>{uploadFailedCount > 0 ? t('retryUploads') : t('upload')}</span>
          )}
        </Button>
      </div>
    </Modal>
  )
}
