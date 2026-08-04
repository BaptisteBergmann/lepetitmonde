import { BookOpen, CalendarDays, Dices, Shirt, ShoppingCart, Users, LucideIcon } from 'lucide-react'
import { Enums } from '@utils/supabase/database.types'

export type PageId = 'feed' | 'calendar' | 'guess' | 'inventory' | 'buy-list' | 'admin'

export type PageRegistryEntry = {
  id: PageId
  name: string
  eyebrow: string
  description: string
  icon: LucideIcon
  defaultRole: Enums<'role'>
  defaultEnabled: boolean
  manageable: boolean
}

// Single source of truth for every real page — replaces the header.tsx pages
// array, mobile_menu.tsx's icon ternary, and baby/[babyId]/page.tsx's SECTIONS
// array, which used to be hand-kept in sync and drifted (inventory/buy-list
// were missing from the landing page despite being in the nav).
export const PAGE_REGISTRY: PageRegistryEntry[] = [
  {
    id: 'feed',
    name: 'Journal',
    eyebrow: 'Page — Le quotidien',
    description: 'Photos, vidéos et petits mots du jour, partagés en famille.',
    icon: BookOpen,
    defaultRole: 'viewer',
    defaultEnabled: true,
    manageable: true,
  },
  {
    id: 'calendar',
    name: 'Calendrier',
    eyebrow: 'Page — Les grandes étapes',
    description: 'Rendez-vous, poussées de croissance et jalons à venir.',
    icon: CalendarDays,
    defaultRole: 'viewer',
    defaultEnabled: true,
    manageable: true,
  },
  {
    id: 'guess',
    name: 'Pronostics',
    eyebrow: 'Page — Les paris de famille',
    description: 'Prénom, poids, date de naissance : les paris de toute la famille.',
    icon: Dices,
    defaultRole: 'viewer',
    defaultEnabled: true,
    manageable: true,
  },
  {
    id: 'inventory',
    name: 'Inventaire',
    eyebrow: 'Page — Ce qu\'on a, ce qu\'il faut',
    description: 'Suivez ce que vous possédez déjà, ce qu\'il reste à acheter, et combien vous avez dépensé.',
    icon: Shirt,
    defaultRole: 'admin',
    defaultEnabled: true,
    manageable: true,
  },
  {
    id: 'buy-list',
    name: 'Liste d\'achats',
    eyebrow: 'Page — On y va ensemble',
    description: 'Ce qu\'il reste à acheter. Cochez au fur et à mesure, tout le monde voit la mise à jour en direct.',
    icon: ShoppingCart,
    defaultRole: 'viewer',
    defaultEnabled: true,
    manageable: true,
  },
  {
    id: 'admin',
    name: 'Administration',
    eyebrow: 'Page — Le cercle',
    description: 'Gérez qui a accès au journal et organisez le cercle de partage.',
    icon: Users,
    defaultRole: 'admin',
    defaultEnabled: true,
    manageable: false,
  },
]
