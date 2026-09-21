import type { Metadata, Viewport } from 'next'
import { DM_Sans, Fraunces } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import "./globals.css";
import { cn } from "@utils/utils";
import { PwaRegistry } from './settings/pwaRegistry';
import { PwaHistoryTracker } from '@/components/pwa-history-tracker';
import HeaderWrapper from './_header/header_wrapper';
import PullToRefresh from '@/components/pull_to_refresh';
import BugReportButton from '@/components/bug_report_button';
import { ConfirmProvider } from '@/components/confirm_provider';
import { Toaster } from '@/components/ui/sonner';
import { getAuthUser } from '@utils/supabase/auth';
import { getChangelog } from '@utils/changelog';
import VersionFooter from '@/components/version_footer';
import { WebVitalsReporter } from './web-vitals-reporter';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });

// Serif used only on the public landing page (headlines) — kept out of --font-sans
// so the rest of the app keeps its existing DM Sans voice.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common')
  return {
    title: t('appName'),
    description: t('appDescription'),
    manifest: '/manifest.webmanifest', // Note: Next.js génère le lien si vous utilisez manifest.ts
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: t('appName'),
    },
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf4ec' },
    { media: '(prefers-color-scheme: dark)', color: '#1b222b' },
  ],
  width: 'device-width',
  initialScale: 1,
}

const themeInitScript = `
  (function () {
    var m = window.matchMedia('(prefers-color-scheme: dark)');
    var read = function () {
      try { return localStorage.getItem('theme'); } catch (e) { return null; }
    };
    var apply = function () {
      var pref = read();
      var root = document.documentElement;
      root.classList.toggle('dark', pref === 'dark' || (pref !== 'light' && m.matches));
      root.classList.toggle('light', pref === 'light');
    };
    apply();
    m.addEventListener('change', apply);
    window.addEventListener('themechange', apply);
    window.addEventListener('storage', apply);
  })();
`

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: { user } } = await getAuthUser()
  const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'dev'
  const changelog = getChangelog()
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn("h-full", "antialiased", "font-sans", dmSans.variable, fraunces.variable)}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen flex flex-col overflow-x-hidden">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ConfirmProvider>
            {/* One shared ambient glow behind the whole app (not per-page) —
                fixed to the viewport, no z-index needed: it's the first
                element in body so every later sibling paints over it. */}
            <div
              aria-hidden
              className="pointer-events-none fixed -top-10 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
            />

            <HeaderWrapper />

            {/* Le main permet de bien séparer le header du contenu */}
            <main className="flex-grow pt-[61px]"> {/* pt-[61px] = hauteur réelle du header fixed (py-3 + h-9 + border) */}
              <PullToRefresh>{children}</PullToRefresh>
              {/* Réserve la place du BottomNav (mobile only) sous le contenu scrollable,
                  pour qu'il ne masque pas le bas de la page. Hauteur = env(safe-area-inset-bottom)
                  + la hauteur visuelle de la barre (icône + paddings, pas de label). */}
              {user && (
                <div aria-hidden className="md:hidden" style={{ height: 'calc(3.25rem + env(safe-area-inset-bottom))' }} />
              )}
            </main>
            <footer className="py-4 text-center text-xs text-muted-foreground">
              <VersionFooter commitSha={commitSha} changelog={changelog} />
            </footer>
            <PwaRegistry />
            <PwaHistoryTracker />
            <WebVitalsReporter />
            {user && <BugReportButton />}
            <Toaster position="bottom-center" />
          </ConfirmProvider>
        </NextIntlClientProvider>
      </body>
      {/* <Header babies={babies}></Header> */}
      {/* <body className="flex flex-col">{children}</body> */}
    </html>
  );
}
