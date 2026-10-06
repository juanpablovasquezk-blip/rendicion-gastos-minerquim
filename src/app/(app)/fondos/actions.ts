"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

  const company_id = str(f, "company_id");
  const purpose = str(f, "purpose");
  const requested_amount = money(f, "requested_amount");

  if (!company_id) fail("/fondos", "Selecciona la empresa destinataria.");
  if (!purpose || purpose.length < 5) fail("/fondos", "Ingresa un motivo detallado (mínimo 5 caracteres).");
  if (!requested_amount || requested_amount <= 0) fail("/fondos", "Ingresa un monto válido.");

  const sb = await createClient();

  const { error } = await sb.from("cash_advances").insert({
    user_id: profile.id,
    company_id,
    purpose,
    requested_amount,
  });

  if (error) {
    if (error.code === "42501") {
      fail("/fondos", "No tienes permisos para solicitar fondos a nombre de esa empresa.");
    }
    fail("/fondos", `Error al crear la solicitud: ${error.message}`);
  }

  revalidatePath("/fondos");
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
