import SiteTitle from './site_title';
import { getAllUserAccess } from '@/utils/actions/users';
import { getPageSettings } from '@/utils/actions/page_settings';
import { logger } from '@/utils/logger';
import Link from 'next/link';
import PageSelector from './page_selector';
import UserMenu from './user_menu';
import MobileMenu from './mobile_menu';
import NotificationBell from './notification_bell';
import { createClient } from '@/utils/supabase/server';
import { Tables } from '@/utils/supabase/database.types';

export default async function Header({ babies }: { babies: Tables<'babies'>[] }) {
  const contextLogger = logger.child({ function: Header.name });
  const supabase = await createClient();

  // Securely fetch the user from the Supabase database
  const { data: { user }, error } = await supabase.auth.getUser();

  // Désactivé en prod pour des logs plus propres, utile en debug
  // contextLogger.debug(babies);

  const allUserAccess = await getAllUserAccess();

  const accesses = await Promise.all(allUserAccess.map(async (acc) => {
    const pages = await getPageSettings(acc.baby_id);
    return {
      ...acc,
      // Plain objects only — this is passed into MobileMenu, a Client
      // Component, and ResolvedPage's `icon` (a function reference) can't
      // cross that boundary. See the note on NavPage in ./types.
      allowedPages: pages
        .filter((page) => page.enabled && (acc.access_level === "admin" || acc.access_level === page.role))
        .map((page) => ({ id: page.id, name: page.name, role: page.role, enabled: page.enabled }))
    };
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
        <SiteTitle babies={babies} />
      </div>

      {/* 2. ZONE CENTRALE : La navigation (PageSelector), visible uniquement sur grand écran.
          Positionnée en absolute (centrée sur tout le header) plutôt qu'en flex-1, car les
          zones gauche/droite n'ont pas la même largeur (logo vs bouton de connexion/avatar) —
          un flex-1 centrerait la nav dans l'espace restant, pas sur le header entier. */}
      <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
        <div className="pointer-events-auto">
          <PageSelector access={accesses} />
        </div>
      </div>

      {/* 3. ZONE DROITE : Profil / Bouton de connexion */}
      <div className="flex items-center gap-3 shrink-0">
        {user ? (
          <>
            <NotificationBell />
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
