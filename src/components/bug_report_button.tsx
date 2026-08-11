'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bug, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { submitBugReport } from '@utils/actions/bug_reports'

export default function BugReportButton() {
  const t = useTranslations('bugReport')
  const [isOpen, setIsOpen] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [description, setDescription] = useState("")
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const resetState = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setDescription("")
    setScreenshotBlob(null)
    setPreviewUrl(null)
  }

  const handleClose = () => {
    if (isPending) return
    setIsOpen(false)
    resetState()
  }

  const handleOpen = async () => {
    setIsCapturing(true)
    try {
      const { default: html2canvas } = await import('html2canvas-pro')
      const canvas = await html2canvas(document.body, {
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
      })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (blob) {
        setScreenshotBlob(blob)
        setPreviewUrl(URL.createObjectURL(blob))
      }
    } catch (err) {
      console.error("Impossible de capturer une capture d'écran", err)
    } finally {
      setIsCapturing(false)
      setIsOpen(true)
    }
  }

  const handleRemoveScreenshot = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setScreenshotBlob(null)
    setPreviewUrl(null)
  }

  const handleSubmit = async () => {
    if (!description.trim()) return
    setIsPending(true)
    try {
      const formData = new FormData()
      formData.set('description', description)
      formData.set('pageUrl', window.location.href)
      formData.set('userAgent', navigator.userAgent)
      if (screenshotBlob) formData.set('screenshot', screenshotBlob, 'screenshot.png')

      await submitBugReport(formData)
      handleClose()
      alert(t('submittedConfirmation'))
    } catch (err) {
      console.error(err)
      alert(t('submitError'))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={isCapturing}
        aria-label={t('openButton')}
        className="fixed bottom-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground border border-border shadow-lg hover:bg-muted transition-colors cursor-pointer disabled:opacity-60"
      >
        {isCapturing ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Bug className="h-4.5 w-4.5" />}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 animate-in fade-in-0 duration-200"
          onClick={handleClose}
        >
          <div
            className="w-full max-w-[460px] max-h-[90vh] bg-landing-surface text-landing-foreground shadow-2xl rounded-3xl overflow-hidden flex flex-col border border-landing-border animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-landing-border py-4 px-5">
              <h2 className="font-display text-base font-semibold flex items-center gap-2">
                <Bug className="h-4.5 w-4.5 text-primary" />
                {t('title')}
              </h2>
              <button
                onClick={handleClose}
                className="p-1 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              {previewUrl && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={t('screenshotAlt')}
                    className="w-full rounded-2xl border border-landing-border"
                  />
                  <button
                    onClick={handleRemoveScreenshot}
                    aria-label={t('removeScreenshot')}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="bug_description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('descriptionLabel')}
                </label>
                <textarea
                  id="bug_description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder={t('descriptionPlaceholder')}
                  className="w-full border border-transparent bg-input/50 rounded-2xl p-3 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground resize-none transition-[color,box-shadow] duration-200"
                />
              </div>
            </div>

            <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
              <Button
                variant="outline"
                className="rounded-2xl cursor-pointer"
                onClick={handleClose}
                disabled={isPending}
              >
                {t('cancel')}
              </Button>
              <Button
                disabled={!description.trim() || isPending}
                className="rounded-2xl cursor-pointer"
                onClick={handleSubmit}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('sending')}</span>
                  </>
                ) : (
                  <span>{t('send')}</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
