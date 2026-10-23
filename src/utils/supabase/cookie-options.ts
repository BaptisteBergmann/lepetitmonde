import type { CookieOptions } from '@supabase/ssr'

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 3600

// The app has no browser Supabase client and never reads auth cookies from
// document.cookie, so HttpOnly is safe. `secure` follows NODE_ENV so
// `pnpm dev` on http://localhost keeps working.
export const SUPABASE_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
}

// @supabase/ssr 0.12.0 merges cookieOptions but then forces its own 400-day
// maxAge when it sets a session cookie, so a maxAge in cookieOptions is
// ignored. The lifetime is clamped here, inside the setAll callbacks. 0 is
// left alone because sign-out deletes cookies with maxAge 0.
export function clampCookieMaxAge(options: CookieOptions): CookieOptions {
  if (typeof options.maxAge === 'number' && options.maxAge > 0) {
    return { ...options, maxAge: Math.min(options.maxAge, SESSION_MAX_AGE_SECONDS) }
  }
  return options
}
