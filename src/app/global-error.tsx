'use client'

import './globals.css'

// Replaces the root layout when it throws, so there is no intl provider (and
// no header) here: show both languages and rely on globals.css for the palette.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-landing-background px-4 text-center text-landing-foreground">
        <h1 className="text-2xl font-semibold">Oups, quelque chose s&apos;est mal passé</h1>
        <p className="text-sm text-landing-muted">Something went wrong.</p>
        <button
          onClick={reset}
          className="cursor-pointer rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Réessayer / Try again
        </button>
      </body>
    </html>
  )
}
