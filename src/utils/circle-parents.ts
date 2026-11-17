// Cookie-bound, cached loader of a baby's circle tree. Not a 'use server' module: it takes
// no user input worth exposing as an endpoint, and it does NOT check membership itself, so
// only call it after the viewer's access to `babyId` has been verified (getCirclesAccess,
// getFeedViewer and the admin actions all do).
import 'server-only'
import { cache } from 'react'
import { createClient } from '@utils/supabase/server'
import { createTtlCache } from './cache/ttl-cache'
import { getCircleParentsWith } from './member-access'
import type { CircleNode } from './circle-tree'

// Same caching as getCirclesAccess: React's cache() dedupes within a request, the short
// TTL absorbs bursts. A moved circle can therefore lag by a few seconds, like membership.
const circleParentsCache = createTtlCache<CircleNode[]>(5_000)

export const getCircleParents = cache(async (babyId: string): Promise<CircleNode[]> =>
  circleParentsCache.get(babyId, async () => getCircleParentsWith(await createClient(), babyId)),
)
