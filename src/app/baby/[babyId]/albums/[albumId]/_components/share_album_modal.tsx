'use client'

import { useConfirm } from '@/components/confirm_provider'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { getDateFnsLocale } from '@utils/formatting'
import { Tables } from '@utils/supabase/database.types'
import { createAlbumShare, getAlbumShares, revokeAlbumShare } from '@utils/actions/albums'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Share2, X, Copy } from 'lucide-react'

type AlbumShare = Tables<'album_shares'>

const DURATIONS: Record<string, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
}

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
  const confirmAction = useConfirm()
  const dateFnsLocale = getDateFnsLocale(useLocale())

  const [duration, setDuration] = useState<string>('7d')
  const [generating, setGenerating] = useState(false)
  const [shares, setShares] = useState<AlbumShare[] | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const loadShares = async () => {
    const data = await getAlbumShares(albumId, babyId)
    setShares(data)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadShares()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const url = await createAlbumShare(albumId, babyId, DURATIONS[duration])
      if (url) {
        await navigator.clipboard.writeText(url)
        toast.success(t('copied'))
      }
      await loadShares()
    } catch (err) {
      console.error(err)
      toast.error(t('linkError'))
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = async (shareId: string) => {
    const url = `${window.location.origin}/share/album/${shareId}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('copied'))
    } catch (err) {
      console.error(err)
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

  return createPortal(
    <div
      className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs flex justify-center items-center z-[60] p-4 animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] max-h-[90vh] bg-landing-surface text-landing-foreground shadow-2xl rounded-3xl overflow-hidden flex flex-col border border-landing-border animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b border-landing-border py-4 px-5">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Share2 className="h-4.5 w-4.5 text-primary" />
            {t('title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

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
            <Button className="gap-2 rounded-2xl cursor-pointer shrink-0" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>{t('generate')}</span>
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('activeLinks')}
            </p>
            {shares === null ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-landing-muted" />
              </div>
            ) : activeShares.length === 0 ? (
              <p className="text-sm text-landing-muted">{t('noActiveLinks')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {activeShares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-landing-border p-3"
                  >
                    <p className="text-xs text-landing-muted">
                      {t('expiresOn', { date: format(new Date(share.expires_at), 'PPP', { locale: dateFnsLocale }) })}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleCopy(share.id)}
                        className="p-1.5 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleRevoke(share.id)}
                        disabled={revokingId === share.id}
                        className="px-2 py-1 text-xs rounded-lg text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {revokingId === share.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('revoke')}
                      </button>
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
      </div>
    </div>,
    document.body,
  )
}
