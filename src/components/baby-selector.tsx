"use client";

import { Tables } from '@/utils/supabase/database.types';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useEffect } from 'react';


type Baby = Tables<'babies'>;

export default function BabySelector({ babies }: { babies: Baby[] }) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  const currentBabyId = params?.babyId || "default" as string;

  useEffect(() => {
    if (pathname === '/') { return }
    if (currentBabyId && !pathname.includes(`/baby/${currentBabyId}`)) {
      console.log(babies)
      router.push(`/baby/${babies[0].id}`);
    }
  }, [currentBabyId, babies, router]);

  const handleSelect = (newId: string) => {
    if (!newId) {
      router.push('/');
      return;
    }

    if (currentBabyId && pathname.includes(`/baby/${currentBabyId}`)) {
      const newPath = pathname.replace(`/baby/${currentBabyId}`, `/baby/${newId}`);
      router.push(newPath);
    } else {
      router.push(`/baby/${newId}`);
    }
  };

  return (
    <select
      value={currentBabyId || ''}
      onChange={(e) => handleSelect(e.target.value)}
      className="max-w-[8rem] sm:max-w-none p-2 border border-input rounded-md bg-background text-foreground text-sm truncate"
    >
      {currentBabyId === "default" &&
        <option disabled value={"default"}> -- select an option -- </option>
      }
      {babies.map((p) => (
        <option key={p.id} value={p.id}>
          {p.baby_surname}
        </option>
      ))}
    </select>
  );
}
