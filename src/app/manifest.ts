import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Journal de Bébé',
    short_name: 'Journal Bébé',
    description: 'Le journal privé de notre bébé',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      {
        "src": "/web-app-manifest-192x192.png",
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "any"
      },
      {
        "src": "/web-app-manifest-192x192.png",
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "maskable"
      },
      {
        "src": "/web-app-manifest-512x512.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "any"
      },
      {
        "src": "/web-app-manifest-512x512.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "maskable"
      }
    ],
    screenshots: [
      {
        src: '/screenshots/1080_1920.png', // Chemin vers votre capture mobile
        sizes: '1080x1920', // Taille réelle de l'image
        type: 'image/png',
        form_factor: 'narrow', // Pour mobile
      },
      {
        src: '/screenshots/1920_1080.png', // Chemin vers votre capture desktop
        sizes: '1920x1080', // Taille réelle de l'image
        type: 'image/png',
        form_factor: 'wide', // Pour desktop
      },
    ],
  }
}
