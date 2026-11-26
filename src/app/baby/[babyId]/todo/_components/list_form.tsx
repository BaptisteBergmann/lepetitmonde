'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { INPUT_LIMITS } from '@/utils/input-limits'
import { createTodoList } from '@/utils/actions/todo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// "+ New list" on the index: swaps in place for a name field. Enter creates the list
// and opens it, Escape cancels.
export default function ListForm({ babyId }: { babyId: string }) {
  const t = useTranslations('todo.lists')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed || pending) return
    startTransition(async () => {
      try {
        const list = await createTodoList(babyId, trimmed)
        router.push(`/baby/${babyId}/todo/${list.id}`)
      } catch (err) {
        console.error(err)
        toast.error(t('saveError'))
      }
    })
  }

  const cancel = () => {
    setOpen(false)
    setName('')
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-landing-border text-landing-muted transition-colors hover:text-landing-foreground"
      >
        <Plus aria-hidden className="size-4" />
        {t('new')}
      </button>
    )
  }

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); submit() }}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-landing-border bg-landing-surface p-3"
    >
      <Input
        autoFocus
        value={name}
        maxLength={INPUT_LIMITS.todoListName}
        placeholder={t('namePlaceholder')}
        aria-label={t('namePlaceholder')}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') cancel() }}
        className="h-11 min-w-0 flex-1 basis-40"
      />
      <Button type="submit" disabled={!name.trim() || pending} className="h-11 cursor-pointer rounded-2xl">
        {t('create')}
      </Button>
      <Button type="button" variant="ghost" onClick={cancel} className="h-11 cursor-pointer rounded-2xl">
        {t('cancel')}
      </Button>
    </form>
  )
}
