import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@utils/supabase/admin'
import type { Tables } from '@utils/supabase/database.types'
import { logger } from '../logger'
import { CLIENT_SECRET_PREFIX } from './config'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type OAuthClient = Tables<'oauth_clients'>

export function sha256Hex(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function generateClientSecret() {
  return CLIENT_SECRET_PREFIX + randomBytes(32).toString('base64url')
}

export type ClientLookup =
  | { status: 'ok'; client: OAuthClient }
  | { status: 'not_found' }
  | { status: 'error' }

export async function findClient(clientId: unknown): Promise<ClientLookup> {
  if (typeof clientId !== 'string' || !UUID_RE.test(clientId)) return { status: 'not_found' }
  const { data, error } = await createAdminClient()
    .from('oauth_clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle()
  if (error) {
    logger.child({ function: findClient.name, clientId }).error(error, 'Error looking up OAuth client')
    return { status: 'error' }
  }
  return data ? { status: 'ok', client: data as OAuthClient } : { status: 'not_found' }
}

export type ClientAuth =
  | { status: 'ok'; client: OAuthClient }
  // `why` is for logs only (an enum, never a value); clients only ever see invalid_client.
  | { status: 'invalid_client'; why: string }
  | { status: 'error' }

function parseBasic(header: string | null): { id: string; secret: string } | null {
  const match = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(header ?? '')
  if (!match) return null
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8')
    const idx = decoded.indexOf(':')
    if (idx < 0) return null
    // RFC 6749 section 2.3.1: both parts are form-urlencoded before base64.
    return { id: decodeURIComponent(decoded.slice(0, idx)), secret: decodeURIComponent(decoded.slice(idx + 1)) }
  } catch {
    return null
  }
}

// Identifies and authenticates the client of a token/revoke request. Public clients
// (method none) must not send a secret; confidential ones must send the right one,
// either in the body or in the Basic header.
export async function authenticateClient(headers: Headers, body: URLSearchParams): Promise<ClientAuth> {
  const basic = parseBasic(headers.get('authorization'))
  const bodyId = body.get('client_id')
  const clientId = basic?.id ?? bodyId
  if (basic && bodyId && bodyId !== basic.id) return { status: 'invalid_client', why: 'basic_body_id_conflict' }
  const secret = basic?.secret ?? body.get('client_secret')

  const lookup = await findClient(clientId)
  if (lookup.status === 'error') return { status: 'error' }
  if (lookup.status === 'not_found') return { status: 'invalid_client', why: clientId ? 'client_not_found' : 'no_client_id' }
  const { client } = lookup

  if (client.token_endpoint_auth_method === 'none') {
    return secret ? { status: 'invalid_client', why: 'secret_sent_by_public_client' } : { status: 'ok', client }
  }

  if (!secret || !client.client_secret_hash) return { status: 'invalid_client', why: 'no_secret' }
  const given = Buffer.from(sha256Hex(secret))
  const stored = Buffer.from(client.client_secret_hash)
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return { status: 'invalid_client', why: 'secret_mismatch' }
  return { status: 'ok', client }
}
