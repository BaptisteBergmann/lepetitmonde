'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { CareEvent } from '@utils/actions/care_events'
import { CareEventModal } from './care_event_modal'
import { useOnline } from './use_online'

// The row content is rendered on the server and passed as children; this
// wrapper only owns the button and the edit dialog.
export function CareLogRow({
  babyId,
  event,
  ariaLabel,
  children,
}: {
  babyId: string
  event: CareEvent
  ariaLabel: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const online = useOnline()

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-disabled={!online || undefined}
        onClick={() => { if (online) setOpen(true) }}
        className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl border border-landing-border bg-landing-surface p-3 text-left transition-colors hover:bg-landing-background focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
      >
        {children}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {open && <CareEventModal babyId={babyId} event={event} onClose={() => setOpen(false)} />}
    </>
  )
}
