"use client"

import { useRouter, usePathname, useSearchParams } from 'next/navigation'; // Importez aussi usePathname
import BabySelector from './baby-selector';

interface HeaderProps {
  babies: any[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Header({
  babies,
  activeTab,
  setActiveTab,
}: HeaderProps) {

  const router = useRouter();
  const searchParams = useSearchParams();
  const navigateTo = (tab: string, baby: boolean = true) => {
    const params = new URLSearchParams(searchParams.toString());
    router.push(`${baby ? "/baby" : ""}/${tab}?${params.toString()}`);
  };


  return (
    <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 py-4 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div
        onClick={() => setActiveTab('bets')}
        className="text-xl font-black text-primary cursor-pointer hover:opacity-80 transition-opacity"
      >
        Babynew
      </div>

      <BabySelector babies={babies}></BabySelector>

      <nav className="hidden md:flex items-center gap-6">
        {['newsletter', 'calendar', 'guess', 'circles'].map((tab) => (
          <button
            key={tab}
            onClick={() => navigateTo(tab)}
            className={`text-sm font-semibold transition-colors ${activeTab === tab ? 'text-primary' : 'text-gray-500 hover:text-gray-900'
              }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <div onClick={() => navigateTo("login", false)} className="w-9 h-9 rounded-full bg-gray-200 ml-2 border border-gray-300" />
      </div>
    </header>
  );
}
