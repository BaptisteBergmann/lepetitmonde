"use client"

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { AccessWithPages } from './types'
import { PAGE_REGISTRY } from '@utils/page_registry'
import { getOrderedPages } from './page_order'

// Icons resolved from PAGE_REGISTRY rather than through the `accesses` prop —
// see the note on NavPage in ./types for why icons can't cross the Server →
// Client boundary.
const ICONS_BY_PAGE_ID = new Map<string, typeof PAGE_REGISTRY[number]['icon']>(
  PAGE_REGISTRY.map((page) => [page.id, page.icon])
)

export default function BottomNav({ accesses }: { accesses: AccessWithPages[] }) {
  const params = useParams()
  const pathname = usePathname()
  const currentBabyId = params?.babyId as string

  const babyAccess = accesses.find((acc) => acc.baby_id === currentBabyId)
  const allowedPages = babyAccess?.allowedPages ?? []

  if (!allowedPages.length) return null

  const orderedPages = getOrderedPages(allowedPages)

  return (
    <nav
      className="fixed bottom-0 left-0 z-40 flex w-full items-stretch justify-around gap-0.5 overflow-x-auto border-t border-border bg-background/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
    >
      {orderedPages.map((page) => {
        const Icon = ICONS_BY_PAGE_ID.get(page.id) ?? Menu
        const href = `/baby/${currentBabyId}/${page.id}`
        // startsWith (not exact match): several pages have nested routes
        // (e.g. albums/[albumId]) that should still highlight the tab.
        const isActive = pathname === href || (pathname?.startsWith(`${href}/`) ?? false)

        return (
          <Link
            key={page.id}
            href={href}
            aria-label={page.name}
            className={`relative flex min-w-14 flex-1 items-center justify-center py-3 transition-colors touch-target ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            <Icon className="h-6 w-6 shrink-0" />
          </Link>
        )
      })}
    </nav>
  )
}
