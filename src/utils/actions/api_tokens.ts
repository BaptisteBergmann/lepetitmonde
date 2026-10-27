'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { createAdminClient } from '@utils/supabase/admin'
import type { Tables } from '@utils/supabase/database.types'
import { logger } from '../logger'
import { actionError } from './errors'
import { normalizeText } from '../feed-validation'
import { API_TOKEN_EXPIRY_DAYS, INPUT_LIMITS } from '../input-limits'
import { generateApiToken, hashApiToken } from '../api-token'

// api_tokens has no grants for the cookie client, so these go through the
// service role. Every query is scoped by the session's user id by hand.
async function requireUserId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')
  return user.id
}

export type ApiTokenSummary = Pick<Tables<'api_tokens'>, 'id' | 'name' | 'created_at' | 'last_used_at' | 'expires_at'>

// Active = not revoked and not expired.
export async function getApiTokens(): Promise<ApiTokenSummary[]> {
  const userId = await requireUserId()
  const contextLogger = logger.child({ function: getApiTokens.name, userId })

  const { data, error } = await createAdminClient()
    .from('api_tokens')
    .select('id, name, created_at, last_used_at, expires_at')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })

  if (error) { contextLogger.error(error, 'Error fetching API tokens'); return [] }
  return data
}

// expiresInDays: 30, 90, or null for a token that never expires.
export async function createApiToken(name: string, expiresInDays: number | null): Promise<{ token: string }> {
  const userId = await requireUserId()
  const contextLogger = logger.child({ function: createApiToken.name, userId })

  const cleanName = await normalizeText(name, INPUT_LIMITS.apiTokenName, { requiredKey: 'textRequired' })

  if (expiresInDays !== null && !(API_TOKEN_EXPIRY_DAYS as readonly number[]).includes(expiresInDays)) {
    throw await actionError('invalidInput')
  }

  const admin = createAdminClient()

  const { count, error: countError } = await admin
    .from('api_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

  if (countError) { contextLogger.error(countError, 'Error counting API tokens'); throw countError }
  if ((count ?? 0) >= INPUT_LIMITS.apiTokenMaxActive) throw await actionError('apiTokenLimitReached')

  const token = generateApiToken()
  const expiresAt = expiresInDays === null
    ? null
    : new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: row, error } = await admin
    .from('api_tokens')
    .insert({ user_id: userId, name: cleanName, token_hash: hashApiToken(token), expires_at: expiresAt })
    .select('id')
    .single()

  if (error) { contextLogger.error(error, 'Error creating API token'); throw error }
  contextLogger.info({ tokenId: row.id }, 'API token created')

  revalidatePath('/settings')
  return { token }
}

export async function revokeApiToken(id: string) {
  const userId = await requireUserId()
  const contextLogger = logger.child({ function: revokeApiToken.name, userId, tokenId: id })

  if (typeof id !== 'string') throw await actionError('invalidInput')

  // id and user_id together: one user can never revoke another's token.
  const { data, error } = await createAdminClient()
    .from('api_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .select('id')

  if (error) { contextLogger.error(error, 'Error revoking API token'); throw error }
  if (!data || data.length === 0) throw await actionError('apiTokenNotFound')
  contextLogger.info('API token revoked')

  revalidatePath('/settings')
}
