"use client";

import { Tables } from '@/utils/supabase/database.types';
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
      className="shrink-0 text-lg sm:text-xl font-black text-primary tracking-tight cursor-pointer hover:opacity-80 transition-opacity"
    >
      Le petit Monde{babyName ? ` de ${babyName}` : ''}
    </Link>
  );
}
