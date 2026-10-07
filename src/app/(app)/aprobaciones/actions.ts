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

export type ApprovalActionResult = {
  success: boolean;
  error?: string;
};

/* =========================================================================
   1. APROBACIÓN DE FONDOS POR RENDIR
   ========================================================================= */

/** Gerencia de Operaciones (Admin) aprueba la solicitud de fondo y la deriva a Gerencia General */
export async function approveFundByAdmin(f: FormData): Promise<ApprovalActionResult> {
  try {
    const profile = await requireRole("admin");
    const fundId = str(f, "fund_id");
    const approvedAmount = money(f, "approved_amount");
    const comments = str(f, "comments");

    if (!fundId) return { success: false, error: "ID de fondo inválido." };

    const sb = await createClient();

    // Obtener fondo actual
    const { data: fund, error: fundErr } = await sb
      .from("cash_advances")
      .select("requested_amount, user_id, status, approval_stage, purpose")
      .eq("id", fundId)
      .single();

    if (fundErr || !fund) return { success: false, error: "No se encontró el fondo solicitado." };
    if (fund.user_id === profile.id) {
      return { success: false, error: "No puedes auto-aprobar tu propia solicitud de fondos." };
    }

    const finalAmount = approvedAmount && approvedAmount > 0 ? approvedAmount : fund.requested_amount;

    // Actualizar fondo: aprobado por Operaciones, pasa a Gerencia General
    const { error } = await sb
      .from("cash_advances")
      .update({
        status: "approved",
        approval_stage: "general_manager",
        approved_amount: finalAmount,
      })
      .eq("id", fundId);

    if (error) {
      return { success: false, error: `Error al aprobar fondo: ${error.message}` };
    }

    // Registrar en historial
    await sb.from("approval_history").insert({
      fund_id: fundId,
      subject_user_id: fund.user_id,
      approver_id: profile.id,
      action: "approved",
      comments: comments || `Aprobado por Gerencia de Operaciones por ${formatClp(finalAmount)}`,
    });

    // 1. Notificar a Gerencia General para depósito bancario / entrega
    try {
      await notifyRole("general_manager", {
        title: "Fondo Aprobado por Operaciones",
        message: `Fondo por ${formatClp(finalAmount)} (${fund.purpose}) aprobado por Operaciones. Pendiente de entrega/transferencia.`,
        type: "fund_approved",
        link: "/aprobaciones",
      });
    } catch (err) {
      console.error("Error notificando a Gerencia General:", err);
    }

    // 2. Notificar al empleado solicitante
    try {
      await sendNotification({
        userId: fund.user_id,
        title: "Fondo Aprobado por Operaciones",
        message: `Tu solicitud de fondo por ${formatClp(finalAmount)} fue aprobada y derivada a Gerencia General para su entrega/transferencia.`,
        type: "fund_approved",
        link: "/fondos",
      });
    } catch (err) {
      console.error("Error notificando al colaborador:", err);
    }

    revalidatePath("/aprobaciones");
    revalidatePath("/fondos");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (err: any) {
    console.error("Error en approveFundByAdmin:", err);
    return { success: false, error: err?.message || "Error al aprobar el fondo." };
  }
}

/** Gerencia General (general_manager) registra el depósito bancario o entrega en efectivo y activa el fondo */
export async function depositFundByGM(f: FormData): Promise<ApprovalActionResult> {
  try {
    const profile = await requireRole("general_manager", "admin");
    const fundId = str(f, "fund_id");
    const paymentMethod = str(f, "payment_method") || "transfer"; // 'transfer' | 'cash'
    const depositNote = str(f, "deposit_note");
    const depositFile = f.get("deposit_file") as File | null;

    if (!fundId) return { success: false, error: "ID de fondo inválido." };

    const sb = await createClient();

    let fileName: string | null = null;

    // Si es transferencia, el comprobante es obligatorio. Si es efectivo, es opcional.
    if (paymentMethod === "transfer") {
      if (!depositFile || depositFile.size === 0) {
        return { success: false, error: "Debes adjuntar el comprobante o captura de la transferencia bancaria." };
      }
    }

    if (depositFile && depositFile.size > 0) {
      const fileExt = depositFile.name.split(".").pop() || "jpg";
      fileName = `${fundId}/${Date.now()}_comprobante.${fileExt}`;
      const bytes = await depositFile.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const { error: uploadErr } = await sb.storage
        .from("deposits")
        .upload(fileName, buffer, {
          contentType: depositFile.type || "image/jpeg",
          upsert: true,
        });

      if (uploadErr) {
        return { success: false, error: `Error al subir comprobante a Storage: ${uploadErr.message}` };
      }
    }

    // 2. Obtener fondo para saber monto, dueño y reembolsos vinculados
    const { data: fund, error: fundErr } = await sb
      .from("cash_advances")
      .select("approved_amount, requested_amount, user_id, purpose, reimbursements_bonus, linked_reimbursement_ids, net_deposit_amount")
      .eq("id", fundId)
      .single();

    if (fundErr || !fund) {
      return { success: false, error: "No se encontró la solicitud de fondo en la base de datos." };
    }

    const amountToActivate = fund.approved_amount || fund.requested_amount || 0;
    const bonusReimbursements = Number(fund.reimbursements_bonus || 0);
    const linkedReports = fund.linked_reimbursement_ids || [];

    // 3. Activar el fondo en la base de datos
    const { error } = await sb
      .from("cash_advances")
      .update({
        status: "active",
        approval_stage: "done",
        deposit_receipt_path: fileName,
        deposit_note: depositNote || (paymentMethod === "cash" ? "Entrega de dinero en efectivo" : null),
        initial_amount: amountToActivate,
        deposited_by: profile.id,
        deposited_at: new Date().toISOString(),
        date_assigned: new Date().toISOString().split("T")[0],
      })
      .eq("id", fundId);

    if (error) {
      return { success: false, error: `Error al activar fondo: ${error.message}` };
    }

    // 4. Si el fondo incluía pago conjunto de reembolsos pendientes, liquidar esos informes
    if (linkedReports.length > 0) {
      await sb
        .from("expense_reports")
        .update({
          status: "settled",
          approval_stage: "done",
        })
        .in("id", linkedReports);

      for (const repId of linkedReports) {
        await sb.from("approval_history").insert({
          report_id: repId,
          subject_user_id: fund.user_id,
          approver_id: profile.id,
          action: "settled",
          comments: `Reembolso pagado y cerrado conjuntamente en la transferencia del fondo "${fund.purpose}".`,
        });
      }
    }

    // Registrar en historial del fondo
    const methodLabel = paymentMethod === "cash" ? "Entrega en Efectivo" : "Transferencia Bancaria";
    const bonusNote =
      bonusReimbursements > 0
        ? ` Incluye pago conjunto de ${formatClp(bonusReimbursements)} por reembolsos aprobados.`
        : "";

    await sb.from("approval_history").insert({
      fund_id: fundId,
      subject_user_id: fund.user_id,
      approver_id: profile.id,
      action: "deposited",
      comments: `Fondo entregado y activado (${methodLabel}).${bonusNote} ${depositNote ? `Nota: ${depositNote}` : ""}`,
    });

    // Notificar al colaborador que los fondos fueron transferidos/entregados y están activos
    try {
      const actionDesc = paymentMethod === "cash" ? "la entrega de dinero en efectivo" : "la transferencia bancaria";
      const totalTransferred = Number(fund.net_deposit_amount || amountToActivate);
      const extraMsg =
        bonusReimbursements > 0
          ? ` (${formatClp(amountToActivate)} para el fondo + ${formatClp(bonusReimbursements)} de tus reembolsos pendientes). Tus reembolsos quedaron saldados y tu nuevo fondo está activo.`
          : ` para "${fund.purpose}". Ya puedes comenzar a rendir gastos.`;

      await sendNotification({
        userId: fund.user_id,
        title: "¡Fondo Entregado y Activo!",
        message: `Se ha registrado ${actionDesc} por ${formatClp(totalTransferred)}${extraMsg}`,
        type: "fund_deposited",
        link: "/fondos",
      });
    } catch (err) {
      console.error("Error notificando entrega de fondo al empleado:", err);
    }

    revalidatePath("/aprobaciones");
    revalidatePath("/fondos");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (err: any) {
    console.error("Error en depositFundByGM:", err);
    return { success: false, error: err?.message || "Error inesperado al activar el fondo." };
  }
}

/** Rechazar solicitud de fondo (por Operaciones o Gerencia General) */
export async function rejectFund(f: FormData): Promise<ApprovalActionResult> {
  try {
    const profile = await requireRole("admin", "general_manager");
    const fundId = str(f, "fund_id");
    const rejectionReason = str(f, "rejection_reason");

    if (!fundId) return { success: false, error: "ID de fondo inválido." };
    if (!rejectionReason || rejectionReason.length < 5) {
      return { success: false, error: "Debes ingresar un motivo claro de rechazo (mínimo 5 caracteres)." };
    }

    const sb = await createClient();

    const { data: fund } = await sb
      .from("cash_advances")
      .select("user_id, purpose")
      .eq("id", fundId)
      .single();

    const { error } = await sb
      .from("cash_advances")
      .update({
        status: "rejected",
        rejection_reason: rejectionReason,
      })
      .eq("id", fundId);

    if (error) {
      return { success: false, error: `Error al rechazar fondo: ${error.message}` };
    }

    if (fund) {
      await sb.from("approval_history").insert({
        fund_id: fundId,
        subject_user_id: fund.user_id,
        approver_id: profile.id,
        action: "rejected",
        comments: `Rechazado: ${rejectionReason}`,
      });

      // Notificar al colaborador sobre el rechazo
      try {
        await sendNotification({
          userId: fund.user_id,
          title: "Solicitud de Fondo Rechazada",
          message: `Tu solicitud de fondo para "${fund.purpose}" ha sido rechazada. Motivo: "${rejectionReason}".`,
          type: "fund_rejected",
          link: "/fondos",
        });
      } catch (err) {
        console.error("Error notificando rechazo de fondo:", err);
      }
    }

    revalidatePath("/aprobaciones");
    revalidatePath("/fondos");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (err: any) {
    console.error("Error en rejectFund:", err);
    return { success: false, error: err?.message || "Error al rechazar el fondo." };
  }
}

/* =========================================================================
   2. APROBACIÓN PARCIAL ÍTEM POR ÍTEM DE GASTOS
   ========================================================================= */

/** Aprobar un gasto individual dentro de un informe */
export async function approveExpenseItem(f: FormData): Promise<ApprovalActionResult> {
  try {
    await requireRole("admin", "general_manager", "manager");
    const expenseId = str(f, "expense_id");
    if (!expenseId) return { success: false, error: "ID de gasto inválido." };

    const sb = await createClient();
    const { error } = await sb
      .from("expenses")
      .update({
        status: "approved",
        rejection_reason: null,
      })
      .eq("id", expenseId);

    if (error) {
      return { success: false, error: `Error al aprobar gasto: ${error.message}` };
    }

    revalidatePath("/aprobaciones");
    revalidatePath("/gastos");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Error al aprobar el gasto." };
  }
}

/** Rechazar un gasto individual dentro de un informe con observación */
export async function rejectExpenseItem(f: FormData): Promise<ApprovalActionResult> {
  try {
    await requireRole("admin", "general_manager", "manager");
    const expenseId = str(f, "expense_id");
    const rejectionReason = str(f, "rejection_reason");

    if (!expenseId) return { success: false, error: "ID de gasto inválido." };
    if (!rejectionReason || rejectionReason.length < 5) {
      return { success: false, error: "Debes ingresar una observación o motivo para rechazar el ítem." };
    }

    const sb = await createClient();

    const { data: exp } = await sb
      .from("expenses")
      .select("user_id, description, total_amount")
      .eq("id", expenseId)
      .single();

    const { error } = await sb
      .from("expenses")
      .update({
        status: "rejected",
        rejection_reason: rejectionReason,
      })
      .eq("id", expenseId);

    if (error) {
      return { success: false, error: `Error al rechazar gasto: ${error.message}` };
    }

    if (exp) {
      try {
        await sendNotification({
          userId: exp.user_id,
          title: "Gasto Observado / Rechazado",
          message: `Un ítem por ${formatClp(exp.total_amount)} (${exp.description || "Gasto"}) fue observado. Motivo: "${rejectionReason}".`,
          type: "expense_rejected",
          link: "/gastos",
        });
      } catch (err) {
        console.error("Error notificando rechazo de gasto:", err);
      }
    }

    revalidatePath("/aprobaciones");
    revalidatePath("/gastos");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Error al rechazar el gasto." };
  }
}

/** Resolver y cerrar informe de rendición tras revisar los ítems */
export async function resolveReport(f: FormData): Promise<void> {
  const profile = await requireRole("admin", "general_manager");
  const reportId = str(f, "report_id");
  const action = str(f, "action"); // 'approve_all' | 'observe' | 'settle'
  const comments = str(f, "comments");

  if (!reportId) {
    redirect("/aprobaciones?error=ID%20de%20informe%20no%20v%C3%A1lido.");
  }

  const sb = await createClient();

  const { data: report } = await sb
    .from("expense_reports")
    .select("*, expenses(id, status)")
    .eq("id", reportId)
    .single();

  if (!report) {
    redirect("/aprobaciones?error=No%20se%20encontr%C3%B3%20el%20informe.");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (report.expenses || []) as any[];
  const hasRejected = items.some((e) => e.status === "rejected");
  const hasPending = items.some((e) => e.status === "pending");

  let newStatus = report.status;
  if (action === "approve_all") {
    if (hasPending) {
      await sb.from("expenses").update({ status: "approved" }).eq("report_id", reportId).eq("status", "pending");
    }
    newStatus = hasRejected ? "partially_approved" : "approved";
  } else if (action === "observe") {
    newStatus = "partially_approved";
  } else if (action === "settle") {
    newStatus = "settled";
  }

  const { error } = await sb
    .from("expense_reports")
    .update({
      status: newStatus,
      approval_stage: newStatus === "approved" || newStatus === "settled" ? "done" : "admin",
    })
    .eq("id", reportId);

  if (error) {
    redirect(`/aprobaciones?error=${encodeURIComponent(error.message)}`);
  }

  await sb.from("approval_history").insert({
    report_id: reportId,
    subject_user_id: report.user_id,
    approver_id: profile.id,
    action: action === "settle" ? "settled" : newStatus === "partially_approved" ? "observed" : "approved",
    comments: comments || `Informe resuelto en estado: ${newStatus}`,
  });

  const statusMsg =
    newStatus === "approved"
      ? "aprobado en su totalidad."
      : newStatus === "partially_approved"
      ? "revisado con observaciones o ítems rechazados que requieren tu atención."
      : "liquidado y cerrado.";

  try {
    await sendNotification({
      userId: report.user_id,
      title: newStatus === "approved" ? "¡Rendición Aprobada!" : "Rendición con Observaciones",
      message: `Tu informe "${report.title}" ha sido ${statusMsg}`,
      type: newStatus === "approved" ? "expense_approved" : "expense_rejected",
      link: "/gastos",
    });
  } catch (err) {
    console.error("Error notificando resolución de informe:", err);
  }

  revalidatePath("/aprobaciones");
  revalidatePath("/gastos");
  revalidatePath("/fondos");
  revalidatePath("/dashboard");

  redirect("/aprobaciones?success=informe_resuelto");
}

/** Liquidar y registrar pago de reembolso al trabajador (con comprobante de transferencia o pago en efectivo) */
export async function settleReimbursementWithProof(f: FormData): Promise<ApprovalActionResult> {
  try {
    const profile = await requireRole("admin", "general_manager");
    const reportId = str(f, "report_id");
    const paymentMethod = str(f, "payment_method") || "transfer"; // 'transfer' | 'cash'
    const paymentNote = str(f, "payment_note");
    const proofFile = f.get("proof_file") as File | null;

    if (!reportId) return { success: false, error: "ID de informe inválido." };

    const sb = await createClient();

    let receiptPath: string | null = null;

    // Si es transferencia, validar y subir comprobante
    if (paymentMethod === "transfer") {
      if (!proofFile || proofFile.size === 0) {
        return { success: false, error: "Debes adjuntar el comprobante o captura de la transferencia bancaria." };
      }
      const fileExt = proofFile.name.split(".").pop() || "jpg";
      const fileName = `reimbursements/${reportId}/${Date.now()}_devolucion.${fileExt}`;
      const bytes = await proofFile.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const { error: uploadErr } = await sb.storage
        .from("deposits")
        .upload(fileName, buffer, {
          contentType: proofFile.type || "image/jpeg",
          upsert: true,
        });

      if (uploadErr) {
        return { success: false, error: `Error al subir comprobante: ${uploadErr.message}` };
      }
      receiptPath = fileName;
    }

    // Obtener informe
    const { data: report, error: repErr } = await sb
      .from("expense_reports")
      .select("user_id, total_amount, title")
      .eq("id", reportId)
      .single();

    if (repErr || !report) {
      return { success: false, error: "No se encontró el informe de reembolso." };
    }

    // Liquidar informe
    const { error: updErr } = await sb
      .from("expense_reports")
      .update({
        status: "settled",
        approval_stage: "done",
      })
      .eq("id", reportId);

    if (updErr) {
      return { success: false, error: `Error al liquidar reembolso: ${updErr.message}` };
    }

    // Registrar en historial de auditoría
    await sb.from("approval_history").insert({
      report_id: reportId,
      subject_user_id: report.user_id,
      approver_id: profile.id,
      action: "settled",
      comments: `Reembolso liquidado y pagado (${paymentMethod === "cash" ? "Pago en Efectivo" : "Transferencia Bancaria"}). ${paymentNote ? `Nota: ${paymentNote}` : ""}`,
    });

    // Notificar al colaborador que su reembolso fue pagado
    try {
      await sendNotification({
        userId: report.user_id,
        title: "¡Reembolso Liquidado y Pagado!",
        message: `Tu informe "${report.title}" por ${formatClp(report.total_amount)} fue pagado mediante ${paymentMethod === "cash" ? "Efectivo" : "Transferencia Bancaria"}.`,
        type: "expense_approved",
        link: "/gastos",
      });
    } catch (err) {
      console.error("Error notificando liquidación de reembolso:", err);
    }

    revalidatePath("/aprobaciones");
    revalidatePath("/gastos");
    revalidatePath("/fondos");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (err: any) {
    console.error("Error en settleReimbursementWithProof:", err);
    return { success: false, error: err?.message || "Error al liquidar el reembolso." };
  }
}
