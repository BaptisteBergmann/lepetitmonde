"use client";

import { Tables } from '@/utils/supabase/database.types';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { goToRoot } from '@/utils/pwa-navigation';

type Baby = Tables<'babies'>;

export default function SiteTitle({ babies }: { babies: Baby[] }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const rawBabyId = params?.babyId;
  const babyId = Array.isArray(rawBabyId) ? rawBabyId[0] : rawBabyId;
  const baby = babies.find((b) => b.id === babyId);
  const babyName = baby
    ? baby.baby_surname.charAt(0).toUpperCase() + baby.baby_surname.slice(1)
    : '';

  return (
    <Link
      href="/"
      onClick={(e) => {
        e.preventDefault();
        goToRoot(pathname, router.push);
      }}
      className="flex shrink-0 items-center gap-2 cursor-pointer transition-opacity hover:opacity-80"
    >
      <Image src="/logo_mark.svg" alt="" width={512} height={512} className="h-7 w-auto sm:h-8" priority unoptimized />
      <span className="font-display text-lg sm:text-xl font-semibold text-primary tracking-tight truncate">
        Le petit Monde{babyName ? ` de ${babyName}` : ''}
      </span>
    </Link>
  );
}
