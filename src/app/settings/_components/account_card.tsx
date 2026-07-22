'use client'

import { logout } from '@utils/actions/logout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LogOut, UserCircle } from 'lucide-react'

interface AccountCardProps {
  initials: string
  fullName: string
  email?: string
}

export default function AccountCard({ initials, fullName, email }: AccountCardProps) {
  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
          <UserCircle className="h-4.5 w-4.5 text-primary" />
          Compte
        </CardTitle>
        <CardDescription className="text-xs text-landing-muted">
          Vos informations personnelles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-primary font-bold text-sm">
            {initials}
          </div>
          <div className="flex flex-col min-w-0">
            <p className="text-sm font-semibold text-landing-foreground truncate">{fullName}</p>
            {email && (
              <p className="text-xs text-landing-muted truncate">{email}</p>
            )}
          </div>
        </div>
        <form action={logout}>
          <Button type="submit" variant="destructive" className="w-full gap-2 cursor-pointer">
            <LogOut className="h-4 w-4" />
            <span>Se déconnecter</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
