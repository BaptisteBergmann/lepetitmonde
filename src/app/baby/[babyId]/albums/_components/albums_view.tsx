'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Tables } from '@utils/supabase/database.types'
import { AlbumWithDetails, AlbumPhotoWithAlbum, deletePhoto } from '@utils/actions/albums'
import { Button } from '@/components/ui/button'
import { cn } from '@utils/utils'
import { Plus, ImagePlus, FolderPlus, Trash2, Loader2, Images as ImagesIcon } from 'lucide-react'
import PhotoLightbox from '@/components/photo_lightbox'
import CreateAlbumModal from './create_album_modal'
import AddPhotosModal from './add_photos_modal'
import AssignToAlbumModal from './assign_to_album_modal'

type Circle = Tables<'circles'>
type Tab = 'photos' | 'albums'

export default function AlbumsView({
  babyId,
  isAdmin,
  circles,
  albums,
  allPhotos,
}: {
  babyId: string
  isAdmin: boolean
  circles: Circle[]
  albums: AlbumWithDetails[]
  allPhotos: AlbumPhotoWithAlbum[]
}) {
  const router = useRouter()
  const t = useTranslations('albums')
  const [tab, setTab] = useState<Tab>('photos')
  const [createOpen, setCreateOpen] = useState(false)
  const [addPhotosOpen, setAddPhotosOpen] = useState(false)
  const [assigningPhotoId, setAssigningPhotoId] = useState<string | null>(null)
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm(t('deletePhotoConfirm'))) return
    setDeletingPhotoId(photoId)
    try {
      await deletePhoto(photoId, babyId)
      router.refresh()
    } catch (err) {
      console.error(err)
      alert(t('deletePhotoError'))
    } finally {
      setDeletingPhotoId(null)
    }
  }

  return (
    <div className="relative space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-2xl bg-landing-surface border border-landing-border p-1">
          <button
            onClick={() => setTab('photos')}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-xl transition-colors cursor-pointer",
              tab === 'photos' ? "bg-primary text-primary-foreground" : "text-landing-muted hover:text-landing-foreground"
            )}
          >
            {t('tabAllPhotos')}
          </button>
          <button
            onClick={() => setTab('albums')}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-xl transition-colors cursor-pointer",
              tab === 'albums' ? "bg-primary text-primary-foreground" : "text-landing-muted hover:text-landing-foreground"
            )}
          >
            {t('tabAlbums')}
          </button>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2 rounded-2xl cursor-pointer" onClick={() => setAddPhotosOpen(true)}>
              <ImagePlus className="h-4 w-4" />
              <span>{t('addPhotos')}</span>
            </Button>
            <Button className="gap-2 rounded-2xl cursor-pointer" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              <span>{t('newAlbum')}</span>
            </Button>
          </div>
        )}
      </div>

      {tab === 'photos' ? (
        allPhotos.length === 0 ? (
          <p className="text-sm text-landing-muted text-center py-12">{t('emptyPhotos')}</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {allPhotos.map((photo, index) => (
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
                {isAdmin && photo.albumId === null && (
                  <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setAssigningPhotoId(photo.id)}
                      title={t('addToAlbum')}
                      className="p-1 rounded-full bg-black/50 text-white cursor-pointer"
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeletePhoto(photo.id)}
                      disabled={deletingPhotoId === photo.id}
                      className="p-1 rounded-full bg-black/50 text-white cursor-pointer"
                    >
                      {deletingPhotoId === photo.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        albums.length === 0 ? (
          <p className="text-sm text-landing-muted text-center py-12">{t('empty')}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {albums.map((album) => (
              <Link
                key={album.id}
                href={`/baby/${babyId}/albums/${album.id}`}
                className="group rounded-2xl bg-landing-surface border border-landing-border overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="relative aspect-square bg-landing-background flex items-center justify-center">
                  {album.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={album.coverUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover contain-paint group-hover:scale-[1.02] transition-transform"
                    />
                  ) : (
                    <ImagesIcon className="h-8 w-8 text-landing-muted" />
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-landing-foreground truncate">{album.name}</p>
                  <p className="text-xs text-landing-muted">{t('photoCount', { count: album.photos.length })}</p>
                </div>
              </Link>
            ))}
          </div>
        )
      )}

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={allPhotos}
          initialIndex={lightboxIndex}
          alt=""
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {createOpen && (
        <CreateAlbumModal
          babyId={babyId}
          circles={circles}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {addPhotosOpen && (
        <AddPhotosModal
          babyId={babyId}
          albumId={null}
          onClose={() => setAddPhotosOpen(false)}
        />
      )}

      {assigningPhotoId && (
        <AssignToAlbumModal
          babyId={babyId}
          photoId={assigningPhotoId}
          albums={albums}
          onClose={() => setAssigningPhotoId(null)}
        />
      )}
    </div>
  )
}
