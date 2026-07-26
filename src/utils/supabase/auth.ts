import { cache } from 'react'
import { createClient } from '@utils/supabase/server'
import { createTtlCache } from '../cache/ttl-cache'

async function verifyUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  return supabase.auth.getUser()
}

// Short cross-request cache for the verified user, keyed by access token.
// Absorbs the burst of getAuthUser() calls a single page load fires (one per
// post-card widget) and repeat calls from several concurrent viewers, without
// weakening the "never trust the client" check: getSession() below only
// decodes the cookie locally (no network call), so it's safe to use purely as
// a cache key — verifyUser() still re-verifies the token against Supabase's
// auth server on every cache miss, at least once every few seconds per token.
const authUserCache = createTtlCache<Awaited<ReturnType<typeof verifyUser>>>(5_000)

// Dedupes repeat auth.getUser() calls within a single request/render.
// Still verifies the JWT against Supabase once per request — safe per
// the "never trust the client" rule, just not re-verified redundantly.
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return verifyUser(supabase)

  return authUserCache.get(session.access_token, () => verifyUser(supabase))
})
