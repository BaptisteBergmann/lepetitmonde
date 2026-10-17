'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { LightboxPhoto } from '@/components/photo_lightbox'
import PhotoLightbox from '@/components/photo_lightbox'

export default function SharedPhotosView({
  photos,
  title,
  single,
}: {
  photos: LightboxPhoto[]
  title: string
  single: boolean
}) {
  const tA11y = useTranslations('a11y')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  return (
    <>
      {single ? (
        <div className="flex justify-center min-w-0">
          <button
            onClick={() => setLightboxIndex(0)}
            aria-label={tA11y('photoNOfM', { n: 1, total: 1 })}
            className="max-w-full cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-2xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[0].thumbnailUrl ?? photos[0].url ?? undefined}
              alt={title}
              decoding="async"
              className="w-full max-w-full h-auto max-h-[70vh] object-contain rounded-2xl bg-landing-background"
            />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              onClick={() => setLightboxIndex(index)}
              aria-label={tA11y('photoNOfM', { n: index + 1, total: photos.length })}
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
      )}

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          initialIndex={lightboxIndex}
          alt={title}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
