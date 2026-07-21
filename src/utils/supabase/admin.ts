import { createClient } from '@supabase/supabase-js'

// Bypasses Supabase Storage RLS: this project defines no storage.buckets /
// storage.objects policies, so the anon/authenticated role has zero access
// and every storage operation must go through the service role. Callers are
// responsible for verifying the user is authorized (assertIsAdmin,
// getUserAccess) before using this client.
export function createAdminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SERVICE_ROLE_KEY!)
}
