'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { cn } from '@utils/utils'
import ListNameDialog from './list_name_dialog'

export type ListChip = { id: string; name: string; openCount: number }

// Switcher between lists: plain Links (prefetchable, no back trip), scrolled so the
// active chip is visible on mount.
export default function ListChips({ babyId, lists, activeId }: { babyId: string; lists: ListChip[]; activeId: string }) {
  const t = useTranslations('todo.lists')
  const [dialogOpen, setDialogOpen] = useState(false)
  const activeRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [activeId])

  return (
    <nav aria-label={t('switcherLabel')}>
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        {lists.map((list) => {
          const active = list.id === activeId
          return (
            <Link
              key={list.id}
              ref={active ? activeRef : undefined}
              href={`/baby/${babyId}/todo/${list.id}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full px-4 text-sm font-medium',
                active
                  ? 'bg-landing-foreground text-landing-surface'
                  : 'border border-landing-border bg-landing-surface text-landing-foreground',
              )}
            >
              {list.name}
              {list.openCount > 0 && (
                <>
                  <span aria-hidden className="text-xs opacity-70">{list.openCount}</span>
                  <span className="sr-only">{t('chipRemaining', { count: list.openCount })}</span>
                </>
              )}
            </Link>
          )
        })}
        <button
          type="button"
          aria-label={t('new')}
          onClick={() => setDialogOpen(true)}
          className="flex min-h-11 shrink-0 cursor-pointer items-center rounded-full border border-dashed border-landing-muted px-4 text-landing-muted"
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </div>
      <ListNameDialog babyId={babyId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </nav>
  )
}
