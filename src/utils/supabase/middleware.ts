import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Pages an authenticated user should be bounced away from (back to '/').
const AUTH_PAGES = ['/login', '/signup', '/forgot-password']
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

  const isAuthPage = AUTH_PAGES.some((path) => pathname.startsWith(path))

  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // IMPORTANT: any response returned here must carry the cookies set above
  // (supabaseResponse), otherwise the session refresh is lost.
  return supabaseResponse
}
