import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Header from "./components/header";
import { getProjectsList } from "@utils/actions/project";

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

  const projects = await getProjectsList() || []; // Requête serveur rapide

  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", dmSans.variable)}
    >
      <body className="min-h-screen flex flex-col">
        <Header projects={projects} />

        {/* Le main permet de bien séparer le header du contenu */}
        <main className="flex-grow pt-20"> {/* pt-20 = padding-top pour compenser le header fixed */}
          {children}
        </main>
      </body>
      {/* <Header projects={projects}></Header> */}
      {/* <body className="flex flex-col">{children}</body> */}
    </html>
  );
}
