import { authorizationServerMetadataResponse, corsPreflight } from '@utils/oauth/metadata'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = () => authorizationServerMetadataResponse()
export const OPTIONS = () => corsPreflight()
