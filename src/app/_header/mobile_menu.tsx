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
import { useTranslations } from 'next-intl'
import { LogOut, Settings, Menu } from 'lucide-react'
import Link from 'next/link'

interface MobileMenuProps {
  initials: string
  fullName: string
  email?: string
}

export default function MobileMenu({ initials, fullName, email }: MobileMenuProps) {
  const t = useTranslations('nav')
  const tA11y = useTranslations('a11y')

  const handleLogout = async () => {
    await logout()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={tA11y('menu')} className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary hover:bg-secondary-foreground/10 text-foreground transition-all cursor-pointer outline-none border border-border touch-target relative">
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
