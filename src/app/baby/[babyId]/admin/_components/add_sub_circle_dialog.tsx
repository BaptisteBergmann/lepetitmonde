'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { Tables } from '@utils/supabase/database.types'
import { createSubCircle } from '@utils/actions/circles'
import { INPUT_LIMITS } from '@utils/input-limits'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type Circle = Tables<'circles'>

interface AddSubCircleDialogProps {
  parent: Circle
  babyId: string
  onClose: () => void
}

export default function AddSubCircleDialog({ parent, babyId, onClose }: AddSubCircleDialogProps) {
  const t = useTranslations('admin.circles')
  const tCreate = useTranslations('admin.createCircle')
  const tCommon = useTranslations('common')
  const tServer = useTranslations('serverErrors')
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleSubmit(formData: FormData) {
    formData.set('babyId', babyId)
    formData.set('parentId', parent.id)
    setPending(true)
    try {
      const result = await createSubCircle(formData)
      if (result.error) {
        toast.error(tServer(result.error))
        return
      }
      toast.success(t('created'))
      onClose()
      router.refresh()
    } catch {
      toast.error(t('createError'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t('addSubCircleTitle')}</DialogTitle>
            <DialogDescription>{t('insideLine', { parent: parent.name ?? '' })}</DialogDescription>
          </DialogHeader>
          <Input
            name="name"
            autoFocus
            required
            maxLength={INPUT_LIMITS.circleName}
            placeholder={tCreate('namePlaceholder')}
            aria-label={tCreate('namePlaceholder')}
            className="w-full bg-input/40"
          />
          <p className="text-xs text-landing-muted">{t('subCircleHint', { parent: parent.name ?? '' })}</p>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-2xl cursor-pointer" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" size="sm" className="rounded-2xl cursor-pointer" disabled={pending}>
              {tCreate('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
