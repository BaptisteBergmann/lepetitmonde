'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Smartphone, Download, Share } from 'lucide-react'

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
    // navigator/window don't exist during SSR, so this one-time device/display-mode
    // detection can't move to render — it has to run after mount, client-only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          <ol className="list-decimal space-y-1.5 pl-4 text-sm text-landing-muted">
            <li>
              Ouvrez cette page dans <span className="font-medium text-landing-foreground">Safari</span>, puis
              appuyez sur le bouton{' '}
              <span className="inline-flex items-center gap-1 font-medium text-landing-foreground">
                <Share className="h-3.5 w-3.5" aria-hidden />
                Partager
              </span>{' '}
              en bas de l&apos;écran.
            </li>
            <li>
              Faites défiler le menu et appuyez sur{' '}
              <span className="font-medium text-landing-foreground">
                &laquo;&nbsp;Sur l&apos;écran d&apos;accueil&nbsp;&raquo;
              </span>
              , puis confirmez avec <span className="font-medium text-landing-foreground">&laquo;&nbsp;Ajouter&nbsp;&raquo;</span>.
            </li>
          </ol>
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
