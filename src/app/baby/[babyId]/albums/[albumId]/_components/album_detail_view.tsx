'use client'

import { useConfirm } from '@/components/confirm_provider'
import { toast } from 'sonner'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Tables } from '@utils/supabase/database.types'
import { AlbumOption, AlbumWithDetails, deleteAlbum } from '@utils/actions/albums'
import { Button } from '@/components/ui/button'
import { Badge } from '@components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Pencil, Trash2, Share2, Loader2, Info, Lock, MoreHorizontal } from 'lucide-react'
import PhotoLightbox from '@/components/photo_lightbox'
import AddPhotosModal from '../../_components/add_photos_modal'
import PhotoInfoModal from '../../_components/photo_info_modal'
import EditAlbumModal from './edit_album_modal'
import ShareAlbumModal from './share_album_modal'

type Circle = Tables<'circles'>

export default function AlbumDetailView({
  babyId,
  isAdmin,
  circles,
  albums,
  album,
}: {
  babyId: string
  isAdmin: boolean
  circles: Circle[]
  albums: AlbumOption[]
  album: AlbumWithDetails
}) {
  const router = useRouter()
  const t = useTranslations('albums')
  const tA11y = useTranslations('a11y')
  const confirmAction = useConfirm()
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [addPhotosOpen, setAddPhotosOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [deletingAlbum, setDeletingAlbum] = useState(false)
  const [infoPhotoId, setInfoPhotoId] = useState<string | null>(null)

  const infoPhoto = infoPhotoId ? album.photos.find((photo) => photo.id === infoPhotoId) ?? null : null

  const albumCircles = album.circleIds.map((id) => circles.find((c) => c.id === id))

  const handleDeleteAlbum = async () => {
    if (!(await confirmAction(t('deleteAlbumConfirm')))) return
    setDeletingAlbum(true)
    try {
      await deleteAlbum(album.id, babyId)
      router.push(`/baby/${babyId}/albums`)
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(t('deleteAlbumError'))
      setDeletingAlbum(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{album.name}</h1>
          <p className="text-sm text-landing-muted mt-1">{t('photoCount', { count: album.photos.length })}</p>
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-1 mt-2">
              {albumCircles.length > 0 ? (
                albumCircles.map((circle, index) => (
                  <Badge key={circle?.id ?? index} variant="secondary">
                    {circle?.name ?? t('circleFallback')}
                  </Badge>
                ))
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  {t('adminOnly')}
                </Badge>
              )}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" className="h-11 sm:h-9 gap-2 rounded-2xl cursor-pointer" onClick={() => setAddPhotosOpen(true)}>
              <Plus className="h-4 w-4" />
              <span>{t('addPhotos')}</span>
            </Button>
            <Button variant="outline" className="h-11 sm:h-9 gap-2 rounded-2xl cursor-pointer" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4" />
              <span>{t('share.title')}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="icon" aria-label={tA11y('albumActions')} className="size-11 sm:size-9 rounded-2xl cursor-pointer" />}
                disabled={deletingAlbum}
              >
                {deletingAlbum ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-48">
                <DropdownMenuItem onClick={() => setEditOpen(true)} className="min-h-10 pointer-coarse:min-h-11 gap-3 px-3 cursor-pointer">
                  <Pencil className="text-muted-foreground" />
                  {tA11y('edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDeleteAlbum} variant="destructive" className="min-h-10 pointer-coarse:min-h-11 gap-3 px-3 cursor-pointer">
                  <Trash2 />
                  {tA11y('delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {album.photos.length === 0 ? (
        <p className="text-sm text-landing-muted text-center py-12">{t('emptyPhotos')}</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {album.photos.map((photo, index) => (
            <div key={photo.id} className="relative group aspect-square overflow-hidden rounded-xl bg-landing-background">
              <button
                onClick={() => setLightboxIndex(index)}
                aria-label={tA11y('photoNOfM', { n: index + 1, total: album.photos.length })}
                className="absolute inset-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                {(photo.thumbnailUrl ?? photo.url) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.thumbnailUrl ?? photo.url ?? undefined}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover contain-paint"
                  />
                )}
              </button>
              {isAdmin && (
                <button
                  onClick={() => setInfoPhotoId(photo.id)}
                  title={t('photoInfo')}
                aria-label={t('photoInfo')}
                  className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity cursor-pointer touch-target outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <Info className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={album.photos}
          initialIndex={lightboxIndex}
          alt={album.name}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {addPhotosOpen && (
        <AddPhotosModal
          babyId={babyId}
          albumId={album.id}
          onClose={() => setAddPhotosOpen(false)}
        />
      )}

      {editOpen && (
        <EditAlbumModal
          babyId={babyId}
          album={album}
          circles={circles}
          onClose={() => setEditOpen(false)}
        />
      )}

      {shareOpen && (
        <ShareAlbumModal
          babyId={babyId}
          albumId={album.id}
          onClose={() => setShareOpen(false)}
        />
      )}

      {infoPhoto && (
        <PhotoInfoModal
          babyId={babyId}
          photo={infoPhoto}
          currentAlbumId={album.id}
          currentAlbumName={album.name}
          albums={albums}
          circles={circles}
          onClose={() => setInfoPhotoId(null)}
        />
      )}
    </div>
  )
}
