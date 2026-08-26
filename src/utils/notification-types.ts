import { Enums } from '@utils/supabase/database.types'

// Labels used to live here as a literal Record<type, string>; they're now
// resolved from the `notificationTypes.<type>` messages instead (see
// consumers using useTranslations('notificationTypes')), so a locale switch
// doesn't need a code change here.
export const ALL_NOTIFICATION_TYPES: Enums<'notification_type'>[] = [
  'new_post',
  'new_comment',
  'new_pronostic',
  'new_member',
  'new_reaction',
  'new_life_stage',
  'circle_access_granted',
  'new_story',
  'new_anecdote',
  'new_comment_reaction',
]

export const ADMIN_ONLY_TYPES: Enums<'notification_type'>[] = ['new_member']
