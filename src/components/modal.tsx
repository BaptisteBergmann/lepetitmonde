'use client'

import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ConfirmProvider } from '@/components/confirm_provider'
import { cn } from '@utils/utils'

// Shared shell for the app's form modals (create/edit post, album, event, ...).
// Built on the Dialog primitive so every modal gets role="dialog"/aria-modal, an accessible
// name (the title), focus trap + restore, Escape to close and body scroll lock for free.
//
// Callers keep rendering it only while it should be open (`{open && <Modal ...>}`), so it is
// always `open` here; `onClose` fires for Escape, backdrop click and the close button.
//
// Children are laid out below the header inside a flex column: use a `flex-1 overflow-y-auto`
// body followed by an optional footer, as the modals did before.
export function Modal({
  onClose,
  title,
  titleClassName,
  children,
}: {
  onClose: () => void
  title: React.ReactNode
  titleClassName?: string
  children: React.ReactNode
}) {
  const tA11y = useTranslations('a11y')

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] max-w-[460px] gap-0 overflow-hidden border border-landing-border bg-landing-surface p-0 text-landing-foreground shadow-2xl"
      >
        {/* Own provider so confirmations opened from inside the modal nest in its tree
            (a dialog rendered outside would count as an "outside click" and close the modal). */}
        <ConfirmProvider>
          <div className="flex items-center justify-between border-b border-landing-border px-5 py-4">
            <DialogTitle className={cn('flex items-center gap-2 font-display text-base font-semibold', titleClassName)}>
              {title}
            </DialogTitle>
            <DialogClose
              aria-label={tA11y('close')}
              className="p-1 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer touch-target relative pointer-coarse:p-2"
            >
              <X className="h-4 w-4" />
            </DialogClose>
          </div>
          {children}
        </ConfirmProvider>
      </DialogContent>
    </Dialog>
  )
}
