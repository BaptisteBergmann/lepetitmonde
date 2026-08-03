// proxy.ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@utils/supabase/middleware'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

// On définit sur quelles routes le middleware doit s'exécuter
export const config = {
  matcher: [
    /*
     * Protège toutes les routes sauf :
     * - _next/static (fichiers statiques)
     * - _next/image (optimisation d'images)
     * - favicon.ico (icône du site)
     * - les images (svg, png, jpg, etc.)
     * - api (chaque route gère elle-même son auth et renvoie du JSON,
     *   pas une redirection HTML vers /login)
     * - manifest.webmanifest et sw.js (doivent rester accessibles sans session :
     *   un redirect HTML vers /login casse le parsing JSON du manifest et
     *   l'enregistrement du service worker, empêchant le prompt d'installation PWA)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
