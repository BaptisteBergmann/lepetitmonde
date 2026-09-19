'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
}

type ConfirmFn = (options: string | ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

// Imperative replacement for window.confirm(): `if (!(await confirmAction(t('x')))) return`.
// One dialog is mounted for the whole app, so it can be opened from any handler
// (including from inside other modals) without each caller owning a trigger.
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common')
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirmAction = useCallback<ConfirmFn>((opts) => {
    // A second call while one is open cancels the first.
    resolver.current?.(false)
    setOptions(typeof opts === 'string' ? { title: opts } : opts)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirmAction}>
      {children}
      <Dialog open={options !== null} onOpenChange={(open) => { if (!open) settle(false) }}>
        <DialogContent className="gap-4">
          <DialogHeader>
            <DialogTitle>{options?.title}</DialogTitle>
            {options?.description && <DialogDescription>{options.description}</DialogDescription>}
          </DialogHeader>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-2xl cursor-pointer" onClick={() => settle(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant={options?.destructive === false ? 'default' : 'destructive'}
              size="sm"
              className="rounded-2xl cursor-pointer"
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? t('confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const confirmAction = useContext(ConfirmContext)
  if (!confirmAction) throw new Error('useConfirm must be used within <ConfirmProvider>')
  return confirmAction
}
