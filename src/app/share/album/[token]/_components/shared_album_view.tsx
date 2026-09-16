'use client'

import { useState } from 'react'
import { AlbumWithDetails } from '@utils/actions/albums'
import PhotoLightbox from '@/components/photo_lightbox'

export default function SharedAlbumView({ album }: { album: AlbumWithDetails }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {album.photos.map((photo, index) => (
          <button
            key={photo.id}
            onClick={() => setLightboxIndex(index)}
            className="relative aspect-square overflow-hidden rounded-xl bg-landing-background cursor-pointer"
          >
            {photo.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.url}
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
