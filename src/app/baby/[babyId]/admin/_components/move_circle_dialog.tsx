'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { Tables } from '@utils/supabase/database.types'
import { setCircleParent } from '@utils/actions/circles'
import { orderAsTree, validParentIds } from '@utils/circle-tree'
import { membershipConflicts, moveImpact, type MoveImpactEntry } from '@utils/circle-move'
import { useConfirm } from '@/components/confirm_provider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getMemberLabel, TOP_LEVEL } from './circle_utils'

type Circle = Tables<'circles'>
type CircleAccess = Tables<'circles_access'>
type User = Tables<'users'>

const MAX_NAMES = 6
const INDENT_CLASS = ['pl-2', 'pl-6', 'pl-10']

interface MoveCircleDialogProps {
  circle: Circle
  circles: Circle[]
  circlesAccess: CircleAccess[]
  users: User[]
  babyId: string
  onClose: () => void
  onPendingChange: (circleId: string | null) => void
}

// Step 1 (this dialog): pick the new parent. Step 2: the shared confirm dialog lists who
// gains and loses access, because a move changes access to existing content right away.
export default function MoveCircleDialog({ circle, circles, circlesAccess, users, babyId, onClose, onPendingChange }: MoveCircleDialogProps) {
  const t = useTranslations('admin.circles')
  const tCreate = useTranslations('admin.createCircle')
  const tCommon = useTranslations('common')
  const confirmAction = useConfirm()
  const router = useRouter()
  const [selected, setSelected] = useState<string>(circle.parent_circle ?? TOP_LEVEL)

  const nodes = useMemo(() => circles.map((c) => ({ id: c.id, parent_circle: c.parent_circle })), [circles])
  const options = useMemo(() => {
    const allowed = new Set(validParentIds(circle.id, nodes))
    return orderAsTree(circles).filter((c) => allowed.has(c.id))
  }, [circle.id, circles, nodes])

  const userName = (id: string) => getMemberLabel(users.find((u) => u.id === id), t)
  const circleName = (id: string) => circles.find((c) => c.id === id)?.name ?? ''

  const newParentId = selected === TOP_LEVEL ? null : selected
  const unchanged = newParentId === circle.parent_circle
  const conflictIds = membershipConflicts(circle.id, newParentId, nodes, circlesAccess)
  const blocked = conflictIds.length > 0

  const renderEntries = (entries: MoveImpactEntry[], key: 'moveGains' | 'moveLoses') => entries.map((entry) => {
    const names = entry.userIds.map(userName)
    const shown = names.slice(0, MAX_NAMES).join(', ')
    const extra = names.length > MAX_NAMES ? `, ${t('moreNames', { count: names.length - MAX_NAMES })}` : ''
    return (
      <div key={`${key}-${entry.circleId}`} className="space-y-0.5">
        <p className="text-sm font-medium">{t(key, { circle: circleName(entry.circleId), count: entry.userIds.length })}</p>
        <p className="text-sm text-landing-muted">{shown}{extra}</p>
      </div>
    )
  })

  async function handleContinue() {
    const { gains, loses } = moveImpact(circle.id, newParentId, nodes, circlesAccess)
    const parentName = newParentId ? circleName(newParentId) : ''
    const name = circle.name ?? ''

    const confirmed = await confirmAction({
      title: newParentId ? t('moveConfirm', { name, parent: parentName }) : t('moveConfirmTop', { name }),
      description: newParentId ? t('moveRetroactive', { parent: parentName }) : t('moveRetroactiveTop'),
      confirmLabel: t('moveSubmit'),
      destructive: false,
      content: (
        <div className="space-y-3">
          {gains.length === 0 && loses.length === 0
            ? <p className="text-sm text-landing-muted">{t('moveNoChange')}</p>
            : <>{renderEntries(gains, 'moveGains')}{renderEntries(loses, 'moveLoses')}</>}
        </div>
      ),
    })
    if (!confirmed) return

    onClose()
    onPendingChange(circle.id)
    try {
      await setCircleParent(circle.id, newParentId, babyId)
      toast.success(t('moved'))
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t('moveError'))
    } finally {
      onPendingChange(null)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('moveTitle', { name: circle.name ?? '' })}</DialogTitle>
          <DialogDescription>{options.length > 0 ? t('moveListHint') : t('moveNoTarget')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('moveParentLabel')}</p>
          <Select value={selected} onValueChange={(value) => setSelected(value ?? TOP_LEVEL)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TOP_LEVEL}>{tCreate('parentNone')}</SelectItem>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id} className={`min-h-11 ${INDENT_CLASS[Math.min(option.depth, 2)]}`}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {blocked && (
            <p role="alert" className="text-sm text-destructive">
              {t('moveMemberConflict', { names: conflictIds.map(userName).join(', ') })}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-2xl cursor-pointer" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button type="button" size="sm" className="rounded-2xl cursor-pointer" disabled={unchanged || blocked} onClick={handleContinue}>
            {t('moveContinue')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
