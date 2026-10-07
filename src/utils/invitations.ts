// Invitation lookup and redemption on the service role.
//
// Deliberately NOT a 'use server' module: these helpers bypass RLS and take
// ids with no auth check of their own, so exporting them from an action file
// would let any client read invitations or grant itself access to any baby.
// They exist because the signup path runs before the caller has a session
// (and the join path runs for a non-member of the baby), so the user client
// cannot read `invitations` or self-insert into `baby_access` once RLS is on
// (see .claude/plans/rls.md).
//
// Callers must pass the user id from `auth.signUp` or a verified
// `auth.getUser()`, never one from form data.
import 'server-only'
import { createAdminClient } from '@utils/supabase/admin'
import { logger } from '@utils/logger'
import { Tables } from '@utils/supabase/database.types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

declare const validInvitationBrand: unique symbol

// Only findValidInvitation can produce this type, so grantViewerAccess can't
// be called with a babyId that didn't come from a valid, unexpired token.
export type ValidInvitation = {
  readonly babyId: string
  readonly babySurname: string
  readonly [validInvitationBrand]: true
}

export async function findValidInvitation(token: unknown): Promise<ValidInvitation | null> {
  const contextLogger = logger.child({ function: findValidInvitation.name })

  if (typeof token !== 'string' || !UUID_RE.test(token)) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('invitations')
    .select('baby_id, expires_at, babies(baby_surname)')
    .eq('id', token)
    .maybeSingle()

  if (error) {
    contextLogger.error(error, 'Error reading invitation')
    return null
  }
  if (!data) return null

  if (new Date(data.expires_at) < new Date()) {
    contextLogger.info({ babyId: data.baby_id }, 'Invitation expired')
    return null
  }

  // Many-to-one embed: PostgREST returns an object, but the untyped admin
  // client infers an array.
  const baby = data.babies as unknown as Pick<Tables<'babies'>, 'baby_surname'> | null

  return {
    babyId: data.baby_id as string,
    babySurname: baby?.baby_surname ?? '',
  } as ValidInvitation
}

// Always the default `viewer` level: invitations carry no level, and an
// explicit value here keeps a later column default change from silently
// widening what an invite grants.
export async function grantViewerAccess(invitation: ValidInvitation, userId: string) {
  const contextLogger = logger.child({
    function: grantViewerAccess.name,
    babyId: invitation.babyId,
    userId,
  })

  const admin = createAdminClient()
  const { error } = await admin
    .from('baby_access')
    .insert({ user_id: userId, baby_id: invitation.babyId, access_level: 'viewer' })

  if (error) {
    contextLogger.error(error, 'Error granting baby access')
    return { error }
  }

  contextLogger.info('Baby access granted')
  return { error: null }
}

export async function createUserProfile(userId: string, firstName: string, lastName: string | null) {
  const contextLogger = logger.child({ function: createUserProfile.name, userId })

  const admin = createAdminClient()
  const { error } = await admin
    .from('users')
    .insert({ id: userId, first_name: firstName, last_name: lastName })

  if (error) {
    contextLogger.error(error, 'Error creating user profile')
    return { error }
  }

  contextLogger.info('User profile created')
  return { error: null }
}
