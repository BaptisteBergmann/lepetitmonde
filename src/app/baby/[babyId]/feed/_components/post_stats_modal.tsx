'use client'

import { Modal } from '@/components/modal'
import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { format, parseISO } from 'date-fns'
import { getDateFnsLocale } from '@utils/formatting'
import { AlertCircle, BarChart3, Eye, SmilePlus, MessageCircle, ListChecks, RotateCw } from 'lucide-react'
import { getPostStats, PostStats } from '@utils/actions/post_stats'
import { PostWithDetails } from '@utils/actions/posts'
import { Tables } from '@utils/supabase/database.types'
import { Badge } from '@components/ui/badge'
import { Button } from '@/components/ui/button'
import { logger } from '@/utils/logger'

type Circle = Tables<'circles'>

export default function PostStatsModal({
  babyId,
  post,
  circles,
  circleMemberCounts,
  onClose,
}: {
  babyId: string
  post: PostWithDetails
  circles: Circle[]
  circleMemberCounts: Record<string, number>
  onClose: () => void
}) {
  const t = useTranslations('feed')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const dateFnsLocale = getDateFnsLocale(locale)
  const [stats, setStats] = useState<PostStats | null>(null)
  const [error, setError] = useState(false)
  // Full list (this is the detail view), joined the locale's way: "A, B and C".
  const listFormat = useMemo(() => new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }), [locale])

  // Bumped by Retry to re-run the fetch effect.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    getPostStats(post.id, babyId, post.created_by)
      .then((result) => { if (!cancelled) setStats(result) })
      .catch((err) => {
        logger.child({ function: 'PostStatsModal.loadStats', babyId, postId: post.id, attempt }).error(err, 'Error loading post stats')
        if (!cancelled) setError(true)
      })
    return () => { cancelled = true }
  }, [post.id, babyId, post.created_by, attempt])

  const retry = () => {
    setError(false)
    setAttempt((n) => n + 1)
  }

  const postCircles = post.circle_ids.map((id) => circles.find((c) => c.id === id))

  return (
    <Modal onClose={onClose} title={<><BarChart3 className="h-4.5 w-4.5 text-primary" />{t('postStats.title')}</>}>
      <div className="p-5 space-y-5 flex-1 overflow-y-auto">
        <div>
          <p className="text-sm font-semibold capitalize">
            {format(parseISO(post.taken_at), 'EEEE d MMMM yyyy', { locale: dateFnsLocale })}
          </p>
          {post.caption && (
            <p className="mt-1 text-sm text-landing-muted whitespace-pre-wrap">{post.caption}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {postCircles.length > 0 ? (
              postCircles.map((circle, index) => {
                const isEmpty = !!circle && (circleMemberCounts[circle.id] ?? 0) === 0
                return (
                  <Badge key={circle?.id ?? index} variant={isEmpty ? "destructive" : "secondary"}>
                    {circle?.name ?? t('circleFallback')}
                    {isEmpty && ` (${t('emptyCircleSuffix')})`}
                  </Badge>
                )
              })
            ) : (
              <Badge variant="destructive">{t('adminOnly')}</Badge>
            )}
          </div>
        </div>

        {error ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-landing-border bg-landing-background p-4">
            <p className="flex items-start gap-2 text-sm text-landing-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              {t('postStats.loadError')}
            </p>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-2xl" onClick={retry}>
              <RotateCw className="h-3.5 w-3.5" />
              {tCommon('retry')}
            </Button>
          </div>
        ) : !stats ? (
          <p role="status" className="text-sm text-landing-muted">{t('postStats.loading')}</p>
        ) : (
          <>
            <StatSection title={t('postStats.seenBy')} icon={Eye}>
              {stats.views.count > 0 ? (
                <p className="text-sm text-landing-foreground">{listFormat.format(stats.views.names)}</p>
              ) : (
                <p className="text-sm text-landing-muted">{t('nobodyYet')}</p>
              )}
            </StatSection>

            <StatSection title={t('postStats.reactions')} icon={SmilePlus}>
              {stats.reactions.length > 0 ? (
                <div className="space-y-1">
                  {stats.reactions.map(({ emoji, count, names }) => (
                    <p key={emoji} className="text-sm text-landing-foreground">
                      <span className="mr-1">{emoji}</span>
                      <span className="font-medium">{count}</span>
                      <span className="text-landing-muted"> — {listFormat.format(names)}</span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-landing-muted">{t('postStats.noReactions')}</p>
              )}
            </StatSection>

            {stats.poll && (
              <StatSection title={t('postStats.poll')} icon={ListChecks}>
                <p className="text-sm font-medium text-landing-foreground">{stats.poll.question}</p>
                <div className="space-y-1">
                  {stats.poll.options.map(({ id, label, count, voterNames }) => (
                    <p key={id} className="text-sm text-landing-foreground">
                      <span className="mr-1">{label}</span>
                      <span className="font-medium">{count}</span>
                      {voterNames.length > 0 && (
                        <span className="text-landing-muted"> — {listFormat.format(voterNames)}</span>
                      )}
                    </p>
                  ))}
                </div>
              </StatSection>
            )}

            <StatSection title={t('postStats.comments')} icon={MessageCircle}>
              <p className="text-sm text-landing-foreground">{stats.commentCount}</p>
            </StatSection>
          </>
        )}
      </div>
    </Modal>
  )
}

function StatSection({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </p>
      {children}
    </div>
  )
}
