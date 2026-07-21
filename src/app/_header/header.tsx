import BabySelector from '@/components/baby-selector';
import { getAllUserAccess } from '@/utils/actions/users';
import { logger } from '@/utils/logger';
import Link from 'next/link';
import PageSelector from './page_selector';
import UserMenu from './user_menu';
import MobileMenu from './mobile_menu';
import { createClient } from '@/utils/supabase/server';

export default async function Header({ babies, params }: { babies: any[], params?: any }) {
  const contextLogger = logger.child({ function: Header.name });
  const supabase = await createClient();

  // Securely fetch the user from the Supabase database
  const { data: { user }, error } = await supabase.auth.getUser();

  // Désactivé en prod pour des logs plus propres, utile en debug
  // contextLogger.debug(babies);

  const allUserAccess = await getAllUserAccess();

  const pages = [
    { id: "guess", name: "Pronostics", role: "viewer", enabled: true },
    { id: "circles", name: "Groupes", role: "admin", enabled: true },
    { id: "calendar", name: "Calendrier", role: "viewer", enabled: false }, // Coquille corrigée
    { id: "news", name: "Newsletter", role: "viewer", enabled: false },
  ];

  const accesses = allUserAccess.map((acc) => ({
    ...acc,
    allowedPages: pages.filter((page) =>
      page.enabled && (acc.access_level === "admin" || acc.access_level === page.role)
    )
  }));

  contextLogger.debug(accesses, "User accesses");

  const fullName = user?.user_metadata?.full_name || user?.email || 'Utilisateur';
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part.charAt(0).toUpperCase())
    .join('') || 'U';

  return (
    <header className="fixed top-0 left-0 w-full z-50 flex items-center justify-between gap-2 px-3 sm:px-6 py-3 bg-background/80 backdrop-blur-md border-b border-border shadow-sm">

      {/* 1. ZONE GAUCHE : Logo et Sélecteur */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <Link
          href="/"
          className="shrink-0 text-lg sm:text-xl font-black text-primary tracking-tight cursor-pointer hover:opacity-80 transition-opacity"
        >
          Le petit Monde
        </Link>

        {/* Petit séparateur vertical discret, caché sur tout petit écran */}
        <div className="hidden sm:block border-l border-border h-6 mx-1"></div>

        <div className="min-w-0">
          <BabySelector babies={babies} />
        </div>
      </div>

      {/* 2. ZONE CENTRALE : La navigation (PageSelector), visible uniquement sur grand écran */}
      <div className="hidden md:flex flex-1 justify-center">
        <PageSelector access={accesses} />
      </div>

      {/* 3. ZONE DROITE : Profil / Bouton de connexion */}
      <div className="flex items-center gap-3 shrink-0">
        {user ? (
          <>
            {/* Sur mobile : menu hamburger regroupant navigation + compte */}
            <div className="md:hidden">
              <MobileMenu initials={initials} fullName={fullName} email={user.email} accesses={accesses} />
            </div>
            {/* Sur grand écran : bulle de profil avec menu déroulant */}
            <div className="hidden md:block">
              <UserMenu initials={initials} fullName={fullName} email={user.email} />
            </div>
          </>
        ) : (
          // Si l'utilisateur n'est PAS connecté : Bouton Login
          <Link
            href="/login"
            className="px-4 py-1.5 text-sm font-semibold text-primary-foreground bg-primary rounded-full hover:bg-primary/90 transition-colors shadow-sm"
          >
            Se connecter
          </Link>
        )}
      </div>

    </header>
  );
}
