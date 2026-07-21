"use client";

import { Tables } from '@/utils/supabase/database.types';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Baby = Tables<'babies'>;

function replaceBabyIdSegment(pathname: string, currentBabyId: string, newId: string) {
  const segments = pathname.split('/');
  const babyIndex = segments.indexOf('baby');
  if (babyIndex !== -1 && segments[babyIndex + 1] === currentBabyId) {
    segments[babyIndex + 1] = newId;
    return segments.join('/');
  }
  return `/baby/${newId}`;
}

export default function BabySelector({ babies }: { babies: Baby[] }) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const rawBabyId = params?.babyId;
  const currentBabyId = (Array.isArray(rawBabyId) ? rawBabyId[0] : rawBabyId) || "default";

  useEffect(() => {
    if (!pathname.startsWith('/baby/')) { return }
    if (babies.length === 0) { return }
    if (currentBabyId && !pathname.includes(`/baby/${currentBabyId}`)) {
      startTransition(() => {
        router.push(`/baby/${babies[0].id}`);
      });
    }
  }, [pathname, currentBabyId, babies, router]);

  const handleSelect = (newId: string | null) => {
    if (!newId) {
      startTransition(() => {
        router.push('/');
      });
      return;
    }

    startTransition(() => {
      if (currentBabyId && pathname.includes(`/baby/${currentBabyId}`)) {
        router.push(replaceBabyIdSegment(pathname, currentBabyId, newId));
      } else {
        router.push(`/baby/${newId}`);
      }
    });
  };

  if (babies.length === 0 || pathname === '/') {
    return null;
  }

  return (
    <Select
      value={currentBabyId}
      onValueChange={handleSelect}
      disabled={isPending}
    >
      <SelectTrigger aria-label="Changer de bébé" className="px-2.5">
        <SelectValue placeholder="">{() => ""}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {babies.map((baby) => (
          <SelectItem key={baby.id} value={baby.id}>
            {baby.baby_surname}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
