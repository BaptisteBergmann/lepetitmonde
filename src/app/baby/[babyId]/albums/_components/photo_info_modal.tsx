'use client'

import { useConfirm } from '@/components/confirm_provider'
import { toast } from 'sonner'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { getDateFnsLocale } from '@utils/formatting'
import { Tables } from '@utils/supabase/database.types'
import {
  AlbumPhotoWithUrl,
  AlbumSummary,
  assignPhotoToAlbum,
  createAlbum,
  deletePhoto,
  unassignPhotoFromAlbum,
} from '@utils/actions/albums'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@components/ui/badge'
import { Info, FileText, Film, Loader2, Trash2, X } from 'lucide-react'

type Circle = Tables<'circles'>

const UNSORTED = '__unsorted__'

export default function PhotoInfoModal({
  babyId,
  photo,
  currentAlbumId,
  albums,
  circles,
  onClose,
}: {
  babyId: string
  photo: AlbumPhotoWithUrl
  currentAlbumId: string | null
  currentAlbumName: string | null
  albums: AlbumSummary[]
  circles: Circle[]
  onClose: () => void
}) {
  const router = useRouter()
  const t = useTranslations('albums.photoInfoForm')
  const tA11y = useTranslations('a11y')
  const confirmAction = useConfirm()
  const tAlbums = useTranslations('albums')
  const dateFnsLocale = getDateFnsLocale(useLocale())

  const [selectedAlbumId, setSelectedAlbumId] = useState<string>(currentAlbumId ?? UNSORTED)
  const [newAlbumName, setNewAlbumName] = useState("")
  const [isMoving, setIsMoving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const albumItems = { [UNSORTED]: t('unsortedOption'), ...Object.fromEntries(albums.map((album) => [album.id, album.name])) }
  const hasChanges = selectedAlbumId !== (currentAlbumId ?? UNSORTED)

  const visibleCircles = selectedAlbumId === UNSORTED
    ? []
    : (albums.find((album) => album.id === selectedAlbumId)?.circleIds ?? []).map((id) => circles.find((c) => c.id === id))

  const handleMove = async () => {
    setIsMoving(true)
    try {
      if (selectedAlbumId === UNSORTED) {
        await unassignPhotoFromAlbum(photo.id, babyId)
      } else {
        await assignPhotoToAlbum(photo.id, selectedAlbumId, babyId)
      }
      onClose()
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(t('moveError'))
    } finally {
      setIsMoving(false)
    }
  }

  const handleCreateAndAdd = async () => {
    if (!newAlbumName.trim()) return
    setIsMoving(true)
    try {
      const albumId = crypto.randomUUID()
      await createAlbum(albumId, babyId, newAlbumName.trim(), [])
      await assignPhotoToAlbum(photo.id, albumId, babyId)
      onClose()
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(t('moveError'))
    } finally {
      setIsMoving(false)
    }
  }

  const handleDelete = async () => {
    if (!(await confirmAction(tAlbums('deletePhotoConfirm')))) return
    setIsDeleting(true)
    try {
      await deletePhoto(photo.id, babyId)
      onClose()
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(tAlbums('deletePhotoError'))
    } finally {
      setIsDeleting(false)
    }
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
            <Info className="h-4.5 w-4.5 text-primary" />
            {t('title')}
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
          {(photo.thumbnailUrl ?? photo.url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.thumbnailUrl ?? photo.url ?? undefined}
              alt=""
              className="w-full max-h-56 object-cover rounded-2xl bg-landing-background"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-landing-muted">
              {t('addedLabel')} {format(new Date(photo.created_at), 'PPP', { locale: dateFnsLocale })}
            </p>
            {photo.source_post_id && (
              <Badge variant="secondary" className="gap-1">
                <FileText className="h-3 w-3" />
                {t('sourcePost')}
              </Badge>
            )}
            {photo.source_story_id && (
              <Badge variant="secondary" className="gap-1">
                <Film className="h-3 w-3" />
                {t('sourceStory')}
              </Badge>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('albumLabel')}
            </Label>
            <div className="flex items-center gap-2">
              <Select
                items={albumItems}
                value={selectedAlbumId}
                onValueChange={(value) => setSelectedAlbumId(value as string)}
              >
                <SelectTrigger className="flex-1 text-foreground bg-input/50">
                  <SelectValue placeholder={t('existingPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={UNSORTED}>{t('unsortedOption')}</SelectItem>
                    {albums.map((album) => (
                      <SelectItem key={album.id} value={album.id}>{album.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                className="rounded-2xl cursor-pointer shrink-0"
                disabled={!hasChanges || isMoving}
                onClick={handleMove}
              >
                {isMoving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('move')}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-landing-border" />
            {t('orDivider')}
            <div className="h-px flex-1 bg-landing-border" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('newAlbumLabel')}
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                placeholder={t('newAlbumPlaceholder')}
                className="flex-1 border border-transparent bg-input/50 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground transition-[color,box-shadow] duration-200"
              />
              <Button
                variant="outline"
                className="rounded-2xl cursor-pointer shrink-0"
                disabled={!newAlbumName.trim() || isMoving}
                onClick={handleCreateAndAdd}
              >
                {t('createAndAdd')}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('circlesLabel')}
            </Label>
            <div className="flex flex-wrap items-center gap-1">
              {visibleCircles.length > 0 ? (
                visibleCircles.map((circle, index) => (
                  <Badge key={circle?.id ?? index} variant="secondary">
                    {circle?.name ?? tAlbums('circleFallback')}
                  </Badge>
                ))
              ) : (
                <Badge variant="destructive">{t('circlesNone')}</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-landing-border bg-landing-background flex justify-end px-5 py-3.5">
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg px-3 py-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {t('deletePhoto')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
