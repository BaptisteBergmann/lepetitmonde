import 'server-only'
import { createAdminClient } from '@utils/supabase/admin'
import { logger } from '../logger'

// Same rule as createApiToken: MCP tools are admin-level, so only someone who
// administers at least one baby may connect an app.
export async function isAdminOfAnyBaby(userId: string): Promise<boolean> {
  const { count, error } = await createAdminClient()
    .from('baby_access')
    .select('baby_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('access_level', 'admin')
  if (error) {
    logger.child({ function: isAdminOfAnyBaby.name, userId }).error(error, 'Error checking admin access')
    throw error
  }
  return (count ?? 0) > 0
}
