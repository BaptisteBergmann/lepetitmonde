'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Tables } from '@utils/supabase/database.types'
import { CIRCLE_MAX_DEPTH, orderAsTree } from '@utils/circle-tree'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TOP_LEVEL } from './circle_utils'

type Circle = Tables<'circles'>

const INDENT_CLASS = ['pl-2', 'pl-6', 'pl-10']

// Tiny client island for the server-rendered create form: it only writes the chosen
// parent id into a hidden input that the form action reads.
export default function CircleParentSelect({ circles }: { circles: Circle[] }) {
  const t = useTranslations('admin.createCircle')
  const [value, setValue] = useState<string>(TOP_LEVEL)
  const ordered = useMemo(() => orderAsTree(circles), [circles])
  const items = useMemo(
    () => ({ [TOP_LEVEL]: t('parentNone'), ...Object.fromEntries(circles.map((c) => [c.id, c.name ?? ''])) }),
    [circles, t],
  )

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('parentLabel')}</p>
      <input type="hidden" name="parentId" value={value === TOP_LEVEL ? '' : value} />
      <Select items={items} value={value} onValueChange={(next) => setValue(next ?? TOP_LEVEL)}>
        <SelectTrigger className="w-full bg-input/40" aria-label={t('parentLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TOP_LEVEL}>{t('parentNone')}</SelectItem>
          {ordered.map((circle) => {
            const tooDeep = circle.depth + 1 >= CIRCLE_MAX_DEPTH
            return (
              <SelectItem
                key={circle.id}
                value={circle.id}
                disabled={tooDeep}
                className={`min-h-11 ${INDENT_CLASS[Math.min(circle.depth, 2)]}`}
              >
                {circle.name}
                {tooDeep && <span className="text-xs text-muted-foreground">({t('parentTooDeep')})</span>}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}
