'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Tables } from '@utils/supabase/database.types'
import { AlbumSummary, AlbumWithDetails, deleteAlbum } from '@utils/actions/albums'
import { Button } from '@/components/ui/button'
import { Badge } from '@components/ui/badge'
import { Plus, Pencil, Trash2, Share2, Loader2, Info } from 'lucide-react'
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
  albums: AlbumSummary[]
  album: AlbumWithDetails
}) {
  const router = useRouter()
  const t = useTranslations('albums')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [addPhotosOpen, setAddPhotosOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [deletingAlbum, setDeletingAlbum] = useState(false)
  const [infoPhotoId, setInfoPhotoId] = useState<string | null>(null)

  const infoPhoto = infoPhotoId ? album.photos.find((photo) => photo.id === infoPhotoId) ?? null : null

  const albumCircles = album.circleIds.map((id) => circles.find((c) => c.id === id))

  const handleDeleteAlbum = async () => {
    if (!confirm(t('deleteAlbumConfirm'))) return
    setDeletingAlbum(true)
    try {
      await deleteAlbum(album.id, babyId)
      router.push(`/baby/${babyId}/albums`)
      router.refresh()
    } catch (err) {
      console.error(err)
      alert(t('deleteAlbumError'))
      setDeletingAlbum(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
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
                <Badge variant="destructive">{t('adminOnly')}</Badge>
              )}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" className="gap-2 rounded-2xl cursor-pointer" onClick={() => setAddPhotosOpen(true)}>
              <Plus className="h-4 w-4" />
              <span>{t('addPhotos')}</span>
            </Button>
            <Button variant="outline" className="gap-2 rounded-2xl cursor-pointer" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4" />
              <span>{t('share.title')}</span>
            </Button>
            <Button variant="outline" size="icon" className="rounded-2xl cursor-pointer" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-2xl cursor-pointer text-destructive hover:text-destructive"
              onClick={handleDeleteAlbum}
              disabled={deletingAlbum}
            >
              {deletingAlbum ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
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
                className="absolute inset-0 cursor-pointer"
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
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <Info className="h-3.5 w-3.5" />
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
