import BabySelector from '@/components/baby-selector';
import { getAllUserAccess } from '@/utils/actions/users';
import { logger } from '@/utils/logger';
import Link from 'next/link';
import PageSelector from './page_selector';
import { createClient } from '@/utils/supabase/server';
// Optionnel : import { User } from 'lucide-react'; pour une jolie icône de profil

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
      acc.access_level === "admin" || (acc.access_level === page.role && page.enabled)
    )
  }));

  contextLogger.debug(accesses, "User accesses");

  return (
    <header className="fixed top-0 left-0 w-full z-50 flex items-center justify-between px-4 sm:px-6 py-3 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm">

      {/* 1. ZONE GAUCHE : Logo et Sélecteur */}
      <div className="flex items-center gap-2 sm:gap-4">
        <Link
          href="/"
          className="text-lg sm:text-xl font-black text-blue-500 tracking-tight cursor-pointer hover:opacity-80 transition-opacity"
        >
          Le petit Monde
        </Link>

        {/* Petit séparateur vertical discret, caché sur tout petit écran */}
        <div className="hidden sm:block border-l border-slate-300 h-6 mx-1"></div>

        <BabySelector babies={babies} />
      </div>

      {/* 2. ZONE CENTRALE : La navigation (PageSelector) */}
      {/* Sur grand écran elle est au centre, sur mobile on pourrait la mettre dans un menu hamburger plus tard */}
      <div className="hidden md:flex flex-1 justify-center">
        <PageSelector access={accesses} />
      </div>

      {/* 3. ZONE DROITE : Profil / Bouton de connexion */}
      <div className="flex items-center gap-3">
        {user ? (
          // Si l'utilisateur est connecté : Bulle de profil
          <Link
            href="/profile"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 border border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors shadow-sm"
            title="Mon profil"
          >
            <span className="text-slate-600 font-semibold text-sm">
              {/* Affiche la 1ère lettre de son email en majuscule, ou 'U' par défaut */}
              {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
            </span>
          </Link>
        ) : (
          // Si l'utilisateur n'est PAS connecté : Bouton Login
          <Link
            href="/login"
            className="px-4 py-1.5 text-sm font-semibold text-white bg-blue-500 rounded-full hover:bg-blue-600 transition-colors shadow-sm"
          >
            Se connecter
          </Link>
        )}
      </div>

    </header>
  );
}
