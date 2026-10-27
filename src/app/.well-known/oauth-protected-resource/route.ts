import { corsPreflight, protectedResourceMetadataResponse } from '@utils/oauth/metadata'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = () => protectedResourceMetadataResponse()
export const OPTIONS = () => corsPreflight()
