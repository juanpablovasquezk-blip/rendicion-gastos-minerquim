import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppNotification } from "./whatsapp";
import { sendWebPushNotification } from "./web-push";
import type { UserRole } from "@/lib/roles";

export type NotificationChannel = "in_app" | "whatsapp" | "push";

export interface SendNotificationOptions {
  userId: string;
  title: string;
  message: string;
  type?:
    | "fund_requested"
    | "fund_approved"
    | "fund_deposited"
    | "fund_rejected"
    | "expense_submitted"
    | "expense_approved"
    | "expense_rejected"
    | "general";
  link?: string;
  metadata?: Record<string, unknown>;
  channels?: NotificationChannel[];
}

/**
 * Envía una notificación multicanal (In-App, WhatsApp, Web Push) a un usuario
 */
export async function sendNotification({
  userId,
  title,
  message,
  type = "general",
  link = "/dashboard",
  metadata = {},
  channels = ["in_app", "whatsapp", "push"],
}: SendNotificationOptions): Promise<void> {
  const sbAdmin = createAdminClient();

  // 1. In-App Notification (Guardar en base de datos)
  if (channels.includes("in_app")) {
    try {
      const { error } = await sbAdmin.from("notifications").insert({
        user_id: userId,
        title,
        message,
        type,
        link,
        metadata,
      });
      if (error) {
        console.error("[Notification Service] Error guardando In-App:", error);
      }
    } catch (err) {
      console.error("[Notification Service] Excepción In-App:", err);
    }
  }

  // 2. WhatsApp Notification (si el usuario tiene teléfono configurado)
  if (channels.includes("whatsapp")) {
    try {
      const { data: profile, error: profErr } = await sbAdmin
        .from("profiles")
        .select("phone, full_name, email")
        .eq("id", userId)
        .single();

      if (profErr) {
        console.error("[Notification Service] Error buscando perfil:", profErr);
      } else if (profile?.phone) {
        console.log(`[Notification Service] Enviando WhatsApp a ${profile.full_name} (${profile.phone})`);
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://rendicion-minerquim.cl").replace(/\/+$/, "");
        const whatsappMsg = `🔔 *Minerquim Rendiciones*\n\n*${title}*\n${message}\n\n👉 Ver en plataforma: ${appUrl}${link}`;
        await sendWhatsAppNotification(profile.phone, whatsappMsg);
      } else {
        console.log(`[Notification Service] El usuario ${profile?.full_name || profile?.email || userId} no tiene teléfono en su perfil.`);
      }
    } catch (err) {
      console.error("[Notification Service] Error despachando WhatsApp:", err);
    }
  }

  // 3. Web Push (PWA)
  if (channels.includes("push")) {
    try {
      await sendWebPushNotification(userId, {
        title,
        body: message,
        url: link,
        data: { type, ...metadata },
      });
    } catch (err) {
      console.error("[Notification Service] Error despachando Web Push:", err);
    }
  }
}

/**
 * Notifica a una lista de usuarios simultáneamente
 */
export async function notifyUsers(
  userIds: string[],
  options: Omit<SendNotificationOptions, "userId">
): Promise<void> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  console.log(`[Notification Service] Notificando a ${uniqueIds.length} usuario(s):`, uniqueIds);
  await Promise.allSettled(
    uniqueIds.map((userId) =>
      sendNotification({
        userId,
        ...options,
      })
    )
  );
}

/**
 * Notifica a todos los usuarios con un determinado rol (ej: administradores, gerencia general, jefaturas)
 */
export async function notifyRole(
  roles: UserRole | UserRole[],
  options: Omit<SendNotificationOptions, "userId">
): Promise<void> {
  const roleList = Array.isArray(roles) ? roles : [roles];
  const sbAdmin = createAdminClient();

  const { data: users, error } = await sbAdmin
    .from("profiles")
    .select("id, full_name, role, phone")
    .in("role", roleList)
    .eq("is_active", true);

  if (error) {
    console.error("[Notification Service] Error consultando roles:", error);
    return;
  }

  if (!users || users.length === 0) {
    console.warn(`[Notification Service] No se encontraron usuarios activos con rol(es): ${roleList.join(", ")}`);
    return;
  }

  console.log(`[Notification Service] Usuarios activos con roles [${roleList.join(", ")}]:`, users.map((u: { full_name: string; phone?: string | null }) => `${u.full_name} (tel: ${u.phone || 'sin tel'})`));

  const userIds = users.map((u: { id: string }) => u.id);
  await notifyUsers(userIds, options);
}
