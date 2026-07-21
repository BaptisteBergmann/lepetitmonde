"use client"

import { logger } from '@/utils/logger';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

export default function PageSelector({ access }: { access: any[] }) {
  const contextLogger = logger.child({ function: PageSelector.name })
  const params = useParams();
  const pathname = usePathname(); // Ajouté pour détecter la page active

  const currentBabyId = params?.babyId as string;

  const babyAccess = access.find((acc) => acc.baby_id === currentBabyId) || {}

  // Optionnel : on évite les logs en production pour ne pas polluer
  contextLogger.debug(currentBabyId)
  contextLogger.debug(babyAccess)

  // Si pas de pages, on ne rend rien pour ne pas avoir un bloc vide
  if (!babyAccess?.allowedPages?.length) return null;

  return (
    <nav className="mx-auto flex max-w-fit items-center justify-center gap-1 sm:gap-2 rounded-full border border-border/50 bg-card/70 p-1.5 shadow-md backdrop-blur-md">
      {
        babyAccess?.allowedPages?.map((page: any) => {
          const href = `/baby/${currentBabyId}/${page.id}`;
          // On vérifie si l'URL actuelle contient le lien pour le mettre en surbrillance
          const isActive = pathname?.includes(href);

          return (
            <Link
              key={page.id}
              href={href}
              className={`
                  px-4 py-2 text-sm font-semibold rounded-full transition-all duration-300 ease-in-out
                  ${isActive
                  ? 'bg-blue-500 text-white shadow-sm' // Style quand la page est active
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground' // Style inactif
                }
                `}
            >
              {page.name.charAt(0).toUpperCase() + page.name.slice(1)}
            </Link>
          )
        })
      }
    </nav>
  );
}
