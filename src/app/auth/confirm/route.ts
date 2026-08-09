import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@utils/supabase/server'
import { logger } from '@/utils/logger'

// Redirects are built from SITE_URL rather than request.url: behind the
// reverse proxy, the Host header the app sees doesn't reliably reflect the
// public hostname, which sent users to http://0.0.0.0:3000/...
const siteUrl = process.env.SITE_URL!

export async function GET(request: NextRequest) {
  const contextLogger = logger.child({ function: 'authConfirm' })
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })

    if (!error) {
      return NextResponse.redirect(new URL(next, siteUrl))
    }

    contextLogger.error({ err: error, type }, "verifyOtp failed")
  } else {
    contextLogger.warn({ type }, "Missing token_hash or type on auth confirm link")
  }

  return NextResponse.redirect(new URL('/login?message=Lien invalide ou expiré', siteUrl))
}
