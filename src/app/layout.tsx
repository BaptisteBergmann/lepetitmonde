import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, DM_Sans, Fraunces } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import "./globals.css";
import { cn } from "@utils/utils";
import { PwaRegistry } from './settings/pwaRegistry';
import { PwaHistoryTracker } from '@/components/pwa-history-tracker';
import HeaderWrapper from './_header/header_wrapper';
import PullToRefresh from '@/components/pull_to_refresh';
import BugReportButton from '@/components/bug_report_button';
import { Toaster } from '@/components/ui/sonner';
import { getAuthUser } from '@utils/supabase/auth';
import { getChangelog } from '@utils/changelog';
import VersionFooter from '@/components/version_footer';
import { WebVitalsReporter } from './web-vitals-reporter';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Serif used only on the public landing page (headlines) — kept out of --font-sans
// so the rest of the app keeps its existing DM Sans voice.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: 'Le petit monde',
  description: 'Un espace privé pour la famille',
  manifest: '/manifest.webmanifest', // Note: Next.js génère le lien si vous utilisez manifest.ts
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Le petit monde',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf4ec' },
    { media: '(prefers-color-scheme: dark)', color: '#1b222b' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

const themeInitScript = `
  (function () {
    var m = window.matchMedia('(prefers-color-scheme: dark)');
    var apply = function () {
      document.documentElement.classList.toggle('dark', m.matches);
    };
    apply();
    m.addEventListener('change', apply);
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
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", dmSans.variable, fraunces.variable)}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <HeaderWrapper />

          {/* Le main permet de bien séparer le header du contenu */}
          <main className="flex-grow pt-20"> {/* pt-20 = padding-top pour compenser le header fixed */}
            <PullToRefresh>{children}</PullToRefresh>
          </main>
          <footer className="py-4 text-center text-xs text-muted-foreground">
            <VersionFooter commitSha={commitSha} changelog={changelog} />
          </footer>
          <PwaRegistry />
          <PwaHistoryTracker />
          <WebVitalsReporter />
          {user && <BugReportButton />}
          <Toaster position="bottom-center" />
        </NextIntlClientProvider>
      </body>
      {/* <Header babies={babies}></Header> */}
      {/* <body className="flex flex-col">{children}</body> */}
    </html>
  );
}
