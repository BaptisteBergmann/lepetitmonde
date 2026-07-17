"use client"

import { logger } from '@/utils/logger';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';



export default function PageSelector({ access }) {
  const contextLogger = logger.child({ function: PageSelector.name })
  const router = useRouter();
  const params = useParams();

  const currentBabyId = params?.babyId as string;

  const babyAccess = access.find((acc) => acc.baby_id === currentBabyId) || {}


  contextLogger.debug(currentBabyId)
  contextLogger.debug(babyAccess)

  return (
    <div>
      {
        babyAccess?.allowedPages?.map((page) => (

          <Link
            key={page.id}
            className={`text-sm font-semibold`}
            href={`/baby/${currentBabyId}/${page.id}`}
          >
            {page.name.charAt(0).toUpperCase() + page.name.slice(1)}
          </Link>
        ))
      }
    </div>
  );
}
