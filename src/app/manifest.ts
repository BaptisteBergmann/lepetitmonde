import type { MetadataRoute } from 'next'
import { createTranslator } from 'next-intl'
import { resolveLocale } from '@/i18n/config'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = resolveLocale()
  const messages = (await import(`../../messages/${locale}.json`)).default
  const t = createTranslator({ locale, messages, namespace: 'common' })

  return {
    name: t('appName'),
    short_name: t('appName'),
    description: t('appDescription'),
    start_url: '/',
    display: 'standalone',
    background_color: '#fbf4ec',
    theme_color: '#fbf4ec',
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
