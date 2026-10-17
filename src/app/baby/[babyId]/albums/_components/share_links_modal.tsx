'use client'

import { Modal } from '@/components/modal'
import { useConfirm } from '@/components/confirm_provider'
import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { getDateFnsLocale } from '@utils/formatting'
import { getBabyShares, getShareAccesses, revokeShare, type ShareAccess, type ShareSummary } from '@utils/actions/shares'
import { SHARE_LIMITS } from '@utils/album-limits'
import { userAgentLabel } from '@utils/user-agent-label'
import { Button } from '@/components/ui/button'
import { Badge } from '@components/ui/badge'
import { cn } from '@utils/utils'
import { Link2, ChevronDown, Loader2 } from 'lucide-react'

type Status = 'active' | 'expired' | 'revoked' | 'used'

function getStatus(share: ShareSummary, now: number): Status {
  if (share.revokedAt) return 'revoked'
  if (share.singleUse && share.openedAt) return 'used'
  if (new Date(share.expiresAt).getTime() <= now) return 'expired'
  return 'active'
}

export default function ShareLinksModal({ babyId, onClose }: { babyId: string; onClose: () => void }) {
  const t = useTranslations('albums.share')
  const confirmAction = useConfirm()
  const locale = useLocale()
  const dateFnsLocale = getDateFnsLocale(locale as Parameters<typeof getDateFnsLocale>[0])

  const [shares, setShares] = useState<ShareSummary[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [accesses, setAccesses] = useState<Record<string, ShareAccess[] | 'loading' | 'error'>>({})
  // Fixed at mount: keeps render pure; statuses are recomputed on every reload.
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const data = await getBabyShares(babyId)
      setShares(data)
      setNow(Date.now())
      setLoadError(false)
    } catch (err) {
      console.error(err)
      setShares((prev) => prev ?? [])
      setLoadError(true)
    }
  }, [babyId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const loadAccesses = async (shareId: string) => {
    setAccesses((prev) => ({ ...prev, [shareId]: 'loading' }))
    try {
      const rows = await getShareAccesses(shareId, babyId)
      setAccesses((prev) => ({ ...prev, [shareId]: rows }))
    } catch (err) {
      console.error(err)
      setAccesses((prev) => ({ ...prev, [shareId]: 'error' }))
    }
  }

  const toggleAccesses = (shareId: string) => {
    if (expandedId === shareId) { setExpandedId(null); return }
    setExpandedId(shareId)
    // Loaded on first expand only, then kept for the modal's lifetime.
    if (accesses[shareId] === undefined) void loadAccesses(shareId)
  }

  const handleRevoke = async (shareId: string) => {
    if (!(await confirmAction(t('revokeConfirm')))) return
    setRevokingId(shareId)
    const previous = shares
    // Optimistic: the card moves to Ended right away, rolled back on error.
    setShares((prev) => prev?.map((s) => (s.id === shareId ? { ...s, revokedAt: new Date().toISOString() } : s)) ?? prev)
    try {
      await revokeShare(shareId, babyId)
      toast.success(t('revoked'))
      void load()
    } catch (err) {
      console.error(err)
      setShares(previous)
      toast.error(t('revokeError'))
    } finally {
      setRevokingId(null)
    }
  }

  const relative = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: dateFnsLocale })

  const statusLabel: Record<Status, string> = {
    active: t('statusActive'),
    expired: t('statusExpired'),
    revoked: t('statusRevoked'),
    used: t('statusUsed'),
  }

  const renderCard = (share: ShareSummary, status: Status) => {
    const ended = status !== 'active'
    const title = share.label
      ?? (share.kind === 'album' ? t('fallbackAlbum', { name: share.albumName ?? '' }) : t('kindPhotos', { count: share.photoCount ?? 0 }))
    const kindText = share.kind === 'album' ? null : t('kindPhotos', { count: share.photoCount ?? 0 })
    const expiryText = status === 'active'
      ? t('expiresIn', { relative: relative(share.expiresAt) })
      : status === 'expired' ? t('expiredOn', { relative: relative(share.expiresAt) }) : null
    const regionId = `share-log-${share.id}`
    const log = accesses[share.id]
    const expanded = expandedId === share.id

    return (
      <li key={share.id} className={cn('rounded-2xl border border-landing-border p-3 space-y-2', ended && 'opacity-80')}>
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-medium break-words">{title}</p>
          <Badge
            variant={status === 'active' ? 'default' : status === 'revoked' ? 'destructive' : 'secondary'}
            className="shrink-0"
          >
            {statusLabel[status]}
          </Badge>
        </div>
        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p>{[kindText, share.singleUse ? t('singleUse') : null, expiryText].filter(Boolean).join(' - ')}</p>
          <p>
            {t('accessCount', { count: share.accessCount })}
            {share.lastAccessedAt ? ` - ${t('lastAccess', { relative: relative(share.lastAccessedAt) })}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-11 gap-2 rounded-2xl cursor-pointer"
            aria-expanded={expanded}
            aria-controls={regionId}
            onClick={() => toggleAccesses(share.id)}
          >
            <span>{t('accessLog', { count: share.accessCount })}</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', expanded && 'rotate-180')} aria-hidden="true" />
          </Button>
          {/* A used single-use link can still be revoked (its images load for a short grace window). */}
          {(status === 'active' || status === 'used') && (
            <Button
              variant="ghost"
              className="h-11 rounded-2xl text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
              onClick={() => handleRevoke(share.id)}
              disabled={revokingId === share.id}
            >
              {revokingId === share.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : t('revoke')}
            </Button>
          )}
        </div>
        {expanded && (
          <div id={regionId} role="region" aria-label={t('accessLogRegion')} className="border-t border-landing-border pt-2">
            {log === undefined || log === 'loading' ? (
              <div role="status" className="flex justify-center py-3">
                <Loader2 className="h-5 w-5 animate-spin text-landing-muted" aria-hidden="true" />
                <span className="sr-only">{t('accessLog', { count: share.accessCount })}</span>
              </div>
            ) : log === 'error' ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-landing-muted">{t('accessLogError')}</p>
                <Button variant="outline" className="h-11 rounded-2xl cursor-pointer" onClick={() => void loadAccesses(share.id)}>{t('retry')}</Button>
              </div>
            ) : log.length === 0 ? (
              <p className="text-sm text-landing-muted">{t('accessLogEmpty')}</p>
            ) : (
              <>
                <ul className="divide-y divide-landing-border">
                  {log.map((row, i) => {
                    const device = userAgentLabel(row.user_agent)
                    return (
                      <li key={`${row.accessed_at}-${i}`} className="py-2">
                        <p className="text-sm">{format(new Date(row.accessed_at), 'PPp', { locale: dateFnsLocale })}</p>
                        <p className="text-xs text-muted-foreground break-all">
                          <span className="font-mono">{row.ip ?? t('ipUnknown')}</span>
                          {row.user_agent && (
                            <span title={row.user_agent}>
                              {' - '}
                              {device ?? (row.user_agent.length > 60 ? `${row.user_agent.slice(0, 60)}…` : row.user_agent)}
                            </span>
                          )}
                        </p>
                      </li>
                    )
                  })}
                </ul>
                {log.length >= SHARE_LIMITS.accessLogRows && (
                  <p className="pt-2 text-xs text-muted-foreground">{t('accessLogLimit', { count: SHARE_LIMITS.accessLogRows })}</p>
                )}
              </>
            )}
          </div>
        )}
      </li>
    )
  }

  const withStatus = (shares ?? []).map((share) => ({ share, status: getStatus(share, now) }))
  const active = withStatus.filter((s) => s.status === 'active')
  const ended = withStatus.filter((s) => s.status !== 'active')

  return (
    <Modal onClose={onClose} title={<><Link2 className="h-4.5 w-4.5 text-primary" aria-hidden="true" />{t('linksTitle')}</>}>
      <div className="p-5 space-y-5 flex-1 overflow-y-auto">
        {shares === null ? (
          <div role="status" className="space-y-2">
            <div className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
            <div className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
            <span className="sr-only">{t('linksTitle')}</span>
          </div>
        ) : loadError && shares.length === 0 ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-landing-muted">{t('loadError')}</p>
            <Button variant="outline" className="h-11 rounded-2xl cursor-pointer" onClick={() => void load()}>{t('retry')}</Button>
          </div>
        ) : shares.length === 0 ? (
          <p className="text-sm text-landing-muted">{t('noLinks')}</p>
        ) : (
          <>
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('activeLinks')}</h3>
              {active.length === 0 ? (
                <p className="text-sm text-landing-muted">{t('noActiveLinks')}</p>
              ) : (
                <ul className="space-y-2">{active.map(({ share, status }) => renderCard(share, status))}</ul>
              )}
            </section>
            {ended.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('endedLinks')}</h3>
                <ul className="space-y-2">{ended.map(({ share, status }) => renderCard(share, status))}</ul>
              </section>
            )}
          </>
        )}
      </div>

      <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
        <Button variant="outline" className="rounded-2xl cursor-pointer" onClick={onClose}>
          {t('close')}
        </Button>
      </div>
    </Modal>
  )
}
