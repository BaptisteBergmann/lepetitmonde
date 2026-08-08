import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Pages reachable without being logged in.
const PUBLIC_PAGES = ['/login', '/signup', '/forgot-password', '/invite']
// Of those, pages an authenticated user should be bounced away from (back to
// '/') rather than being allowed to view. /signup and /invite are excluded:
// /signup just forwards to /invite (preserving its query string), and an
// already-logged-in user visiting /invite?token=... is redeeming an invite to
// a *second* baby, which is a valid thing to do while authenticated.
const AUTH_ONLY_PAGES = ['/login', '/forgot-password']
// Routes reachable regardless of session state (e.g. the recovery-link callback,
// which must run even for an already-authenticated user re-clicking an old link).
const ALWAYS_PUBLIC_PATHS = ['/auth']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const pathname = request.nextUrl.pathname

  if (ALWAYS_PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return supabaseResponse
  }

  // IMPORTANT: do not run code between createServerClient and getUser().
  // A simple mistake could make it very hard to debug issues with users
  // being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPublicPage = PUBLIC_PAGES.some((path) => pathname.startsWith(path))
  const isAuthOnlyPage = AUTH_ONLY_PAGES.some((path) => pathname.startsWith(path))

  if (!user && !isPublicPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  if (user && isAuthOnlyPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // IMPORTANT: any response returned here must carry the cookies set above
  // (supabaseResponse), otherwise the session refresh is lost.
  return supabaseResponse
}
