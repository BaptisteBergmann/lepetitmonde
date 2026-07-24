import { Tables } from '@utils/supabase/database.types'

type NamedUser = Pick<Tables<'users'>, 'first_name' | 'last_name' | 'nickname'>

export function getDisplayName(user: NamedUser | null | undefined): string {
  if (!user) return ''
  if (user.nickname) return user.nickname
  return [user.first_name, user.last_name].filter(Boolean).join(' ')
}

// Compact preview for popovers: "Alice, Bob, Charlie ..." instead of an
// unbounded list once many people have reacted/viewed.
export function formatNamesPreview(names: string[], max = 3): string {
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} ...`
}
