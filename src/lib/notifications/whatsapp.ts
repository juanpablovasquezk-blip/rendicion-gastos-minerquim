/**
 * Helper para notificaciones de WhatsApp vía UltraMsg API
 * Se activa si están presentes ULTRAMSG_INSTANCE_ID y ULTRAMSG_TOKEN en las variables de entorno
 */
export async function sendWhatsAppNotification(toPhone: string, message: string): Promise<{ success: boolean; error?: string }> {
  const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
  const token = process.env.ULTRAMSG_TOKEN;

  if (!instanceId || !token || !toPhone) {
    return { success: false, error: "UltraMsg no configurado o teléfono faltante" };
  }

  // Limpiar número a solo dígitos
  let cleanPhone = toPhone.replace(/[^0-9]/g, "");

  // Si tiene 9 dígitos y empieza con 9 (número celular chileno típico), anteponer código país 56
  if (cleanPhone.length === 9 && cleanPhone.startsWith("9")) {
    cleanPhone = `56${cleanPhone}`;
  }

  // Si tiene 8 dígitos (fijo), anteponer 56
  if (cleanPhone.length === 8) {
    cleanPhone = `56${cleanPhone}`;
  }

  try {
    const params = new URLSearchParams({
      token,
      to: cleanPhone,
      body: message,
    });

    const res = await fetch(`https://api.ultramsg.com/${instanceId}/messages/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("UltraMsg API error:", res.status, errText);
      return { success: false, error: errText };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Error conectando con UltraMsg:", msg);
    return { success: false, error: msg };
  }
}
