'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { INPUT_LIMITS } from '@/utils/input-limits'
import { createTodoList } from '@/utils/actions/todo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

// Create-a-list field for the list page: the chip row has no room for an inline input.
export default function ListNameDialog({ babyId, open, onOpenChange }: { babyId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('todo.lists')
  const router = useRouter()
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed || pending) return
    startTransition(async () => {
      try {
        const list = await createTodoList(babyId, trimmed)
        onOpenChange(false)
        setName('')
        router.push(`/baby/${babyId}/todo/${list.id}`)
      } catch (err) {
        // The dialog stays open so the name isn't lost.
        console.error(err)
        toast.error(t('saveError'))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); submit() }} className="flex flex-col gap-3">
          <Input
            autoFocus
            value={name}
            maxLength={INPUT_LIMITS.todoListName}
            placeholder={t('namePlaceholder')}
            aria-label={t('namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
            className="h-11"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="cursor-pointer rounded-2xl">
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || pending} className="cursor-pointer rounded-2xl">
              {t('create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
