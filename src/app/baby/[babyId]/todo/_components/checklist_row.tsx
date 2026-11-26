'use client'

import { useLayoutEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { INPUT_LIMITS } from '@/utils/input-limits'
import { cn } from '@utils/utils'

export type ChecklistRowData = {
  id: string
  title: string
  done: boolean
  doneAt: string | null
}

type Props = {
  row: ChecklistRowData
  // The empty row that always ends the unchecked items.
  isDraft: boolean
  onToggle: (id: string) => void
  onChange: (id: string, title: string) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>, row: ChecklistRowData) => void
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>, row: ChecklistRowData) => void
  onBlur: (id: string) => void
  register: (id: string, element: HTMLTextAreaElement | null) => void
}

// Circle (44px hit area) + auto-growing textarea. A textarea rather than an input so
// long titles wrap on a phone; Enter is intercepted by the parent so it never inserts
// a newline.
export default function ChecklistRow({ row, isDraft, onToggle, onChange, onKeyDown, onPaste, onBlur, register }: Props) {
  const t = useTranslations('todo')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [row.title])

  return (
    <div className="flex min-h-11 items-start gap-1 border-b border-landing-border px-3 last:border-b-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={row.done}
        aria-label={isDraft ? t('newItemPlaceholder') : t(row.done ? 'itemLabelDone' : 'itemLabel', { title: row.title })}
        disabled={isDraft || !row.title.trim()}
        onClick={() => onToggle(row.id)}
        className="group -ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center disabled:cursor-default"
      >
        <span
          className={cn(
            'flex size-[22px] items-center justify-center rounded-full border-2 transition-transform motion-safe:duration-150',
            'group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2',
            row.done
              ? 'border-todo-check bg-todo-check text-landing-surface motion-safe:animate-in motion-safe:zoom-in-90'
              : isDraft || !row.title.trim()
                ? 'border-dashed border-landing-muted'
                : 'border-todo-check',
          )}
        >
          {row.done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
        </span>
      </button>
      <textarea
        ref={(element) => {
          textareaRef.current = element
          register(row.id, element)
        }}
        rows={1}
        value={row.title}
        maxLength={INPUT_LIMITS.todoTitle}
        enterKeyHint="next"
        placeholder={t('newItemPlaceholder')}
        aria-label={row.title.trim() ? row.title : t('newItemPlaceholder')}
        onChange={(event) => onChange(row.id, event.target.value)}
        onKeyDown={(event) => onKeyDown(event, row)}
        onPaste={(event) => onPaste(event, row)}
        onBlur={() => onBlur(row.id)}
        // text-base (16px) keeps iOS from zooming the page on focus.
        className={cn(
          'min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-2.5 text-base leading-snug outline-none placeholder:text-landing-muted',
          row.done ? 'text-landing-muted line-through' : 'text-landing-foreground',
        )}
      />
    </div>
  )
}
