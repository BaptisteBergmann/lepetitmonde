'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { INPUT_LIMITS } from '@/utils/input-limits'
import { deleteTodoList, updateTodoList } from '@/utils/actions/todo'
import { useConfirm } from '@/components/confirm_provider'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

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

  const startEditing = () => {
    cancelled.current = false
    renaming.current = true
    setDraft(shownName)
    setEditing(true)
  }

  const commit = async () => {
    setEditing(false)
    renaming.current = false
    const next = draft.trim()
    if (cancelled.current || !next || next === shownName) return
    const previous = shownName
    setShownName(next)
    try {
      await updateTodoList(babyId, listId, { name: next })
      router.refresh()
    } catch (err) {
      console.error(err)
      setShownName(previous)
      toast.error(t('saveError'))
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
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur() }
          }}
          className="min-w-0 flex-1 bg-transparent font-display text-2xl font-semibold outline-none"
        />
      ) : (
        <h1 className="min-w-0 flex-1 break-words font-display text-2xl font-semibold">{shownName}</h1>
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
