'use client'

import { Modal } from '@/components/modal'
import { toast } from 'sonner'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createTodoItem, updateTodoItem } from '@utils/actions/todo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Loader2, ListChecks, Pencil } from 'lucide-react'
import { Tables } from '@utils/supabase/database.types'

type TodoItem = Tables<'todo_items'>

export default function TodoModal({
  babyId,
  item,
  trigger,
}: {
  babyId: string
  item?: TodoItem
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const t = useTranslations('todo.form')
  const isEditMode = !!item
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(item?.title ?? "")
  const [isPending, setIsPending] = useState(false)

  const handleConfirm = async () => {
    setIsPending(true)
    try {
      if (isEditMode) {
        await updateTodoItem(babyId, item.id, { title: title.trim() })
      } else {
        await createTodoItem({ baby_id: babyId, title: title.trim() })
      }

      setOpen(false)
      if (!isEditMode) setTitle("")
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : t('saveError'))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div>
      {trigger ? (
        <span onClick={() => setOpen(true)} className="inline-flex">
          {trigger}
        </span>
      ) : (
        <Button onClick={() => setOpen(true)} className="gap-2 rounded-2xl cursor-pointer">
          <Plus className="h-4 w-4" />
          <span>{t('addTitle')}</span>
        </Button>
      )}

      {open && (
        <Modal onClose={() => setOpen(false)} title={<>{isEditMode ? <Pencil className="h-4.5 w-4.5 text-primary" /> : <ListChecks className="h-4.5 w-4.5 text-primary" />} {isEditMode ? t('editTitle') : t('addTitle')}</>}>
          {/* Modal Content */}
          <form
            id="todo-form"
            className="p-5 space-y-4 flex-1 overflow-y-auto"
            onSubmit={(e) => {
              e.preventDefault()
              if (title.trim() && !isPending) handleConfirm()
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('titleLabel')}
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('titlePlaceholder')}
                autoFocus
                required
              />
            </div>
          </form>

          {/* Modal Footer */}
          <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
            <Button
              variant="outline"
              className="rounded-2xl cursor-pointer"
              onClick={() => setOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              form="todo-form"
              disabled={!title.trim() || isPending}
              className="rounded-2xl cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{isEditMode ? t('saving') : t('adding')}</span>
                </>
              ) : (
                <span>{isEditMode ? t('save') : t('add')}</span>
              )}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
