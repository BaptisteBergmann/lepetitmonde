'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { INPUT_LIMITS } from '@/utils/input-limits'
import { deleteTodoList, updateTodoList } from '@/utils/actions/todo'
import { useConfirm } from '@/components/confirm_provider'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// The page remounts the header when the name changes, which would drop the focus
// we just gave the title: the new instance for the same list picks it up again,
// but only shortly after the rename and only if focus is not elsewhere already.
let restoreTitleFocus: { listId: string; at: number } | null = null
const RESTORE_WINDOW_MS = 3000

const focusIsFree = () => !document.activeElement || document.activeElement === document.body

// After a delete the list page is gone; hand focus to the index heading once it renders.
function focusIndexHeading(attemptsLeft = 40) {
  const heading = document.querySelector<HTMLElement>('h1[data-todo-index-heading]')
  if (heading) heading.focus()
  else if (attemptsLeft > 0) setTimeout(() => focusIndexHeading(attemptsLeft - 1), 50)
}

// List title with its "..." menu. Rename happens in place in the title; delete asks
// first and says how many items go with the list. The page remounts this component
// when the name changes (key), so local state never lingers on a stale name.
export default function ListHeader({ babyId, listId, name, itemCount }: { babyId: string; listId: string; name: string; itemCount: number }) {
  const t = useTranslations('todo.lists')
  const router = useRouter()
  const confirmAction = useConfirm()
  const [shownName, setShownName] = useState(name)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  // Escape cancels, but the blur that follows must not save.
  const cancelled = useRef(false)
  // The menu would hand focus back to its trigger on close and blur the rename field.
  const renaming = useRef(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const refocusTitle = useRef(false)

  // Set when Enter or Escape ends the rename (not a tap elsewhere), so only then
  // do we move focus back to the title.
  const endedByKey = useRef(false)

  useEffect(() => {
    const pending = restoreTitleFocus
    if (!pending || pending.listId !== listId) return
    restoreTitleFocus = null
    if (Date.now() - pending.at < RESTORE_WINDOW_MS && focusIsFree()) titleRef.current?.focus()
  }, [listId])

  // Back to the heading once the input is gone, so keyboard users aren't dropped on <body>.
  useEffect(() => {
    if (!editing && refocusTitle.current) {
      refocusTitle.current = false
      if (focusIsFree()) titleRef.current?.focus()
    }
  }, [editing])

  const startEditing = () => {
    cancelled.current = false
    endedByKey.current = false
    renaming.current = true
    setDraft(shownName)
    setEditing(true)
  }

  const commit = async () => {
    setEditing(false)
    renaming.current = false
    const byKey = endedByKey.current
    endedByKey.current = false
    refocusTitle.current = byKey
    const next = draft.trim()
    if (cancelled.current || !next || next === shownName) return
    const previous = shownName
    setShownName(next)
    try {
      await updateTodoList(babyId, listId, { name: next })
      restoreTitleFocus = byKey ? { listId, at: Date.now() } : null
      router.refresh()
    } catch (err) {
      console.error(err)
      setShownName(previous)
      toast.error(t('saveError'))
      // Keep the field open with what was typed so it can be retried.
      refocusTitle.current = false
      renaming.current = true
      setEditing(true)
    }
  }

  const handleDelete = async () => {
    const confirmed = await confirmAction({
      title: itemCount > 0 ? t('deleteConfirm', { name: shownName, count: itemCount }) : t('deleteConfirmEmpty', { name: shownName }),
      confirmLabel: t('delete'),
      destructive: true,
    })
    if (!confirmed) return
    try {
      await deleteTodoList(babyId, listId)
      toast.success(t('deleted'))
      router.push(`/baby/${babyId}/todo`)
      focusIndexHeading()
    } catch (err) {
      console.error(err)
      toast.error(t('saveError'))
    }
  }

  return (
    <div className="flex items-start justify-between gap-2">
      {editing ? (
        <input
          autoFocus
          value={draft}
          maxLength={INPUT_LIMITS.todoListName}
          aria-label={t('rename')}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { endedByKey.current = true; event.currentTarget.blur() }
            if (event.key === 'Escape') { cancelled.current = true; endedByKey.current = true; event.currentTarget.blur() }
          }}
          className="min-w-0 flex-1 bg-transparent font-display text-2xl font-semibold outline-none"
        />
      ) : (
        <h1 ref={titleRef} tabIndex={-1} className="min-w-0 flex-1 break-words font-display text-2xl font-semibold outline-none">{shownName}</h1>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('menuLabel')}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-landing-muted outline-none hover:text-landing-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal aria-hidden className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" finalFocus={() => !renaming.current}>
          <DropdownMenuItem className="cursor-pointer" onClick={startEditing}>
            <Pencil aria-hidden /> {t('rename')}
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" variant="destructive" onClick={handleDelete}>
            <Trash2 aria-hidden /> {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
