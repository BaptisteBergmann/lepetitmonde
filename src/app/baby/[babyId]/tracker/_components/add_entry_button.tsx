'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CareEventModal } from './care_event_modal'
import { useOnline } from '@/components/use_online'

export function AddEntryButton({ babyId }: { babyId: string }) {
  const t = useTranslations('tracker.log')
  const [open, setOpen] = useState(false)
  const online = useOnline()

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        aria-disabled={!online || undefined}
        onClick={() => { if (online) setOpen(true) }}
        className="gap-1.5 rounded-2xl"
      >
        <Plus aria-hidden="true" />
        {t('add')}
      </Button>
      {open && <CareEventModal babyId={babyId} onClose={() => setOpen(false)} />}
    </>
  )
}
