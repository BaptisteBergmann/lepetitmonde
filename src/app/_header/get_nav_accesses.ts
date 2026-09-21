import { getAllUserAccess } from '@/utils/actions/users'
import { getPageSettings } from '@/utils/actions/page_settings'
import { AccessWithPages } from './types'

// Extracted out of header.tsx so Header (top nav) and BottomNav agree on
// exactly which pages the current user can navigate to.
export async function getNavAccesses(): Promise<AccessWithPages[]> {
  const allUserAccess = await getAllUserAccess()

  return Promise.all(allUserAccess.map(async (acc) => {
    const pages = await getPageSettings(acc.baby_id)
    return {
      ...acc,
      // Plain objects only — this crosses into Client Components, and
      // ResolvedPage's `icon` (a function reference) can't cross that
      // boundary. See the note on NavPage in ./types.
      allowedPages: pages
        .filter((page) => page.enabled && (acc.access_level === "admin" || acc.access_level === page.role))
        .map((page) => ({ id: page.id, name: page.name, role: page.role, enabled: page.enabled }))
    }
  }))
}
