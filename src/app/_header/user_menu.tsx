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
import { LogOut, Settings } from 'lucide-react'

interface UserMenuProps {
  initials: string
  fullName: string
  email?: string
}

export default function UserMenu({ initials, fullName, email }: UserMenuProps) {
  const handleLogout = async () => {
    await logout()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-primary font-bold text-sm cursor-pointer hover:bg-primary/20 hover:scale-105 active:scale-95 transition-all outline-none">
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 mt-2">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1 py-1.5 px-2">
            <p className="text-sm font-semibold leading-none text-foreground">{fullName}</p>
            {email && (
              <p className="text-xs leading-none text-muted-foreground truncate mt-0.5">{email}</p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" render={<Link href="/settings" />}>
          <div className="flex items-center gap-2 w-full">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span>Paramètres</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} variant="destructive" className="cursor-pointer">
          <div className="flex items-center gap-2 w-full">
            <LogOut className="h-4 w-4" />
            <span>Se déconnecter</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
