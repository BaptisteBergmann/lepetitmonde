import { createAdminClient } from '@utils/supabase/admin'
import { getPostsForRangeAsMember } from '@utils/actions/posts'
import { sendGazetteDigestEmail } from '@/utils/email'
import { logger } from '@/utils/logger'
import { subDays, formatISO } from 'date-fns'

export const dynamic = 'force-dynamic'

// Triggered by an external cron source (host crontab or a compose sidecar —
// see .claude/plans/gazette.md), not Vercel Cron: this app runs on a
// self-hosted Docker/Portainer stack, not Vercel. No session exists here, so
// membership/circle/opt-out data is read straight off the admin client
// instead of going through the usual session-bound action helpers.
export async function GET(request: Request) {
  const contextLogger = logger.child({ function: 'GET', route: '/api/cron/gazette' })

  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    contextLogger.warn('Rejected cron request: missing or invalid secret')
    return Response.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const to = formatISO(now, { representation: 'date' })

  const { data: babies, error: babiesError } = await supabase
    .from('babies')
    .select('id, baby_surname, last_gazette_sent_at')

  if (babiesError) {
    contextLogger.error(babiesError, 'Error fetching babies for Gazette digest')
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }

  let emailsSent = 0
  let recipientsSkippedEmpty = 0
  let recipientsSkippedOptedOut = 0

  for (const baby of babies ?? []) {
    try {
      const since = baby.last_gazette_sent_at
        ? formatISO(new Date(baby.last_gazette_sent_at), { representation: 'date' })
        : formatISO(subDays(now, 7), { representation: 'date' })

      const [{ data: access }, { data: circleRows }, { data: optedOut }] = await Promise.all([
        supabase.from('baby_access').select('user_id, access_level').eq('baby_id', baby.id),
        supabase.from('circles_access').select('user_id, circle_id').eq('baby_id', baby.id),
        supabase.from('notification_preferences').select('user_id').eq('baby_id', baby.id).eq('notification_type', 'gazette_digest'),
      ])

      const circleIdsByUser = new Map<string, string[]>()
      for (const row of circleRows ?? []) {
        circleIdsByUser.set(row.user_id, [...(circleIdsByUser.get(row.user_id) ?? []), row.circle_id])
      }
      const optedOutIds = new Set((optedOut ?? []).map((row) => row.user_id))

      for (const member of access ?? []) {
        if (optedOutIds.has(member.user_id)) { recipientsSkippedOptedOut++; continue }

        const posts = await getPostsForRangeAsMember(baby.id, since, to, {
          isAdmin: member.access_level === 'admin',
          circleIds: circleIdsByUser.get(member.user_id) ?? [],
        })

        if (posts.length === 0) { recipientsSkippedEmpty++; continue }

        const { data: authUser } = await supabase.auth.admin.getUserById(member.user_id)
        const email = authUser?.user?.email
        if (!email) continue

        const periodLabel = `Du ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(since))} au ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(now)}`

        await sendGazetteDigestEmail(email, baby.baby_surname, periodLabel, posts.map((post) => ({
          photoUrl: post.photos[0]?.url ?? null,
          caption: post.caption,
          takenAt: post.taken_at,
        })))

        emailsSent++
      }

      // Moves the window forward every run regardless of whether anything was
      // sent, so a quiet week doesn't cause the next digest to cover months.
      await supabase.from('babies').update({ last_gazette_sent_at: now.toISOString() }).eq('id', baby.id)
    } catch (err) {
      contextLogger.error(err, 'Error processing Gazette digest for baby')
    }
  }

  const summary = { babiesProcessed: babies?.length ?? 0, emailsSent, recipientsSkippedEmpty, recipientsSkippedOptedOut }
  contextLogger.info(summary, 'Gazette digest run complete')

  return Response.json(summary)
}
