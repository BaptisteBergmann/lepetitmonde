'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Tables } from '@utils/supabase/database.types'
import { AlbumSummary, AlbumPhotoWithAlbum } from '@utils/actions/albums'
import { Tabs } from '@base-ui/react/tabs'
import { Button } from '@/components/ui/button'
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
  const tA11y = useTranslations('a11y')
  const [tab, setTab] = useState<Tab>('photos')
  const [createOpen, setCreateOpen] = useState(false)
  const [addPhotosOpen, setAddPhotosOpen] = useState(false)
  const [infoPhotoId, setInfoPhotoId] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const infoPhoto = infoPhotoId ? allPhotos.find((photo) => photo.id === infoPhotoId) ?? null : null

  return (
    <div className="relative space-y-4">
      <Tabs.Root value={tab} onValueChange={(value) => setTab(value as Tab)} className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs.List aria-label={t('tabsLabel')} className="isolate inline-flex w-full gap-1 rounded-full bg-muted p-1 sm:w-auto">
            <Tabs.Tab value="photos" className="flex-1 sm:flex-none min-h-11 rounded-full border border-transparent px-4 text-center text-sm leading-tight text-muted-foreground transition-colors cursor-pointer outline-none hover:text-foreground focus-visible:z-10 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 data-[active]:bg-card data-[active]:font-medium data-[active]:text-foreground data-[active]:shadow-sm">
              {t('tabAllPhotos')}
            </Tabs.Tab>
            <Tabs.Tab value="albums" className="flex-1 sm:flex-none min-h-11 rounded-full border border-transparent px-4 text-center text-sm leading-tight text-muted-foreground transition-colors cursor-pointer outline-none hover:text-foreground focus-visible:z-10 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 data-[active]:bg-card data-[active]:font-medium data-[active]:text-foreground data-[active]:shadow-sm">
              {t('tabAlbums')}
            </Tabs.Tab>
          </Tabs.List>

          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-11 flex-1 gap-2 rounded-2xl cursor-pointer sm:h-9 sm:flex-none pointer-coarse:min-h-11" onClick={() => setAddPhotosOpen(true)}>
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
                <span className="whitespace-nowrap">{t('addPhotos')}</span>
              </Button>
              <Button className="h-11 flex-1 gap-2 rounded-2xl cursor-pointer sm:h-9 sm:flex-none pointer-coarse:min-h-11" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="whitespace-nowrap">{t('newAlbum')}</span>
              </Button>
            </div>
          )}
        </div>

        <Tabs.Panel value="photos" className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
          {allPhotos.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="text-sm text-landing-muted">{t('emptyPhotos')}</p>
              {isAdmin && (
                <Button variant="outline" className="h-11 gap-2 rounded-2xl cursor-pointer" onClick={() => setAddPhotosOpen(true)}>
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  <span>{t('addPhotos')}</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {allPhotos.map((photo, index) => (
                <div key={photo.id} className="relative group aspect-square overflow-hidden rounded-xl bg-landing-background">
                  <button
                    onClick={() => setLightboxIndex(index)}
                    aria-label={tA11y('photoNOfM', { n: index + 1, total: allPhotos.length })}
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
        </Tabs.Panel>

        <Tabs.Panel value="albums" className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
          {albums.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="text-sm text-landing-muted">{t('empty')}</p>
              {isAdmin && (
                <Button className="h-11 gap-2 rounded-2xl cursor-pointer" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>{t('newAlbum')}</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {albums.map((album) => (
                <Link
                  key={album.id}
                  href={`/baby/${babyId}/albums/${album.id}`}
                  className="group rounded-2xl bg-landing-surface border border-landing-border overflow-hidden shadow-sm hover:shadow-md transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:border-ring"
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
                    <p className="text-sm font-semibold text-landing-foreground line-clamp-2 break-words">{album.name}</p>
                    <p className="text-xs text-landing-muted">{t('photoCount', { count: album.photoCount })}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Tabs.Panel>
      </Tabs.Root>

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={allPhotos}
          initialIndex={lightboxIndex}
          alt={t('tabAllPhotos')}
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
          albums={albums}
          circles={circles}
          onClose={() => setInfoPhotoId(null)}
        />
      )}
    </div>
  )
}
