'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { format, parseISO } from 'date-fns'
import { getDateFnsLocale } from '@utils/formatting'
import { BarChart3, X, Eye, SmilePlus, MessageCircle } from 'lucide-react'
import { getPostStats, PostStats } from '@utils/actions/post_stats'
import { PostWithDetails } from '@utils/actions/posts'
import { Tables } from '@utils/supabase/database.types'
import { Badge } from '@components/ui/badge'

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
  const tA11y = useTranslations('a11y')
  const dateFnsLocale = getDateFnsLocale(useLocale())
  const [stats, setStats] = useState<PostStats | null>(null)

  useEffect(() => {
    getPostStats(post.id, babyId, post.created_by).then(setStats)
  }, [post.id, babyId, post.created_by])

  const postCircles = post.circle_ids.map((id) => circles.find((c) => c.id === id))

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
            <BarChart3 className="h-4.5 w-4.5 text-primary" />
            {t('postStats.title')}
          </h2>
          <button
            aria-label={tA11y('close')}
            onClick={onClose}
            className="p-1 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

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

          {!stats ? (
            <p className="text-sm text-landing-muted">{t('postStats.loading')}</p>
          ) : (
            <>
              <StatSection title={t('postStats.seenBy')} icon={Eye}>
                {stats.views.count > 0 ? (
                  <p className="text-sm text-landing-foreground">{stats.views.names.join(", ")}</p>
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
                        <span className="text-landing-muted"> — {names.join(", ")}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-landing-muted">{t('postStats.noReactions')}</p>
                )}
              </StatSection>

              <StatSection title={t('postStats.comments')} icon={MessageCircle}>
                <p className="text-sm text-landing-foreground">{stats.commentCount}</p>
              </StatSection>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
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
