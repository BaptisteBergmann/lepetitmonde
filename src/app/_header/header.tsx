"use client"

import BabySelector from '@/components/baby-selector';
import { logger } from '@/utils/logger';
import { Constants, Enums } from '@/utils/supabase/database.types';
import { Database } from 'lucide-react';
import { useRouter, useParams, usePathname } from 'next/navigation';

type Role = Enums<"role">;

interface HeaderProps {
  babies: any[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Header({
  babies,
  activeTab,
}: HeaderProps) {
  const contextLogger = logger.child({ function: Header.name })
  contextLogger.debug(babies)
  const router = useRouter();
  const params = useParams();

  const currentBabyId = params?.babyId as string;

  const pages = [
    { id: "guess", name: "Pronostique", role: "viewer" },
    { id: "circles", name: "Groupes", role: "admin" },
    { id: "calendar", name: "Calendrie", role: "viewer" },
    { id: "news", name: "Newsletter", role: "viewer" },
  ]

  contextLogger.debug(currentBabyId)
  contextLogger.debug(params)
  const navigateTo = (tab: string, isBabyRoute: boolean = true) => {
    console.log(isBabyRoute, currentBabyId)
    if (isBabyRoute && currentBabyId) {
      router.push(`/baby/${currentBabyId}/${tab}`);
    } else if (isBabyRoute && !currentBabyId) {
      router.push('/');
    } else {
      router.push(`/${tab}`);
    }
  };

  return (
    <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 py-4 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div
        onClick={() => router.push('/')} // Le logo ramène à l'accueil global
        className="text-xl font-black text-primary cursor-pointer hover:opacity-80 transition-opacity"
      >
        Babynew
      </div>

      <BabySelector babies={babies}></BabySelector>

      <nav className="hidden md:flex items-center gap-6">
        {pages.map((tab) => (
          <button
            key={tab.id}
            onClick={() => navigateTo(tab.id)}
            className={`text-sm font-semibold transition-colors ${activeTab === tab.id ? 'text-primary' : 'text-gray-500 hover:text-gray-900'
              }`}
          >
            {tab.name.charAt(0).toUpperCase() + tab.name.slice(1)}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <div
          onClick={() => navigateTo("login", false)}
          className="w-9 h-9 rounded-full bg-gray-200 ml-2 border border-gray-300 cursor-pointer hover:bg-gray-300 transition-colors"
        />
      </div>
    </header>
  );
}
