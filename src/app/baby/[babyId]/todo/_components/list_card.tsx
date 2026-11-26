import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Check, ChevronRight } from 'lucide-react'
import type { Tables } from '@utils/supabase/database.types'
import { Badge } from '@/components/ui/badge'

// One list on the index: the whole card is the link. Open titles are previewed on a
// single line, truncated by CSS.
export default async function ListCard({ babyId, list, items }: { babyId: string; list: Tables<'todo_lists'>; items: Tables<'todo_items'>[] }) {
  const t = await getTranslations('todo')
  const open = items.filter((item) => !item.done)

  const preview = items.length === 0 ? t('noItems') : open.length === 0 ? t('allDone') : open.map((item) => item.title).join(' · ')

  return (
    <Link
      href={`/baby/${babyId}/todo/${list.id}`}
      className="flex min-h-16 items-center gap-3 rounded-2xl border border-landing-border bg-landing-surface px-4 py-3 transition-colors hover:bg-landing-background focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-landing-foreground">{list.name}</p>
        <p className="truncate text-sm text-landing-muted">{preview}</p>
      </div>
      {open.length > 0 ? (
        <Badge className="bg-landing-background text-landing-foreground">
          <span className="sr-only">{t('lists.chipRemaining', { count: open.length })}</span>
          <span aria-hidden>{open.length}</span>
        </Badge>
      ) : items.length > 0 ? (
        <Check aria-hidden className="size-4 text-todo-check" />
      ) : null}
      <ChevronRight aria-hidden className="size-4 shrink-0 text-landing-muted" />
    </Link>
  )
}
