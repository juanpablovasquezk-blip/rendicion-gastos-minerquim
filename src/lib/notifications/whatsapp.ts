/**
 * Helper para notificaciones de WhatsApp vía UltraMsg API
 * Se activa si están presentes ULTRAMSG_INSTANCE_ID y ULTRAMSG_TOKEN en .env.local
 */
export async function sendWhatsAppNotification(toPhone: string, message: string) {
  const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
  const token = process.env.ULTRAMSG_TOKEN;

  if (!instanceId || !token || !toPhone) {
    return; // No configurado o sin teléfono de destino
  }

  // Limpiar número a formato internacional (ej: +56912345678 -> 56912345678)
  const cleanPhone = toPhone.replace(/[^0-9]/g, "");

  try {
    const params = new URLSearchParams({
      token,
      to: cleanPhone,
      body: message,
    });

    await fetch(`https://api.ultramsg.com/${instanceId}/messages/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (err) {
    console.error("Error enviando notificación UltraMsg:", err);
  }
}
