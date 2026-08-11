'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@utils/supabase/server'
import { Enums } from '@utils/supabase/database.types'
import { LucideIcon } from 'lucide-react'
import { logger } from '../logger'
import { assertIsAdmin } from './access'
import { getUserAccess } from './users'
import { createTtlCache } from '../cache/ttl-cache'
import { PAGE_REGISTRY, PageId } from '../page_registry'

export type ResolvedPage = {
  id: PageId
  name: string
  eyebrow: string
  description: string
  icon: LucideIcon
  enabled: boolean
  role: Enums<'role'>
  manageable: boolean
}

// getPageSettings is called on every page load (nav renders on every request,
// plus every protected page calls assertPageAccess below) — TTL-cached the
// same way getNicknamesByBaby is, or it turns into a query per navigation.
const pageOverridesCache = createTtlCache<Awaited<ReturnType<typeof fetchPageOverrides>>>(5_000)

async function fetchPageOverrides(babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: fetchPageOverrides.name, babyId })
  const { data, error } = await supabase
    .from('page_settings')
    .select('*')
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error fetching page settings"); return [] }
  return data
}

export async function getPageSettings(babyId: string): Promise<ResolvedPage[]> {
  const overrides = await pageOverridesCache.get(babyId, () => fetchPageOverrides(babyId))
  const overrideByPageId = new Map(overrides.map((row) => [row.page_id, row]))
  const t = await getTranslations('pages')

  return PAGE_REGISTRY.map((page) => {
    const name = t(`${page.id}.name`)
    const eyebrow = t(`${page.id}.eyebrow`)
    const description = t(`${page.id}.description`)

    // admin is always enabled/admin-only regardless of any DB row — defense
    // in depth even though the admin UI never offers to edit it.
    if (page.id === 'admin') {
      return {
        id: page.id,
        name,
        eyebrow,
        description,
        icon: page.icon,
        manageable: page.manageable,
        enabled: true,
        role: 'admin',
      }
    }

    const override = overrideByPageId.get(page.id)
    return {
      id: page.id,
      name,
      eyebrow,
      description,
      icon: page.icon,
      manageable: page.manageable,
      enabled: override?.enabled ?? page.defaultEnabled,
      role: override?.required_role ?? page.defaultRole,
    }
  })
}

export async function updatePageSetting(babyId: string, pageId: PageId, settings: { enabled: boolean; role: Enums<'role'> }) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updatePageSetting.name, babyId, pageId })
  await assertIsAdmin(supabase, babyId)

  const entry = PAGE_REGISTRY.find((page) => page.id === pageId)
  if (!entry || !entry.manageable) {
    const t = await getTranslations('pages')
    throw new Error(t('cannotConfigure'))
  }

  const { error } = await supabase
    .from('page_settings')
    .upsert(
      { baby_id: babyId, page_id: pageId, enabled: settings.enabled, required_role: settings.role },
      { onConflict: 'baby_id,page_id' }
    )

  if (error) { contextLogger.error(error, "Error updating page setting"); throw error }

  contextLogger.info(settings, "Page setting updated")

  revalidatePath(`/baby/${babyId}`, 'layout')
}

// The enforcement primitive every protected page calls — blocks direct URL
// access, not just nav visibility. Redirects to the baby's own landing page,
// which is safe from a loop perspective: it never redirects further, it only
// filters which section cards it shows.
export async function assertPageAccess(babyId: string, pageId: PageId) {
  const contextLogger = logger.child({ function: assertPageAccess.name, babyId, pageId })

  const settings = await getPageSettings(babyId)
  const page = settings.find((p) => p.id === pageId)

  const access = await getUserAccess(babyId)
  const accessLevel = !Array.isArray(access) ? access.access_level : undefined

  const allowed = !!page?.enabled && !!accessLevel && (accessLevel === 'admin' || accessLevel === page.role)
  if (!allowed) {
    contextLogger.warn({ accessLevel, pageEnabled: page?.enabled, requiredRole: page?.role }, "Blocked page access")
    redirect(`/baby/${babyId}`)
  }
}
