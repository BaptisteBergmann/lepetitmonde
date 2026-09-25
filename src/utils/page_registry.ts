import { BookOpen, CalendarDays, Dices, Images, ListChecks, Package, ShoppingCart, Sparkles, Users, LucideIcon } from 'lucide-react'
import { Enums } from '@utils/supabase/database.types'

export type PageId = 'feed' | 'calendar' | 'guess' | 'anecdotes' | 'albums' | 'inventory' | 'buy-list' | 'todo' | 'admin'

export type PageRegistryEntry = {
  id: PageId
  icon: LucideIcon
  defaultRole: Enums<'role'>
  defaultEnabled: boolean
  manageable: boolean
}

// Single source of truth for every real page — replaces the header.tsx pages
// array, mobile_menu.tsx's icon ternary, and baby/[babyId]/page.tsx's SECTIONS
// array, which used to be hand-kept in sync and drifted (inventory/buy-list
// were missing from the landing page despite being in the nav).
//
// name/eyebrow/description used to live here as literal strings; they're now
// resolved from the `pages.<id>.*` messages keyed by `id` (see
// getPageSettings in actions/page_settings.ts), so a locale switch doesn't
// need a code change here.
export const PAGE_REGISTRY: PageRegistryEntry[] = [
  {
    id: 'feed',
    icon: BookOpen,
    defaultRole: 'viewer',
    defaultEnabled: true,
    manageable: true,
  },
  {
    id: 'calendar',
    icon: CalendarDays,
    defaultRole: 'viewer',
    defaultEnabled: false,
    manageable: true,
  },
  {
    id: 'guess',
    icon: Dices,
    defaultRole: 'viewer',
    defaultEnabled: true,
    manageable: true,
  },
  {
    id: 'anecdotes',
    icon: Sparkles,
    defaultRole: 'viewer',
    defaultEnabled: false,
    manageable: true,
  },
  {
    id: 'albums',
    icon: Images,
    defaultRole: 'viewer',
    defaultEnabled: false,
    manageable: true,
  },
  {
    id: 'inventory',
    icon: Package,
    defaultRole: 'admin',
    defaultEnabled: false,
    manageable: true,
  },
  {
    id: 'buy-list',
    icon: ShoppingCart,
    defaultRole: 'viewer',
    defaultEnabled: false,
    manageable: true,
  },
  {
    id: 'todo',
    icon: ListChecks,
    defaultRole: 'admin',
    defaultEnabled: false,
    manageable: true,
  },
  {
    id: 'admin',
    icon: Users,
    defaultRole: 'admin',
    defaultEnabled: true,
    manageable: false,
  },
]
