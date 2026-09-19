'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Tables } from '@utils/supabase/database.types'
import { AlbumSummary, AlbumPhotoWithAlbum } from '@utils/actions/albums'
import { Button } from '@/components/ui/button'
import { cn } from '@utils/utils'
import { Plus, ImagePlus, Info, Images as ImagesIcon } from 'lucide-react'
import PhotoLightbox from '@/components/photo_lightbox'
import CreateAlbumModal from './create_album_modal'
import AddPhotosModal from './add_photos_modal'
import PhotoInfoModal from './photo_info_modal'

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
  albums: AlbumSummary[]
  allPhotos: AlbumPhotoWithAlbum[]
}) {
  const t = useTranslations('albums')
  const [tab, setTab] = useState<Tab>('photos')
  const [createOpen, setCreateOpen] = useState(false)
  const [addPhotosOpen, setAddPhotosOpen] = useState(false)
  const [infoPhotoId, setInfoPhotoId] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const infoPhoto = infoPhotoId ? allPhotos.find((photo) => photo.id === infoPhotoId) ?? null : null

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
                {isAdmin && (
                  <button
                    onClick={() => setInfoPhotoId(photo.id)}
                    title={t('photoInfo')}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer touch-target pointer-coarse:p-2"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
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
                  <p className="text-xs text-landing-muted">{t('photoCount', { count: album.photoCount })}</p>
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

      {infoPhoto && (
        <PhotoInfoModal
          babyId={babyId}
          photo={infoPhoto}
          currentAlbumId={infoPhoto.albumId}
          currentAlbumName={infoPhoto.albumName}
          albums={albums}
          circles={circles}
          onClose={() => setInfoPhotoId(null)}
        />
      )}
    </div>
  )
}
