"use server";
import webpush from 'web-push';
import { createClient } from '@utils/supabase/server';

webpush.setVapidDetails(
  'mailto:bergmann.baptiste@gmail.com', // Your admin email
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function notifyFamily(title: string, body: string, url: string) {
  const supabase = await createClient();

  // Fetch all subscriptions for your family members
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('subscription');

  if (!subscriptions) return;

  const payload = JSON.stringify({ title, body, url });

  // Send the push notification to every saved device
  const pushPromises = subscriptions.map((sub) =>
    webpush.sendNotification(sub.subscription as webpush.PushSubscription, payload)
      .catch((error) => {
        // If a device is inactive, the push service returns an error
        // You can handle deleting stale subscriptions here
        console.error("Error sending push to device:", error);
      })
  );

  await Promise.all(pushPromises);
}



export async function subscribeUser(sub: PushSubscription) {
  const supabase = await createClient()

  // 1. Récupérer l'utilisateur connecté
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')

  // 2. Sauvegarder dans Supabase (Upsert si l'abonnement existe déjà pour cet utilisateur)
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: user.id,
      subscription: sub,
    })

  if (error) throw error
  return { success: true }
}

export async function unsubscribeUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Supprimer l'abonnement en base
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)

  return { success: true }
}

export async function sendNotification(message: string, targetUserId?: string) {
  // 1. Récupérer l'abonnement depuis la base de données
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  if (!targetUserId) targetUserId = user.id


  const { data: subData } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', targetUserId)
    .single()

  if (!subData) {
    throw new Error('Aucun abonnement trouvé pour cet utilisateur')
  }

  // 2. Envoyer la notification via web-push
  try {
    await webpush.sendNotification(
      subData.subscription,
      JSON.stringify({
        title: 'Le petit monde',
        body: message,
        icon: '/favicon-96x96.png',
      })
    )
    return { success: true }
  } catch (error) {
    console.error('Erreur notification:', error)
    return { success: false }
  }
}
