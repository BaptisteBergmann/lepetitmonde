"use server";
import webpush from 'web-push';
import { createClient } from '@utils/supabase/server';
import { logger } from '../logger'

webpush.setVapidDetails(
  'mailto:bergmann.baptiste@gmail.com', // Your admin email
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

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

export async function sendNotification(message: string, targetUserId?: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: sendNotification.name })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  if (!targetUserId) targetUserId = user.id

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

  const results = await Promise.allSettled(
    devices.map((device) => webpush.sendNotification(device.subscription as webpush.PushSubscription, payload))
  )

  const failures = results.filter((r) => r.status === 'rejected')
  if (failures.length > 0) {
    contextLogger.error({ failures: failures.length, total: devices.length }, "Some devices failed to receive the push")
  }

  return { success: failures.length < devices.length }
}
