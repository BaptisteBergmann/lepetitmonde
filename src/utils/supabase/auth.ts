import { cache } from 'react'
import { createClient } from '@utils/supabase/server'

// Dedupes repeat auth.getUser() calls within a single request/render.
// Still verifies the JWT against Supabase once per request — safe per
// the "never trust the client" rule, just not re-verified redundantly.
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  return supabase.auth.getUser()
})
