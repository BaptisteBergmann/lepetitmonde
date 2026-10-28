import 'server-only'
import { OAUTH_SCOPE, getOAuthUrls } from './config'
import { findClient } from './clients'
import { logger } from '../logger'
import { CODE_CHALLENGE_RE } from './pkce'
import { redirectDisplayHost, redirectUriMatches } from './redirect-uri'

const MAX_STATE_LENGTH = 500

export type AuthorizeRequest = {
  clientId: string
  clientName: string
  redirectUri: string
  // Hostname to show on the consent page; null for loopback ("an app on this computer").
  redirectHost: string | null
  state: string | null
  codeChallenge: string
  resource: string
  scope: string
}

export type AuthorizeParse =
  | { kind: 'ok'; request: AuthorizeRequest }
  // Never redirect: the client or redirect URI can't be trusted.
  | { kind: 'error_page'; reason: 'invalid_request' | 'unknown_client' | 'invalid_redirect_uri' }
  // The redirect URI is validated, so the error goes back to the client.
  | { kind: 'redirect_error'; url: string }

// Query params for a redirect back to the client. `iss` is RFC 9207 mix-up defence.
export function buildClientRedirect(redirectUri: string, params: Record<string, string | null>) {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) url.searchParams.set(key, value)
  }
  url.searchParams.set('iss', getOAuthUrls().issuer)
  return url.toString()
}

// Shared by the consent page and the approve/deny actions, so the actions never trust
// anything but the raw query.
export async function parseAuthorizeRequest(params: URLSearchParams): Promise<AuthorizeParse> {
  const result = await parse(params)
  if (result.kind !== 'ok') {
    // Third-party clients only ever see a generic error, so log why. No state or
    // challenge values: only their lengths.
    logger.child({ function: parseAuthorizeRequest.name }).warn(
      {
        reason: result.kind === 'error_page' ? result.reason : new URL(result.url).searchParams.get('error'),
        paramKeys: [...params.keys()],
        clientId: params.get('client_id'),
        redirectUri: params.get('redirect_uri'),
        responseType: params.get('response_type'),
        resource: params.get('resource'),
        scope: params.get('scope'),
        codeChallengeMethod: params.get('code_challenge_method'),
        codeChallengeLength: params.get('code_challenge')?.length ?? null,
        stateLength: params.get('state')?.length ?? null,
      },
      'OAuth authorize request rejected',
    )
  }
  return result
}

async function parse(params: URLSearchParams): Promise<AuthorizeParse> {
  // A repeated parameter is ambiguous: refuse rather than pick one.
  for (const key of new Set(params.keys())) {
    if (params.getAll(key).length > 1) return { kind: 'error_page', reason: 'invalid_request' }
  }

  const clientId = params.get('client_id')
  const redirectUri = params.get('redirect_uri')
  if (!clientId || !redirectUri) return { kind: 'error_page', reason: 'invalid_request' }

  const lookup = await findClient(clientId)
  if (lookup.status === 'error') throw new Error('OAuth client lookup failed')
  if (lookup.status === 'not_found') return { kind: 'error_page', reason: 'unknown_client' }
  const { client } = lookup

  if (!redirectUriMatches(client.redirect_uris, redirectUri)) {
    return { kind: 'error_page', reason: 'invalid_redirect_uri' }
  }

  const state = params.get('state')
  const fail = (error: string) => ({
    kind: 'redirect_error' as const,
    url: buildClientRedirect(redirectUri, { error, state: state && state.length <= MAX_STATE_LENGTH ? state : null }),
  })

  if (state !== null && state.length > MAX_STATE_LENGTH) return fail('invalid_request')
  if (params.get('response_type') !== 'code') return fail('unsupported_response_type')

  const codeChallenge = params.get('code_challenge')
  if (!codeChallenge || !CODE_CHALLENGE_RE.test(codeChallenge) || params.get('code_challenge_method') !== 'S256') {
    return fail('invalid_request')
  }

  // The requested scope is ignored: every grant gets OAUTH_SCOPE, and the token response
  // says so (RFC 6749 section 3.3). Clients ask for extras like offline_access or openid,
  // and refusing them would break the connection.

  const { mcpResource } = getOAuthUrls()
  const resource = params.get('resource')
  if (resource && resource !== mcpResource) return fail('invalid_target')

  return {
    kind: 'ok',
    request: {
      clientId: client.id,
      clientName: client.client_name,
      redirectUri,
      redirectHost: redirectDisplayHost(redirectUri),
      state,
      codeChallenge,
      resource: mcpResource,
      scope: OAUTH_SCOPE,
    },
  }
}
