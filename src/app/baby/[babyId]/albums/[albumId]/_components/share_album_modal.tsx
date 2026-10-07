'use client'

import { Modal } from '@/components/modal'
import { useConfirm } from '@/components/confirm_provider'
import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { getDateFnsLocale } from '@utils/formatting'
import { Tables } from '@utils/supabase/database.types'
import { createAlbumShare, getAlbumShares, revokeAlbumShare } from '@utils/actions/albums'
import { SHARE_DURATIONS_HOURS } from '@utils/album-limits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Share2, Copy } from 'lucide-react'

type AlbumShare = Tables<'album_shares'>

export default function ShareAlbumModal({
  babyId,
  albumId,
  onClose,
}: {
  babyId: string
  albumId: string
  onClose: () => void
}) {
  const t = useTranslations('albums.share')
  const tA11y = useTranslations('a11y')
  const confirmAction = useConfirm()
  const dateFnsLocale = getDateFnsLocale(useLocale())

  const [duration, setDuration] = useState<string>('7d')
  const [generating, setGenerating] = useState(false)
  const [shares, setShares] = useState<AlbumShare[] | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const [loadError, setLoadError] = useState(false)
  const [lastLink, setLastLink] = useState<string | null>(null)

  const loadShares = async () => {
    try {
      const data = await getAlbumShares(albumId, babyId)
      setShares(data)
      setLoadError(false)
    } catch (err) {
      console.error(err)
      setShares([])
      setLoadError(true)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadShares()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('copied'))
    } catch (err) {
      console.error(err)
      toast.error(t('copyFailed'))
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    let url: string
    try {
      url = await createAlbumShare(albumId, babyId, SHARE_DURATIONS_HOURS[duration as keyof typeof SHARE_DURATIONS_HOURS])
      setLastLink(url)
    } catch (err) {
      console.error(err)
      toast.error(t('linkError'))
      return
    } finally {
      setGenerating(false)
      void loadShares()
    }

    // Separate from the action: on iOS the clipboard often rejects after an
    // await, but the link already exists and is shown below for manual copy.
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('copied'))
    } catch {
      toast.info(t('copyFailed'))
    }
  }

  const handleRevoke = async (shareId: string) => {
    if (!(await confirmAction(t('revokeConfirm')))) return
    setRevokingId(shareId)
    try {
      await revokeAlbumShare(shareId, babyId)
      await loadShares()
    } catch (err) {
      console.error(err)
      toast.error(t('revokeError'))
    } finally {
      setRevokingId(null)
    }
  }

  const activeShares = (shares ?? []).filter(
    (share) => !share.revoked_at && new Date(share.expires_at) > new Date()
  )

  return (
    <Modal onClose={onClose} title={<><Share2 className="h-4.5 w-4.5 text-primary" />{t('title')}</>}>
      <div className="p-5 space-y-4 flex-1 overflow-y-auto">
        <p className="text-sm text-landing-muted">{t('description')}</p>

        <div className="flex items-center gap-2">
          <Select
            items={{ '24h': t('duration24h'), '7d': t('duration7d'), '30d': t('duration30d') }}
            value={duration}
            onValueChange={(value) => setDuration(value as string)}
          >
            <SelectTrigger className="flex-1 text-foreground bg-input/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="24h">{t('duration24h')}</SelectItem>
                <SelectItem value="7d">{t('duration7d')}</SelectItem>
                <SelectItem value="30d">{t('duration30d')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button className="gap-2 rounded-2xl cursor-pointer shrink-0" onClick={handleGenerate} disabled={generating} aria-busy={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>{t('generate')}</span>
          </Button>
        </div>

        {lastLink && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('newLink')}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                readOnly
                value={lastLink}
                aria-label={t('newLink')}
                onFocus={(e) => e.currentTarget.select()}
                className="h-11 font-mono text-xs sm:flex-1"
              />
              <Button
                variant="outline"
                className="h-11 gap-2 rounded-2xl cursor-pointer"
                onClick={() => handleCopy(lastLink)}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                <span>{tA11y('copy')}</span>
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('activeLinks')}
          </p>
          {shares === null ? (
            <div role="status" className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-landing-muted" aria-hidden="true" />
              <span className="sr-only">{t('activeLinks')}</span>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-landing-muted">{t('loadError')}</p>
              <Button variant="outline" className="rounded-2xl cursor-pointer pointer-coarse:min-h-11" onClick={() => void loadShares()}>
                {t('retry')}
              </Button>
            </div>
          ) : activeShares.length === 0 ? (
            <p className="text-sm text-landing-muted">{t('noActiveLinks')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {activeShares.map((share) => (
                <div
                  key={share.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-landing-border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {t('expiresIn', { relative: formatDistanceToNowStrict(new Date(share.expires_at), { addSuffix: true, locale: dateFnsLocale }) })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('createdOn', { date: format(new Date(share.created_at), 'PPP', { locale: dateFnsLocale }) })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      aria-label={tA11y('copy')}
                      onClick={() => handleCopy(`${window.location.origin}/share/album/${share.id}`)}
                      className="p-1.5 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer touch-target relative pointer-coarse:p-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(share.id)}
                      disabled={revokingId === share.id}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer pointer-coarse:min-h-11"
                    >
                      {revokingId === share.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('revoke')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
        <Button variant="outline" className="rounded-2xl cursor-pointer" onClick={onClose}>
          {t('close')}
        </Button>
      </div>
    </Modal>
  )
}
