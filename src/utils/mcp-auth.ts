import 'server-only'
import { resolveApiToken, type ResolvedApiToken } from './api-token'
import { resolveOAuthAccessToken } from './oauth/tokens'

export type BearerResolution =
  | { sent: false; resolved: null }
  | { sent: true; resolved: ResolvedApiToken }

// Dispatches on the token prefix: lpm_ is a personal API token (unchanged), lpma_ is
// an OAuth access token. Both resolve to the same { tokenId, userId } the tools use.
export async function resolveBearer(request: Request): Promise<BearerResolution> {
  const match = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')
  if (!match) return { sent: false, resolved: null }
  const token = match[1]
  const resolved = token.startsWith('lpma_') ? await resolveOAuthAccessToken(token) : await resolveApiToken(token)
  return { sent: true, resolved }
}
