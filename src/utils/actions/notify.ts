'use server'

import webpush, { ensureVapidConfigured } from '@utils/webpush'
import { createAdminClient } from '@utils/supabase/admin'
import { Enums } from '@utils/supabase/database.types'
import { logger } from '../logger'

function currentTimeInParis() {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date()).replace(/^24:/, '00:')
}

function isInQuietHours(now: string, start: string | null, end: string | null) {
  if (!start || !end) return false
  return start <= end ? now >= start && now < end : now >= start || now < end
}

/**
 * Central notification send pipeline: writes the in-app inbox entry (always,
 * so it's there next time the user opens the app), then best-effort pushes
 * to the recipient's devices — skipping anyone who disabled this type or is
 * currently inside their quiet hours. Never throws: a notification failure
 * must not break the action that triggered it (creating a post, adding a
 * comment, etc).
 *
 * Runs on the service-role client: every read/write here targets recipient
 * rows, not the caller's own (notification_preferences, notifications,
 * push_subscriptions), which per-user RLS policies won't allow. The
 * recipient list is already trusted by the time it gets here — always
 * computed from a baby-scoped membership query (getVisibleUserIds,
 * getBabyAdminIds, getAllBabyMemberIds) by the caller.
 */
export async function notifyUsers(
  babyId: string,
  type: Enums<'notification_type'>,
  content: { title: string; body: string; url?: string },
  targetUserIds: string[]
) {
  const contextLogger = logger.child({ function: notifyUsers.name, babyId, type, targetCount: targetUserIds.length })
  if (targetUserIds.length === 0) return

  try {
    const supabase = createAdminClient()

    const { data: disabled } = await supabase
      .from('notification_preferences')
      .select('user_id')
      .eq('baby_id', babyId)
      .eq('notification_type', type)
      .in('user_id', targetUserIds)

    const disabledIds = new Set((disabled ?? []).map((row) => row.user_id))
    const recipientIds = targetUserIds.filter((id) => !disabledIds.has(id))
    if (recipientIds.length === 0) return

    const { error: insertError } = await supabase
      .from('notifications')
      .insert(recipientIds.map((userId) => ({
        user_id: userId,
        baby_id: babyId,
        notification_type: type,
        title: content.title,
        body: content.body,
        url: content.url,
      })))

    if (insertError) contextLogger.error(insertError, "Error writing notification inbox rows")

    const { data: settings } = await supabase
      .from('notification_settings')
      .select('user_id, quiet_hours_start, quiet_hours_end')
      .in('user_id', recipientIds)

    const now = currentTimeInParis()
    const quietUserIds = new Set(
      (settings ?? [])
        .filter((row) => isInQuietHours(now, row.quiet_hours_start, row.quiet_hours_end))
        .map((row) => row.user_id)
    )
    const pushRecipientIds = recipientIds.filter((id) => !quietUserIds.has(id))
    if (pushRecipientIds.length === 0) return

    const { data: devices } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .in('user_id', pushRecipientIds)

    if (!devices || devices.length === 0) return

    ensureVapidConfigured()
    const payload = JSON.stringify({ title: content.title, body: content.body, url: content.url, tag: type })

    await Promise.all(devices.map(async (device) => {
      try {
        await webpush.sendNotification(device.subscription as webpush.PushSubscription, payload)
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', device.id)
        } else {
          contextLogger.error(err, "Error sending push to device")
        }
      }
    }))
  } catch (err) {
    contextLogger.error(err, "notifyUsers failed")
  }
}
