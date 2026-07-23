"use server";
import webpush, { ensureVapidConfigured } from '@utils/webpush';
import { createClient } from '@utils/supabase/server';
import { Enums } from '@utils/supabase/database.types'
import { logger } from '../logger'

export async function subscribeUser(sub: PushSubscription, deviceLabel?: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: subscribeUser.name })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')

  // onConflict on `endpoint` (not `user_id`): a user can have several
  // devices, so re-subscribing the same browser must update its row in
  // place instead of piling up duplicates.
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: user.id,
      subscription: sub,
      endpoint: sub.endpoint,
      device_label: deviceLabel ?? null,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' })

  if (error) { contextLogger.error(error, "Error subscribing to push"); throw error }
  return { success: true }
}

export async function unsubscribeUser(endpoint: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: unsubscribeUser.name })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id)

  if (error) { contextLogger.error(error, "Error unsubscribing from push"); throw error }
  return { success: true }
}

export async function getMyDevices() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, device_label, created_at, last_seen_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) { logger.child({ function: getMyDevices.name }).error(error, "Error fetching devices"); return [] }
  return data
}

export async function removeDevice(subscriptionId: number) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: removeDevice.name, subscriptionId })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('id', subscriptionId)
    .eq('user_id', user.id)

  if (error) { contextLogger.error(error, "Error removing device"); throw error }
  return { success: true }
}

export async function renameDevice(subscriptionId: number, label: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: renameDevice.name, subscriptionId })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const { error } = await supabase
    .from('push_subscriptions')
    .update({ device_label: label })
    .eq('id', subscriptionId)
    .eq('user_id', user.id)

  if (error) { contextLogger.error(error, "Error renaming device"); throw error }
  return { success: true }
}

// Sparse opt-out model: a row present here means the type is disabled.
// Absence of a row means enabled — so new notification types default to
// "on" for everyone without a backfill migration.
export async function getDisabledNotificationTypes(babyId: string): Promise<Enums<'notification_type'>[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('notification_type')
    .eq('user_id', user.id)
    .eq('baby_id', babyId)

  if (error) {
    logger.child({ function: getDisabledNotificationTypes.name, babyId }).error(error, "Error fetching notification preferences")
    return []
  }
  return data.map((row) => row.notification_type)
}

export async function setNotificationPreference(babyId: string, type: Enums<'notification_type'>, enabled: boolean) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: setNotificationPreference.name, babyId, type, enabled })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  if (enabled) {
    const { error } = await supabase
      .from('notification_preferences')
      .delete()
      .eq('user_id', user.id)
      .eq('baby_id', babyId)
      .eq('notification_type', type)

    if (error) { contextLogger.error(error, "Error enabling notification type"); throw error }
  } else {
    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        { user_id: user.id, baby_id: babyId, notification_type: type },
        { onConflict: 'user_id,baby_id,notification_type' }
      )

    if (error) { contextLogger.error(error, "Error disabling notification type"); throw error }
  }

  return { success: true }
}

export async function getQuietHours() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('notification_settings')
    .select('quiet_hours_start, quiet_hours_end')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    logger.child({ function: getQuietHours.name }).error(error, "Error fetching quiet hours")
    return null
  }
  return data
}

export async function setQuietHours(start: string | null, end: string | null) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: setQuietHours.name })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const { error } = await supabase
    .from('notification_settings')
    .upsert(
      { user_id: user.id, quiet_hours_start: start, quiet_hours_end: end },
      { onConflict: 'user_id' }
    )

  if (error) { contextLogger.error(error, "Error setting quiet hours"); throw error }
  return { success: true }
}

export async function getMyNotifications(limit: number = 20) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    logger.child({ function: getMyNotifications.name }).error(error, "Error fetching notifications")
    return []
  }
  return data
}

export async function getUnreadNotificationCount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null)

  if (error) {
    logger.child({ function: getUnreadNotificationCount.name }).error(error, "Error counting unread notifications")
    return 0
  }
  return count ?? 0
}

export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', user.id)

  if (error) { logger.child({ function: markNotificationRead.name }).error(error, "Error marking notification read"); throw error }
  return { success: true }
}

export async function markAllNotificationsRead(babyId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('baby_id', babyId)
    .is('read_at', null)

  if (error) { logger.child({ function: markAllNotificationsRead.name }).error(error, "Error marking all notifications read"); throw error }
  return { success: true }
}

export async function sendNotification(message: string, targetUserId?: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: sendNotification.name })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  if (!targetUserId) targetUserId = user.id

  if (targetUserId !== user.id) {
    const { data: targetBabies } = await supabase
      .from('baby_access')
      .select('baby_id')
      .eq('user_id', targetUserId)

    const targetBabyIds = (targetBabies ?? []).map((row) => row.baby_id)

    const { data: sharedAdminBaby } = targetBabyIds.length > 0
      ? await supabase
        .from('baby_access')
        .select('baby_id')
        .eq('user_id', user.id)
        .eq('access_level', 'admin')
        .in('baby_id', targetBabyIds)
        .limit(1)
        .maybeSingle()
      : { data: null }

    if (!sharedAdminBaby) {
      contextLogger.warn({ targetUserId }, "Non-admin attempted to send a notification to another user")
      throw new Error("Non autorisé")
    }
  }

  const { data: devices } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', targetUserId)

  if (!devices || devices.length === 0) {
    throw new Error('Aucun abonnement trouvé pour cet utilisateur')
  }

  const payload = JSON.stringify({
    title: 'Le petit monde',
    body: message,
    icon: '/favicon-96x96.png',
  })

  ensureVapidConfigured()
  const results = await Promise.allSettled(
    devices.map((device) => webpush.sendNotification(device.subscription as webpush.PushSubscription, payload))
  )

  const failures = results.filter((r) => r.status === 'rejected')
  if (failures.length > 0) {
    contextLogger.error({ failures: failures.length, total: devices.length }, "Some devices failed to receive the push")
  }

  return { success: failures.length < devices.length }
}
