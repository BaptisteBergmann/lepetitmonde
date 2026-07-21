import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@utils/utils";
import { PwaRegistry } from './settings/pwaRegistry';
import HeaderWrapper from './_header/header_wrapper';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'Journal de Bébé',
  description: 'Un espace privé pour la famille',
  manifest: '/manifest.webmanifest', // Note: Next.js génère le lien si vous utilisez manifest.ts
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Journal de Bébé',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
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


  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", dmSans.variable)}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <HeaderWrapper />

        {/* Le main permet de bien séparer le header du contenu */}
        <main className="flex-grow pt-20"> {/* pt-20 = padding-top pour compenser le header fixed */}
          {children}
        </main>
        <footer className="py-4 text-center text-xs text-muted-foreground">
          v{process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'dev'}
        </footer>
        <PwaRegistry />
      </body>
      {/* <Header babies={babies}></Header> */}
      {/* <body className="flex flex-col">{children}</body> */}
    </html>
  );
}
