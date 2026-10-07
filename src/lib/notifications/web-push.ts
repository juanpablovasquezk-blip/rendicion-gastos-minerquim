import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  data?: Record<string, unknown>;
}

interface SubscriptionRecord {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:admin@minerquim.cl";

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

/**
 * Envía una notificación Web Push a todas las suscripciones registradas del usuario
 */
export async function sendWebPushNotification(userId: string, payload: PushPayload): Promise<void> {
  if (!publicKey || !privateKey) {
    // VAPID keys no configuradas en .env
    return;
  }

  const sbAdmin = createAdminClient();
  const { data: subscriptions, error } = await sbAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error || !subscriptions || subscriptions.length === 0) {
    return;
  }

  const pushBody = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icons/icon-192x192.png",
    badge: "/brand/app-icon.png",
    url: payload.url || "/dashboard",
    data: payload.data || {},
  });

  const deadSubscriptionIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub: SubscriptionRecord) => {
      try {
        const pushConfig = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };
        await webpush.sendNotification(pushConfig, pushBody);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        // Si el endpoint expiró o fue desuscrito (404 o 410), marcar para eliminar
        if (status === 404 || status === 410) {
          deadSubscriptionIds.push(sub.id);
        } else {
          console.error("Error enviando Web Push a endpoint:", sub.endpoint, err);
        }
      }
    })
  );

  // Limpiar suscripciones inválidas
  if (deadSubscriptionIds.length > 0) {
    await sbAdmin
      .from("push_subscriptions")
      .delete()
      .in("id", deadSubscriptionIds);
  }
}
