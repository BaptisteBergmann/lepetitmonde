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
// be called with a babyId that didn't come from a valid, unexpired, unused,
// unrevoked token.
export type ValidInvitation = {
  readonly invitationId: string
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
    .select('id, baby_id, expires_at, used_at, revoked_at, babies(baby_surname)')
    .eq('id', token)
    .maybeSingle()

  if (error) {
    contextLogger.error(error, 'Error reading invitation')
    return null
  }
  if (!data) return null

  // Log the reason with the baby only, never the token.
  if (data.revoked_at) {
    contextLogger.info({ babyId: data.baby_id }, 'Invitation revoked')
    return null
  }
  if (data.used_at) {
    contextLogger.info({ babyId: data.baby_id }, 'Invitation already used')
    return null
  }
  if (new Date(data.expires_at) < new Date()) {
    contextLogger.info({ babyId: data.baby_id }, 'Invitation expired')
    return null
  }

  // Many-to-one embed: PostgREST returns an object, but the untyped admin
  // client infers an array.
  const baby = data.babies as unknown as Pick<Tables<'babies'>, 'baby_surname'> | null

  return {
    invitationId: data.id as string,
    babyId: data.baby_id as string,
    babySurname: baby?.baby_surname ?? '',
  } as ValidInvitation
}

export type GrantViewerAccessResult =
  | { error: null }
  | { error: 'invitationUnavailable' | 'consumeFailed' | 'addAccessError' }

// Always the default `viewer` level: invitations carry no level, and an
// explicit value here keeps a later column default change from silently
// widening what an invite grants.
//
// Single-use: the link is consumed first with one conditional UPDATE, so two
// parallel redemptions can't both win. baby_access is only inserted after a
// successful consume; if that insert fails the link is released again.
export async function grantViewerAccess(
  invitation: ValidInvitation,
  userId: string,
): Promise<GrantViewerAccessResult> {
  const contextLogger = logger.child({
    function: grantViewerAccess.name,
    babyId: invitation.babyId,
    userId,
  })

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: consumed, error: consumeError } = await admin
    .from('invitations')
    .update({ used_at: now, used_by: userId })
    .eq('id', invitation.invitationId)
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .select('id')

  if (consumeError) {
    contextLogger.error(consumeError, 'Error consuming invitation')
    return { error: 'consumeFailed' }
  }
  if (!consumed || consumed.length === 0) {
    contextLogger.info('Invitation no longer available')
    return { error: 'invitationUnavailable' }
  }

  const { error } = await admin
    .from('baby_access')
    .insert({ user_id: userId, baby_id: invitation.babyId, access_level: 'viewer' })

  if (error) {
    contextLogger.error(error, 'Error granting baby access')
    // Give the link back so the invitee can retry. Scoped to this user so a
    // concurrent consumer's claim is never undone.
    const { error: releaseError } = await admin
      .from('invitations')
      .update({ used_at: null, used_by: null })
      .eq('id', invitation.invitationId)
      .eq('used_by', userId)
    if (releaseError) contextLogger.error(releaseError, 'Error releasing invitation')
    return { error: 'addAccessError' }
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
