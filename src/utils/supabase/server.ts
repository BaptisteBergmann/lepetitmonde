import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { clampCookieMaxAge, SUPABASE_COOKIE_OPTIONS } from './cookie-options'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, clampCookieMaxAge(options))
            )
          } catch {
            // Cette erreur peut être ignorée si elle est déclenchée depuis un Server Component.
          }
        },
      },
    }
  )
}
