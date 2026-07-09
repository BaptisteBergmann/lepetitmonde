// middleware.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from './src/utils/supabase/server'

export async function middleware(request: NextRequest) {
  // On crée le client Supabase serveur pour lire les cookies de session
  const supabase = await createClient()

  // On récupère l'utilisateur actuel
  const { data: { user } } = await supabase.auth.getUser()

  // Si l'utilisateur n'est pas connecté et qu'il n'est PAS déjà sur la page de connexion
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    // On le redirige de force vers la page de connexion
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // S'il est connecté (ou qu'il est sur la page de login), on le laisse passer
  return NextResponse.next()
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
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '!/',
  ],
}
