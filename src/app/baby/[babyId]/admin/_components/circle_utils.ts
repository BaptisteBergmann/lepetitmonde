import type { Tables } from '@utils/supabase/database.types'

type User = Tables<'users'>

export function getMemberLabel(
  user: User | undefined,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
) {
  if (!user) return t('unknownMember')
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
  return fullName || t('memberFallback', { id: user.id.substring(0, 8) })
}

// Sentinel for "no parent" in a Select, which can't hold null.
export const TOP_LEVEL = '__top__'
