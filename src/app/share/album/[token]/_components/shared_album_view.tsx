'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { SharedAlbum } from '@utils/album-share'
import PhotoLightbox from '@/components/photo_lightbox'

export default function SharedAlbumView({ album }: { album: SharedAlbum }) {
  const tA11y = useTranslations('a11y')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {album.photos.map((photo, index) => (
          <button
            key={photo.id}
            onClick={() => setLightboxIndex(index)}
            aria-label={tA11y('photoNOfM', { n: index + 1, total: album.photos.length })}
            className="relative aspect-square overflow-hidden rounded-xl bg-landing-background cursor-pointer outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
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
        ))}
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={album.photos}
          initialIndex={lightboxIndex}
          alt={album.name}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
