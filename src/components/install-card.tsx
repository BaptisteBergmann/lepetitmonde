'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Smartphone, Download } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallCardProps {
  title?: string
  description?: string
}

export default function InstallCard({
  title = "Installer l'application",
  description = "Ajoutez le journal à votre écran d'accueil pour un accès rapide.",
}: InstallCardProps) {
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window))
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches)

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  if (isStandalone) {
    return null
  }

  async function handleInstallClick() {
    if (!installPrompt) return
    setIsInstalling(true)
    try {
      await installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      if (outcome === 'accepted') {
        setInstallPrompt(null)
      }
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
          <Smartphone className="h-4.5 w-4.5 text-rose" />
          {title}
        </CardTitle>
        <CardDescription className="text-xs text-landing-muted">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {installPrompt ? (
          <Button
            type="button"
            className="w-full gap-2 cursor-pointer"
            onClick={handleInstallClick}
            disabled={isInstalling}
          >
            <Download className="h-4 w-4" />
            <span>Installer</span>
          </Button>
        ) : isIOS ? (
          <p className="text-sm text-landing-muted">
            Sur iOS, appuyez sur le bouton de partage <span aria-hidden>⎋</span> puis
            &laquo;&nbsp;Sur l&apos;écran d&apos;accueil&nbsp;&raquo; <span aria-hidden>➕</span>.
          </p>
        ) : (
          <p className="text-sm text-landing-muted">
            Depuis le menu de votre navigateur, choisissez &laquo;&nbsp;Installer l&apos;application&nbsp;&raquo;
            ou &laquo;&nbsp;Ajouter à l&apos;écran d&apos;accueil&nbsp;&raquo;.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
