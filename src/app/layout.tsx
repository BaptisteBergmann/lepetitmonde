import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@utils/utils";
import Header from "@components/header";
import { getBabiesList } from "@utils/actions/baby";

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
  themeColor: '#ffffff',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  const babies = await getBabiesList() || []; // Requête serveur rapide

  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", dmSans.variable)}
    >
      <body className="min-h-screen flex flex-col">
        <Header babies={babies} />

        {/* Le main permet de bien séparer le header du contenu */}
        <main className="flex-grow pt-20"> {/* pt-20 = padding-top pour compenser le header fixed */}
          {children}
        </main>
      </body>
      {/* <Header babies={babies}></Header> */}
      {/* <body className="flex flex-col">{children}</body> */}
    </html>
  );
}
