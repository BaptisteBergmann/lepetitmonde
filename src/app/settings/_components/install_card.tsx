'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Smartphone } from 'lucide-react'

export default function InstallCard() {
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window))
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches)
  }, [])

  if (isStandalone) {
    return null
  }

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Smartphone className="h-4.5 w-4.5 text-rose" />
          Installer l&apos;application
        </CardTitle>
        <CardDescription className="text-xs">
          Ajoutez le journal à votre écran d&apos;accueil pour un accès rapide.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isIOS ? (
          <p className="text-sm text-muted-foreground">
            Sur iOS, appuyez sur le bouton de partage <span aria-hidden>⎋</span> puis
            &laquo;&nbsp;Sur l&apos;écran d&apos;accueil&nbsp;&raquo; <span aria-hidden>➕</span>.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Depuis le menu de votre navigateur, choisissez &laquo;&nbsp;Installer l&apos;application&nbsp;&raquo;
            ou &laquo;&nbsp;Ajouter à l&apos;écran d&apos;accueil&nbsp;&raquo;.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
