'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { createAdminClient } from '@utils/supabase/admin'
import { logger } from '../logger'
import { actionError } from './errors'
import { redirectDisplayHost } from '../oauth/redirect-uri'
import { UUID_RE } from '../oauth/clients'

// oauth_grants has no grants for the cookie client, so these go through the service
// role, always filtered by the session's user id.
async function requireUserId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')
  return user.id
}

export type OAuthConnectionSummary = {
  id: string
  client_name: string
  // Hostname the client redirects to; null for an app on this computer (loopback).
  host: string | null
  created_at: string
  last_used_at: string | null
}

export async function getOAuthGrants(): Promise<OAuthConnectionSummary[]> {
  const userId = await requireUserId()
  const contextLogger = logger.child({ function: getOAuthGrants.name, userId })

  const { data, error } = await createAdminClient()
    .from('oauth_grants')
    .select('id, redirect_uri, created_at, last_used_at, oauth_clients (client_name)')
    .eq('user_id', userId)
    .not('code_used_at', 'is', null)
    .is('revoked_at', null)
    .gt('refresh_expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) { contextLogger.error(error, 'Error fetching OAuth grants'); return [] }

  // Untyped client: the embedded relation is inferred as an array.
  return (data ?? []).map((row) => {
    const client = row.oauth_clients as unknown as { client_name: string } | { client_name: string }[] | null
    const name = (Array.isArray(client) ? client[0] : client)?.client_name ?? ''
    return {
      id: row.id as string,
      client_name: name,
      host: redirectDisplayHost(row.redirect_uri as string),
      created_at: row.created_at as string,
      last_used_at: row.last_used_at as string | null,
    }
  })
}

export async function revokeOAuthGrant(id: string) {
  const userId = await requireUserId()

  if (typeof id !== 'string' || !UUID_RE.test(id)) throw await actionError('invalidInput')

  const contextLogger = logger.child({ function: revokeOAuthGrant.name, userId, grantId: id })

  // id and user_id together: one user can never revoke another's connection.
  const { data, error } = await createAdminClient()
    .from('oauth_grants')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .select('id')

  if (error) { contextLogger.error(error, 'Error revoking OAuth grant'); throw error }
  if (!data || data.length === 0) throw await actionError('oauthGrantNotFound')
  contextLogger.info('OAuth grant revoked')

  revalidatePath('/settings')
}
