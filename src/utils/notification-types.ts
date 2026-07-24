import { Enums } from '@utils/supabase/database.types'

export const NOTIFICATION_LABELS: Record<Enums<'notification_type'>, string> = {
  new_post: 'Nouvelles publications',
  new_comment: 'Nouveaux commentaires',
  new_pronostic: 'Nouveaux pronostics',
  new_member: 'Nouveaux membres',
  new_reaction: 'Réactions sur vos publications',
  new_milestone: 'Nouvelles étapes du calendrier',
  circle_access_granted: 'Accès à un groupe',
}

export const ADMIN_ONLY_TYPES: Enums<'notification_type'>[] = ['new_member']

export const ALL_NOTIFICATION_TYPES = Object.keys(NOTIFICATION_LABELS) as Enums<'notification_type'>[]
