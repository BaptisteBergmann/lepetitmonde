'use client'

import { Modal } from '@/components/modal'
import { useEffect, useId, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { getDateFnsLocale } from '@utils/formatting'
import { createShare } from '@utils/actions/shares'
import { SHARE_DURATIONS_HOURS, SHARE_LIMITS } from '@utils/album-limits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@utils/utils'
import { Loader2, Share2, Copy, Check, Info } from 'lucide-react'

type DurationKey = keyof typeof SHARE_DURATIONS_HOURS | 'once'
const DURATION_OPTIONS: DurationKey[] = ['24h', '7d', '30d', 'once']

export type ShareTarget =
  | { kind: 'album'; albumId: string }
  | { kind: 'photos'; photoIds: string[] }

export default function ShareModal({
  babyId,
  target,
  onClose,
  onDone,
  onShowLinks,
}: {
  babyId: string
  target: ShareTarget
  onClose: () => void
  // Fires when the admin is done with the one-time link (selection mode exits).
  onDone?: () => void
  onShowLinks?: () => void
}) {
  const t = useTranslations('albums.share')
  const dateFnsLocale = getDateFnsLocale(useLocale())
  const durationLabelId = useId()
  const labelInputId = useId()

  // Fixed at mount so render stays pure; only used for the live "expires on" note.
  const [openedAt] = useState(() => Date.now())
  const [label, setLabel] = useState('')
  const [duration, setDuration] = useState<DurationKey>('7d')
  const [generating, setGenerating] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const copyButtonRef = useRef<HTMLButtonElement>(null)
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([])

  const photoCount = target.kind === 'photos' ? target.photoIds.length : 0
  const title = target.kind === 'album'
    ? t('title')
    : photoCount === 1 ? t('titlePhoto') : t('titleSelection', { count: photoCount })
  const description = target.kind === 'album' ? t('description') : t('descriptionPhotos', { count: photoCount })

  // Move focus to the primary action once the one-time link is on screen.
  useEffect(() => {
    if (link) copyButtonRef.current?.focus()
  }, [link])

  const optionLabel = (key: DurationKey) =>
    key === '24h' ? t('duration24h') : key === '7d' ? t('duration7d') : key === '30d' ? t('duration30d') : t('durationOnce')

  const handleRadioKey = (e: React.KeyboardEvent, index: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (index + delta + DURATION_OPTIONS.length) % DURATION_OPTIONS.length
    setDuration(DURATION_OPTIONS[next])
    radioRefs.current[next]?.focus()
  }

  const expiresNote = duration === 'once'
    ? t('durationOnceHint')
    : t('expiresOn', { date: format(new Date(openedAt + SHARE_DURATIONS_HOURS[duration] * 3600 * 1000), 'PPp', { locale: dateFnsLocale }) })

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('copied'))
      return true
    } catch {
      return false
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    let url: string
    try {
      url = await createShare({
        babyId,
        ...(target.kind === 'album'
          ? { kind: 'album' as const, albumId: target.albumId }
          : { kind: 'photos' as const, photoIds: target.photoIds }),
        // The single-use option rides on the longest preset, so it is capped at 30 days.
        hoursValid: SHARE_DURATIONS_HOURS[duration === 'once' ? '30d' : duration],
        singleUse: duration === 'once',
        label,
      })
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error && err.message ? err.message : t('linkError'))
      return
    } finally {
      setGenerating(false)
    }
    setLink(url)

    // Separate from the action: on iOS the clipboard often rejects after an
    // await, but the link is on screen for manual copy.
    if (!(await copyLink(url))) toast.info(t('copyFailed'))
  }

  const handleDone = () => {
    onDone?.()
    onClose()
  }

  return (
    <Modal
      onClose={link ? handleDone : onClose}
      title={<><Share2 className="h-4.5 w-4.5 text-primary" aria-hidden="true" />{title}</>}
    >
      {link === null ? (
        <>
          <div className="p-5 space-y-4 flex-1 overflow-y-auto">
            <p className="text-sm text-landing-muted">{description}</p>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={labelInputId} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('labelLabel')}
              </Label>
              <Input
                id={labelInputId}
                value={label}
                maxLength={SHARE_LIMITS.label}
                placeholder={t('labelPlaceholder')}
                onChange={(e) => setLabel(e.target.value)}
                className="h-11"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <p id={durationLabelId} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('durationLabel')}
              </p>
              <div role="radiogroup" aria-labelledby={durationLabelId} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DURATION_OPTIONS.map((key, index) => {
                  const selected = duration === key
                  return (
                    <button
                      key={key}
                      ref={(el) => { radioRefs.current[index] = el }}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setDuration(key)}
                      onKeyDown={(e) => handleRadioKey(e, index)}
                      className={cn(
                        'h-11 rounded-2xl border px-2 text-sm cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selected
                          ? 'border-primary bg-primary/10 text-foreground font-medium'
                          : 'border-landing-border text-landing-muted'
                      )}
                    >
                      {optionLabel(key)}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">{expiresNote}</p>
            </div>

            {onShowLinks && (
              <button
                type="button"
                onClick={onShowLinks}
                className="text-sm text-primary underline-offset-4 hover:underline cursor-pointer pointer-coarse:min-h-11"
              >
                {t('allLinks')}
              </button>
            )}
          </div>

          <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
            <Button variant="outline" className="rounded-2xl cursor-pointer" onClick={onClose}>
              {t('close')}
            </Button>
            <Button className="gap-2 rounded-2xl cursor-pointer" onClick={handleGenerate} disabled={generating} aria-busy={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              <span>{t('generate')}</span>
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="p-5 space-y-4 flex-1 overflow-y-auto" aria-live="polite">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
              {t('linkReady')}
            </p>
            <Input
              readOnly
              value={link}
              aria-label={t('linkReady')}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 font-mono text-xs"
            />
            <Button
              ref={copyButtonRef}
              className="h-11 w-full gap-2 rounded-2xl cursor-pointer"
              onClick={async () => { if (!(await copyLink(link))) toast.info(t('copyFailed')) }}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              <span>{t('copy')}</span>
            </Button>
            <div className="flex items-start gap-2 rounded-2xl bg-muted/50 p-3 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{t('linkShownOnce')}</p>
            </div>
          </div>

          <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
            <Button className="rounded-2xl cursor-pointer" onClick={handleDone}>
              {t('done')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
