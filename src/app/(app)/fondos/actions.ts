"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendNotification, notifyRole } from "@/lib/notifications/service";
import { formatClp } from "@/lib/format";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (f: FormData, k: string) => {
  const d = str(f, k).replace(/\D/g, "");
  return d ? Number(d) : null;
};

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

/** Solicitar un nuevo fondo por rendir */
export async function requestFund(f: FormData) {
  const profile = await requireRole();
  if (profile.role === "general_manager") {
    fail("/fondos", "El rol de Gerencia General no está habilitado para solicitar fondos personales.");
  }

  const purpose = str(f, "purpose");
  const requested_amount = money(f, "requested_amount");

  if (!purpose || purpose.length < 5) fail("/fondos", "Ingresa un motivo detallado (mínimo 5 caracteres).");
  if (!requested_amount || requested_amount <= 0) fail("/fondos", "Ingresa un monto válido.");

  const sb = await createClient();

  const { error } = await sb.from("cash_advances").insert({
    user_id: profile.id,
    purpose,
    requested_amount,
  });

  if (error) {
    fail("/fondos", `Error al crear la solicitud: ${error.message}`);
  }

  const isApproverRole = profile.role === "admin" || profile.role === "manager";

  // 1. Notificar al solicitante (In-App)
  try {
    await sendNotification({
      userId: profile.id,
      title: "Solicitud de Fondo Enviada",
      message: isApproverRole
        ? `Tu solicitud por ${formatClp(requested_amount)} ("${purpose}") fue enviada directamente a Gerencia General para transferencia.`
        : `Tu solicitud por ${formatClp(requested_amount)} ("${purpose}") fue enviada a revisión de Operaciones.`,
      type: isApproverRole ? "fund_approved" : "fund_requested",
      link: "/fondos",
      channels: ["in_app"],
    });
  } catch (err) {
    console.error("Error notificando al solicitante:", err);
  }

  // 2. Notificar al aprobador correspondiente
  try {
    if (isApproverRole) {
      // Pasa directo a Gerencia General
      await notifyRole("general_manager", {
        title: "Solicitud de Fondo de Gerencia",
        message: `${profile.full_name} ha solicitado un fondo de ${formatClp(requested_amount)} para "${purpose}". Pendiente de transferencia y comprobante.`,
        type: "fund_approved",
        link: "/aprobaciones",
      });
    } else {
      // Pasa a revisión de Operaciones/Managers
      await notifyRole(
        ["admin", "manager"],
        {
          title: "Nueva Solicitud de Fondo",
          message: `${profile.full_name} ha solicitado un fondo por ${formatClp(requested_amount)} para "${purpose}".`,
          type: "fund_requested",
          link: "/aprobaciones",
        },
        profile.id
      );
    }
  } catch (err) {
    console.error("Error notificando solicitud de fondo:", err);
  }

  revalidatePath("/fondos");
  revalidatePath("/aprobaciones");
  redirect("/fondos?success=solicitud_creada");
}

/** Cancelar solicitud de fondo (solo si está en 'requested') */
export async function cancelFund(f: FormData) {
  const profile = await requireRole();
  const id = str(f, "id");
  if (!id) fail("/fondos", "ID de fondo inválido.");

  const sb = await createClient();
  const { error } = await sb
    .from("cash_advances")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", profile.id)
    .eq("status", "requested");

  if (error) {
    fail("/fondos", `No se pudo cancelar la solicitud: ${error.message}`);
  }

  revalidatePath("/fondos");
  redirect("/fondos?success=solicitud_cancelada");
}
