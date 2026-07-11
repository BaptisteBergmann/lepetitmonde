"use client"

import { useRouter, useParams, usePathname } from 'next/navigation';
import BabySelector from './baby-selector';

interface HeaderProps {
  babies: any[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Header({
  babies,
  activeTab,
}: HeaderProps) {
  const router = useRouter();
  const params = useParams();

  const currentBabyId = params?.babyId as string;
  console.log(currentBabyId)
  console.log(params)
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
        <div
          onClick={() => navigateTo("login", false)}
          className="w-9 h-9 rounded-full bg-gray-200 ml-2 border border-gray-300 cursor-pointer hover:bg-gray-300 transition-colors"
        />
      </div>
    </header>
  );
}
