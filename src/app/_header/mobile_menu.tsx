"use client"

import { logout } from '@utils/actions/logout'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LogOut, Settings, Menu } from 'lucide-react'
import { AccessWithPages } from './types'
import { PAGE_REGISTRY } from '@utils/page_registry'

// Icons come from PAGE_REGISTRY directly rather than through the `accesses`
// prop: Lucide icon components are function references, and Next.js can't
// serialize a function value across the Server → Client Component boundary
// (only already-rendered JSX or plain data can cross). Importing the same
// registry module here keeps this as the only place resolving id → icon,
// still without duplicating the icon list itself.
const ICONS_BY_PAGE_ID = new Map<string, typeof PAGE_REGISTRY[number]['icon']>(
  PAGE_REGISTRY.map((page) => [page.id, page.icon])
)

interface MobileMenuProps {
  initials: string
  fullName: string
  email?: string
  accesses: AccessWithPages[]
}

export default function MobileMenu({ initials, fullName, email, accesses }: MobileMenuProps) {
  const t = useTranslations('nav')
  const tA11y = useTranslations('a11y')
  const params = useParams()
  const pathname = usePathname()
  const currentBabyId = params?.babyId as string

  const babyAccess = accesses.find((acc) => acc.baby_id === currentBabyId)
  const allowedPages = babyAccess?.allowedPages || []

  const handleLogout = async () => {
    await logout()
  }

  // Helper to determine active state of navigation links
  const isPageActive = (pageId: string) => {
    return pathname === `/baby/${currentBabyId}/${pageId}`
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={tA11y('menu')} className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary hover:bg-secondary-foreground/10 text-foreground transition-all cursor-pointer outline-none border border-border">
        <Menu className="h-5 w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 mt-2">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-2 py-1.5 px-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-sm font-semibold leading-none text-foreground truncate">{fullName}</p>
              {email && (
                <p className="text-xs leading-none text-muted-foreground truncate mt-0.5">{email}</p>
              )}
            </div>
          </div>
        </DropdownMenuLabel>

        {allowedPages.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="px-2.5 py-1 text-2xs uppercase tracking-wider font-semibold text-muted-foreground">
              {t('navigation')}
            </DropdownMenuLabel>
            {allowedPages.map((page) => {
              const Icon = ICONS_BY_PAGE_ID.get(page.id) ?? Menu
              const active = isPageActive(page.id)
              return (
                <DropdownMenuItem
                  key={page.id}
                  className={`cursor-pointer ${active ? 'bg-primary/5 text-primary font-semibold' : ''}`}
                  render={<Link href={`/baby/${currentBabyId}/${page.id}`} />}
                >
                  <div className="flex items-center gap-2 w-full">
                    <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span>{page.name.charAt(0).toUpperCase() + page.name.slice(1)}</span>
                  </div>
                </DropdownMenuItem>
              )
            })}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" render={<Link href="/settings" />}>
          <div className="flex items-center gap-2 w-full">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span>{t('settings')}</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} variant="destructive" className="cursor-pointer">
          <div className="flex items-center gap-2 w-full">
            <LogOut className="h-4 w-4" />
            <span>{t('logout')}</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
