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
import { useSupabaseUpload } from '@utils/actions/use-supabase-upload'
import { createAlbum, attachAlbumPhotos } from '@utils/actions/albums'
import { Tables } from '@utils/supabase/database.types'
import { ALBUM_LIMITS } from '@utils/album-limits'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Images } from 'lucide-react'

type Circle = Tables<'circles'>

export default function CreateAlbumModal({
  babyId,
  circles,
  onClose,
}: {
  babyId: string
  circles: Circle[]
  onClose: () => void
}) {
  const router = useRouter()
  const t = useTranslations('albums.form')
  const [albumId] = useState(() => crypto.randomUUID())

  const [name, setName] = useState("")
  const [circleIds, setCircleIds] = useState<string[]>([])
  const [isPending, setIsPending] = useState(false)

  const upload = useSupabaseUpload({
    bucketName: babyId,
    path: `albums/${albumId}`,
    maxFiles: ALBUM_LIMITS.filesPerUpload,
    maxFileSize: 50 * 1024 * 1024,
    allowedMimeTypes: ['image/*'],
  })

  const circleItems = useMemo(
    () => Object.fromEntries(circles.map((circle) => [circle.id, circle.name])),
    [circles]
  )

  // Tracked separately so a retry resumes where the last attempt stopped
  // (same albumId) instead of re-creating the album or re-sending files.
  const [albumCreated, setAlbumCreated] = useState(false)
  const [attachedNames, setAttachedNames] = useState<Set<string>>(() => new Set())

  const handleConfirm = async () => {
    if (isPending) return
    setIsPending(true)
    try {
      if (!albumCreated) {
        await createAlbum(albumId, babyId, name.trim(), circleIds)
        setAlbumCreated(true)
      }

      let failedCount = 0
      if (upload.files.length > 0) {
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
        failedCount = upload.files.filter((f) => !successNames.has(f.name)).length

        // Thumbnails are generated server-side in /api/upload (from the actual
        // stored bytes, post any HEIC→JPEG conversion), not here — see
        // .claude/plans/albums-performance.md.
        const uploadedFiles = successFiles.map((f) => ({
          filename: finalNames[f.name] ?? f.name,
          mimeType: finalContentTypes[f.name] ?? (f.type || 'application/octet-stream'),
          thumbnailFilename: finalThumbnails[f.name],
        }))

        if (uploadedFiles.length > 0) {
          await attachAlbumPhotos(albumId, babyId, uploadedFiles)
          setAttachedNames((prev) => new Set([...prev, ...successFiles.map((f) => f.name)]))
        }
      }

      if (failedCount > 0) {
        // Keep the modal open so the Dropzone's per-file errors stay visible
        // and the user can retry; the album already exists.
        router.refresh()
        toast.error(t('uploadsFailed', { count: failedCount }))
        return
      }

      onClose()
      router.push(`/baby/${babyId}/albums/${albumId}`)
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(t('publishError'))
    } finally {
      setIsPending(false)
    }
  }

  // Closing after the album was created (retry abandoned) must still show it.
  const handleClose = () => {
    if (albumCreated) router.refresh()
    onClose()
  }

  const hasFileErrors = upload.files.some((file) => file.errors.length !== 0)
  // Derived from the hook's per-file upload errors (not a snapshot) so it
  // stays right if a failing file is removed from the Dropzone.
  const uploadFailedCount = upload.files.filter((file) => upload.errors.some((e) => e.name === file.name)).length

  // First match wins: multi-file counter, single-file "Uploading…", then the
  // server-side steps.
  const progress = upload.uploadProgress
  const pendingLabel = progress && progress.total > 1
    ? t('uploadProgress', { current: Math.min(progress.done + 1, progress.total), total: progress.total })
    : progress
      ? t('uploadingOne')
      : t('publishing')

  return (
    <Modal onClose={handleClose} title={<><Images className="h-4.5 w-4.5 text-primary" />{t('newTitle')}</>}>
      <div className="p-5 space-y-4 flex-1 overflow-y-auto">

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('nameLabel')}
          </Label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            autoFocus
            disabled={albumCreated}
            maxLength={ALBUM_LIMITS.name}
            className="w-full border border-transparent bg-input/50 rounded-2xl px-3 py-2 text-base md:text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground transition-[color,box-shadow] duration-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('photosLabel')}
          </Label>
          <Dropzone {...upload} disabled={isPending}>
            <DropzoneEmptyState />
            <DropzoneContent />
          </Dropzone>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('visibleByLabel')}
          </Label>
          <Select
            items={circleItems}
            multiple
            disabled={albumCreated || isPending}
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

        {albumCreated && (
          <div role="status" aria-live="polite" className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
            <p>{t('albumCreatedNotice')}</p>
          </div>
        )}

      </div>

      <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
        <Button
          variant="outline"
          className="rounded-2xl cursor-pointer"
          onClick={handleClose}
        >
          {t('cancel')}
        </Button>
        <Button
          disabled={!name.trim() || hasFileErrors || isPending}
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
            <span>{uploadFailedCount > 0 && albumCreated ? t('retryUploads') : t('publish')}</span>
          )}
        </Button>
      </div>
    </Modal>
  )
}
