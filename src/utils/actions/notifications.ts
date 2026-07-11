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



let subscription: PushSubscription | null = null

export async function subscribeUser(sub: PushSubscription) {
  subscription = sub
  // In a production environment, you would want to store the subscription in a database
  // For example: await db.subscriptions.create({ data: sub })
  return { success: true }
}

export async function unsubscribeUser() {
  subscription = null
  // In a production environment, you would want to remove the subscription from the database
  // For example: await db.subscriptions.delete({ where: { ... } })
  return { success: true }
}

export async function sendNotification(message: string) {
  if (!subscription) {
    throw new Error('No subscription available')
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: 'Test Notification',
        body: message,
        icon: '/icon.png',
      })
    )
    return { success: true }
  } catch (error) {
    console.error('Error sending push notification:', error)
    return { success: false, error: 'Failed to send notification' }
  }
}
