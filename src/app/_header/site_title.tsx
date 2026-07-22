"use client";

import { Tables } from '@/utils/supabase/database.types';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type Baby = Tables<'babies'>;

export default function SiteTitle({ babies }: { babies: Baby[] }) {
  const params = useParams();
  const rawBabyId = params?.babyId;
  const babyId = Array.isArray(rawBabyId) ? rawBabyId[0] : rawBabyId;
  const baby = babies.find((b) => b.id === babyId);
  const babyName = baby
    ? baby.baby_surname.charAt(0).toUpperCase() + baby.baby_surname.slice(1)
    : '';

  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-2 cursor-pointer transition-opacity hover:opacity-80"
    >
      <Image src="/logo_mark.png" alt="" width={900} height={620} className="h-7 w-auto sm:h-8" priority />
      <span className="font-display text-lg sm:text-xl font-semibold text-primary tracking-tight truncate">
        Le petit Monde{babyName ? ` de ${babyName}` : ''}
      </span>
    </Link>
  );
}
