import 'server-only'
import { generateProtectedResourceMetadata } from 'mcp-handler'
import { OAUTH_SCOPE, getOAuthUrls } from './config'
import { corsPreflight, oauthJson } from './http'

// RFC 9728. Static document built from SITE_URL; the request is never inspected.
export function protectedResourceMetadataResponse() {
  const { issuer, mcpResource } = getOAuthUrls()
  return oauthJson(
    generateProtectedResourceMetadata({
      authServerUrls: [issuer],
      resourceUrl: mcpResource,
      additionalMetadata: {
        scopes_supported: [OAUTH_SCOPE],
        bearer_methods_supported: ['header'],
        resource_name: 'Lepetitmonde',
      },
    }),
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  )
}

// RFC 8414.
export function authorizationServerMetadataResponse() {
  const { issuer } = getOAuthUrls()
  return oauthJson(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      registration_endpoint: `${issuer}/api/oauth/register`,
      revocation_endpoint: `${issuer}/api/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      scopes_supported: [OAUTH_SCOPE],
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: false,
    },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  )
}

export { corsPreflight }
