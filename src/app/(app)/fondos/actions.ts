"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Verificar si el colaborador tiene saldo a favor de la empresa acumulado (crédito remanente)
  const { data: userProfile } = await sb
    .from("profiles")
    .select("credit_balance")
    .eq("id", profile.id)
    .single();

  // Verificar si el colaborador tiene reembolsos aprobados pendientes de pago para incluirlos en la transferencia
  const { data: approvedReimbursements } = await sb
    .from("expense_reports")
    .select("id, total_amount, title")
    .eq("user_id", profile.id)
    .eq("report_type", "reimbursement")
    .eq("status", "approved");

  const reimbursementsBonus = (approvedReimbursements || []).reduce(
    (acc, r) => acc + Number(r.total_amount || 0),
    0
  );
  const linkedReimbursementIds = (approvedReimbursements || []).map((r) => r.id);

  const creditBalance = Number(userProfile?.credit_balance || 0);
  const appliedCredit = Math.min(creditBalance, requested_amount);
  const netDepositAmount = requested_amount - appliedCredit + reimbursementsBonus;

  let { data: newFund, error } = await sb
    .from("cash_advances")
    .insert({
      user_id: profile.id,
      purpose,
      requested_amount,
      approved_amount: requested_amount,
      applied_credit: appliedCredit,
      reimbursements_bonus: reimbursementsBonus,
      linked_reimbursement_ids: linkedReimbursementIds,
      net_deposit_amount: netDepositAmount,
    })
    .select("id")
    .single();

  if (error) {
    // Fallback a campos estándar si la base de datos remota aún no ha aplicado las columnas opcionales
    const retry = await sb
      .from("cash_advances")
      .insert({
        user_id: profile.id,
        purpose,
        requested_amount,
      })
      .select("id")
      .single();

    if (retry.error) {
      fail("/fondos", `Error al crear la solicitud: ${retry.error.message}`);
    }
    newFund = retry.data;
  }

  // Si se aplicó crédito remanente, descontarlo del perfil
  if (appliedCredit > 0) {
    await sb
      .from("profiles")
      .update({ credit_balance: creditBalance - appliedCredit })
      .eq("id", profile.id);
  }

  const isApproverRole = profile.role === "admin" || profile.role === "manager";

  // Construir nota informativa
  let detailNote = "";
  if (reimbursementsBonus > 0 && appliedCredit > 0) {
    detailNote = ` (Incluye +${formatClp(reimbursementsBonus)} de reembolsos pendientes y -${formatClp(appliedCredit)} de saldo anterior. Total a transferir: ${formatClp(netDepositAmount)}).`;
  } else if (reimbursementsBonus > 0) {
    detailNote = ` (Incluye +${formatClp(reimbursementsBonus)} de reembolsos pendientes. Total a transferir: ${formatClp(netDepositAmount)}).`;
  } else if (appliedCredit > 0) {
    detailNote = ` (Se abonaron ${formatClp(appliedCredit)} de saldo anterior. Total a transferir: ${formatClp(netDepositAmount)}).`;
  }

  // 1. Notificar al solicitante (In-App)
  try {
    await sendNotification({
      userId: profile.id,
      title: "Solicitud de Fondo Enviada",
      message: isApproverRole
        ? `Tu solicitud por ${formatClp(requested_amount)} ("${purpose}") fue enviada directamente a Gerencia General para transferencia${detailNote}.`
        : `Tu solicitud por ${formatClp(requested_amount)} ("${purpose}") fue enviada a revisión de Operaciones${detailNote}.`,
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
        message: `${profile.full_name} ha solicitado un fondo de ${formatClp(requested_amount)} para "${purpose}".${detailNote}`,
        type: "fund_approved",
        link: "/aprobaciones",
      });
    } else {
      // Pasa a revisión de Operaciones/Managers
      await notifyRole(
        ["admin", "manager"],
        {
          title: "Nueva Solicitud de Fondo",
          message: `${profile.full_name} ha solicitado un fondo por ${formatClp(requested_amount)} para "${purpose}".${detailNote}`,
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

export type CloseFundResult = {
  success: boolean;
  error?: string;
};

/**
 * Cierre definitivo y liquidación de un fondo activo
 * - Si saldo < 0: Crea reembolso a favor del colaborador directo a Gerencia General.
 * - Si saldo > 0: Netea con reembolsos pendientes y abona remanente como crédito o devolución.
 * - Si saldo == 0: Cierra y archiva el fondo.
 */
export async function closeFundAction(f: FormData): Promise<CloseFundResult> {
  try {
    const profile = await requireRole();
    const fundId = str(f, "fund_id");
    const resolutionMode = str(f, "resolution_mode") || "net_and_credit";

    if (!fundId) return { success: false, error: "ID de fondo inválido." };

    const sb = await createClient();

    // 1. Obtener fondo activo
    const { data: fund, error: fundErr } = await sb
      .from("cash_advances")
      .select("*, user_profile:user_id(id, full_name, email)")
      .eq("id", fundId)
      .single();

    if (fundErr || !fund) {
      return { success: false, error: "No se encontró el fondo a cerrar." };
    }

    if (fund.status !== "active") {
      return { success: false, error: "Solo se pueden cerrar fondos que estén en estado Activo." };
    }

    // Permisos: titular del fondo o gerencia/admin
    const isOwner = profile.id === fund.user_id;
    const isManagement = ["admin", "general_manager", "manager"].includes(profile.role);
    if (!isOwner && !isManagement) {
      return { success: false, error: "No tienes autorización para cerrar este fondo." };
    }

    const balance = Number(fund.current_balance || 0);
    const adminSb = createAdminClient();

    // =========================================================================
    // CASO 1: SALDO NEGATIVO (El colaborador gastó más de lo entregado)
    // =========================================================================
    if (balance < 0) {
      const deficit = Math.abs(balance);

      // 1. Crear informe de reembolso a favor del colaborador listo para pago por GM
      const { data: reimbursementReport, error: repErr } = await adminSb
        .from("expense_reports")
        .insert({
          user_id: fund.user_id,
          title: `Reembolso por Excedente de Fondo (${fund.purpose})`,
          report_type: "reimbursement",
          status: "approved",
          approval_stage: "done",
          total_amount: deficit,
          approved_amount: deficit,
          submitted_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (repErr || !reimbursementReport) {
        return { success: false, error: `Error creando reembolso por excedente: ${repErr?.message}` };
      }

      // Buscar configuración de empresa y área de referencia para el gasto
      const { data: sampleExp } = await adminSb
        .from("expenses")
        .select("company_id, department_id, category_id, receipt_type_id")
        .eq("user_id", fund.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: defaultCompany } = await adminSb.from("companies").select("id").limit(1).single();
      const { data: defaultDept } = await adminSb.from("departments").select("id").limit(1).single();
      const { data: defaultCat } = await adminSb.from("categories").select("id").limit(1).single();
      const { data: defaultReceiptType } = await adminSb.from("receipt_types").select("id").limit(1).single();

      // 2. Insertar gasto aprobado asociado
      await adminSb.from("expenses").insert({
        report_id: reimbursementReport.id,
        user_id: fund.user_id,
        company_id: sampleExp?.company_id || defaultCompany?.id,
        department_id: sampleExp?.department_id || defaultDept?.id,
        category_id: sampleExp?.category_id || defaultCat?.id,
        receipt_type_id: sampleExp?.receipt_type_id || defaultReceiptType?.id,
        date: new Date().toISOString().split("T")[0],
        supplier_name: "Liquidación por Cierre de Fondo",
        description: `Excedente de gastos rendidos sobre fondo entregado (${fund.purpose})`,
        total_amount: deficit,
        tax_amount: 0,
        has_receipt: true,
        status: "approved",
      });

      // 3. Forzar aprobación y total exacto en el informe
      await adminSb
        .from("expense_reports")
        .update({
          status: "approved",
          approval_stage: "done",
          total_amount: deficit,
          approved_amount: deficit,
        })
        .eq("id", reimbursementReport.id);

      // 4. Cerrar el fondo
      const { error: closeErr } = await adminSb
        .from("cash_advances")
        .update({ status: "closed" })
        .eq("id", fundId);

      if (closeErr) {
        return { success: false, error: `Error cerrando fondo: ${closeErr.message}` };
      }

      // Registrar historial de auditoría
      await adminSb.from("approval_history").insert({
        fund_id: fundId,
        subject_user_id: fund.user_id,
        approver_id: profile.id,
        action: "settled",
        comments: `Fondo cerrado con saldo negativo de ${formatClp(deficit)}. Se generó automáticamente un reembolso aprobado por ${formatClp(deficit)} directo a Gerencia General para su pago.`,
      });

      // Notificar a Gerencia General para que proceda con el pago del reembolso
      try {
        await notifyRole("general_manager", {
          title: "Reembolso por Cierre de Fondo",
          message: `${fund.user_profile?.full_name || profile.full_name} cerró el fondo "${fund.purpose}" con un saldo a su favor de ${formatClp(deficit)}. Reembolso disponible para pago.`,
          type: "expense_approved",
          link: "/aprobaciones?tab=rendiciones",
        });
      } catch (err) {
        console.error("Error notificando reembolso a GM:", err);
      }
    }
    // =========================================================================
    // CASO 2: SALDO POSITIVO (Quedó dinero sobrante a favor de la empresa)
    // =========================================================================
    else if (balance > 0) {
      let remaining = balance;
      let nettedAmount = 0;

      // 1. Buscar si el colaborador tiene reembolsos pendientes a su favor para netear
      const { data: userReimbursements } = await adminSb
        .from("expense_reports")
        .select("id, title, total_amount, status")
        .eq("user_id", fund.user_id)
        .eq("report_type", "reimbursement")
        .in("status", ["submitted", "partially_approved", "approved"])
        .order("created_at", { ascending: true });

      for (const r of userReimbursements || []) {
        const rAmount = Number(r.total_amount || 0);
        if (remaining >= rAmount && rAmount > 0) {
          // Liquidar el reembolso automáticamente
          await adminSb
            .from("expense_reports")
            .update({ status: "settled", approval_stage: "done" })
            .eq("id", r.id);

          await adminSb.from("approval_history").insert({
            report_id: r.id,
            subject_user_id: fund.user_id,
            approver_id: profile.id,
            action: "settled",
            comments: `Reembolso liquidado y saldado automáticamente mediante neteo con saldo remanente (${formatClp(rAmount)}) del fondo "${fund.purpose}".`,
          });

          remaining -= rAmount;
          nettedAmount += rAmount;
        }
      }

      // 2. Si todavía queda remanente a favor de la empresa tras netear
      if (remaining > 0) {
        if (resolutionMode === "net_and_credit") {
          // Guardar como crédito remanente para la próxima solicitud de fondo
          const { data: p } = await adminSb
            .from("profiles")
            .select("credit_balance")
            .eq("id", fund.user_id)
            .single();

          const currentCredit = Number(p?.credit_balance || 0);
          await adminSb
            .from("profiles")
            .update({ credit_balance: currentCredit + remaining })
            .eq("id", fund.user_id);
        }
      }

      // 3. Cerrar el fondo
      const { error: closeErr } = await adminSb
        .from("cash_advances")
        .update({ status: "closed" })
        .eq("id", fundId);

      if (closeErr) {
        return { success: false, error: `Error cerrando fondo: ${closeErr.message}` };
      }

      // Registrar auditoría
      const modeText =
        remaining > 0
          ? resolutionMode === "net_and_credit"
            ? `Remanente final (${formatClp(remaining)}) abonado como crédito para su próximo fondo.`
            : `Remanente final (${formatClp(remaining)}) devuelto a la empresa.`
          : "";

      await sb.from("approval_history").insert({
        fund_id: fundId,
        subject_user_id: fund.user_id,
        approver_id: profile.id,
        action: "settled",
        comments: `Fondo cerrado con saldo a favor de ${formatClp(balance)}. Neteado con reembolsos pendientes: ${formatClp(nettedAmount)}. ${modeText}`,
      });
    }
    // =========================================================================
    // CASO 3: SALDO EXACTO $0
    // =========================================================================
    else {
      const { error: closeErr } = await sb
        .from("cash_advances")
        .update({ status: "closed" })
        .eq("id", fundId);

      if (closeErr) {
        return { success: false, error: `Error cerrando fondo: ${closeErr.message}` };
      }

      await sb.from("approval_history").insert({
        fund_id: fundId,
        subject_user_id: fund.user_id,
        approver_id: profile.id,
        action: "settled",
        comments: `Fondo cerrado y liquidado con saldo exacto $0.`,
      });
    }

    revalidatePath("/fondos");
    revalidatePath("/aprobaciones");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (err: any) {
    console.error("Error en closeFundAction:", err);
    return { success: false, error: err?.message || "Error inesperado al cerrar el fondo." };
  }
}
