"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizeRut } from "@/lib/format";
import { notifyRole } from "@/lib/notifications/service";
import crypto from "crypto";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (f: FormData, k: string) => {
  const d = str(f, k).replace(/\D/g, "");
  return d ? Number(d) : 0;
};

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export type SaveExpenseResult = {
  success: boolean;
  error?: string;
};

/** Lógica central de guardado de gasto con reporte de errores amigables */
export async function saveExpenseAction(f: FormData): Promise<SaveExpenseResult> {
  try {
    const profile = await requireRole();
    const sb = await createClient();

    const reportType = str(f, "report_type") || "reimbursement";
    const fundId = str(f, "fund_id") || null;
    const companyId = str(f, "company_id");
    const departmentId = str(f, "department_id");
    const categoryId = str(f, "category_id");
    const receiptTypeId = str(f, "receipt_type_id");
    const expenseDate = str(f, "date");
    const totalAmount = money(f, "total_amount");
    const taxAmount = money(f, "tax_amount");
    const supplierName = str(f, "supplier_name");
    const supplierRutRaw = str(f, "supplier_rut");
    const invoiceNumber = str(f, "invoice_number");
    const description = str(f, "description");
    const justification = str(f, "justification");

    // Validaciones obligatorias
    if (!companyId) return { success: false, error: "Debes seleccionar la empresa a cuyo nombre se hizo la compra." };
    if (!departmentId) return { success: false, error: "Debes seleccionar el Área / Centro de Costo." };
    if (!categoryId) return { success: false, error: "Debes seleccionar la categoría del gasto." };
    if (!receiptTypeId) return { success: false, error: "Debes seleccionar el tipo de comprobante." };
    if (!expenseDate) return { success: false, error: "Debes indicar la fecha del gasto." };
    if (!totalAmount || totalAmount <= 0) return { success: false, error: "Ingresa un monto total válido mayor a $0." };

    if (reportType === "fund_rendition" && !fundId) {
      return { success: false, error: "Debes seleccionar un fondo activo para asociar esta rendición." };
    }

    // Verificar tipo de comprobante (si requiere respaldo)
    const { data: receiptType } = await sb
      .from("receipt_types")
      .select("requires_receipt, name")
      .eq("id", receiptTypeId)
      .single();

    const requiresReceipt = receiptType?.requires_receipt ?? true;
    if (!requiresReceipt && (!justification || justification.length < 5)) {
      return { success: false, error: "Para gastos sin comprobante, la justificación es obligatoria (mínimo 5 caracteres)." };
    }

    // Normalizar RUT si se ingresó
    let supplierRut: string | null = null;
    if (supplierRutRaw) {
      supplierRut = normalizeRut(supplierRutRaw);
    }

    // 1. Obtener o crear un informe borrador ('draft') apropiado
    let reportId = str(f, "report_id");
    if (!reportId) {
      // Buscar si ya existe un informe borrador compatible
      let query = sb
        .from("expense_reports")
        .select("id")
        .eq("user_id", profile.id)
        .eq("status", "draft")
        .eq("report_type", reportType);

      if (fundId) {
        query = query.eq("fund_id", fundId);
      } else {
        query = query.is("fund_id", null);
      }

      const { data: existingDraft } = await query.limit(1).maybeSingle();

      if (existingDraft) {
        reportId = existingDraft.id;
      } else {
        // Crear un nuevo informe borrador
        const title = fundId
          ? `Rendición de Fondo - ${new Date().toLocaleDateString("es-CL")}`
          : `Reembolso de Gastos - ${new Date().toLocaleDateString("es-CL")}`;

        const { data: newReport, error: reportErr } = await sb
          .from("expense_reports")
          .insert({
            user_id: profile.id,
            title,
            report_type: reportType,
            fund_id: fundId,
            status: "draft",
          })
          .select("id")
          .single();

        if (reportErr || !newReport) {
          return { success: false, error: `Error al crear el informe borrador: ${reportErr?.message}` };
        }
        reportId = newReport.id;
      }
    }

    // 2. Procesar subida de comprobante si se adjuntó archivo (vía archivo o cámara)
    const rawFile = f.get("receipt_file") || f.get("receipt_camera_file");
    const receiptFile = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
    let receiptPath: string | null = null;
    let receiptHash: string | null = null;

    if (receiptFile) {
      try {
        const bytes = await receiptFile.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Calcular hash SHA-256 para detección de duplicados
        receiptHash = crypto.createHash("sha256").update(buffer).digest("hex");

        const fileExt = receiptFile.name.split(".").pop() || "jpg";
        const fileName = `${profile.id}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

        const { error: uploadErr } = await sb.storage
          .from("receipts")
          .upload(fileName, buffer, {
            contentType: receiptFile.type || "image/jpeg",
            upsert: false,
          });

        if (uploadErr) {
          console.warn("Storage upload warning:", uploadErr.message);
        } else {
          receiptPath = fileName;
        }
      } catch (err: any) {
        console.error("Error subiendo comprobante:", err);
      }
    }

    // 3. Insertar el gasto
    const { error: expenseErr } = await sb.from("expenses").insert({
      report_id: reportId,
      user_id: profile.id,
      company_id: companyId,
      department_id: departmentId,
      category_id: categoryId,
      receipt_type_id: receiptTypeId,
      date: expenseDate,
      supplier_name: supplierName || null,
      supplier_rut: supplierRut,
      invoice_number: invoiceNumber || null,
      has_receipt: requiresReceipt,
      receipt_path: receiptPath,
      receipt_hash: receiptHash,
      total_amount: totalAmount,
      tax_amount: taxAmount || 0,
      description: description || null,
      justification: justification || null,
    });

    if (expenseErr) {
      if (expenseErr.code === "23514") {
        return {
          success: false,
          error: "Verifica el RUT ingresado o los montos. El RUT debe tener formato válido con dígito verificador.",
        };
      }
      return { success: false, error: `Error al registrar el gasto: ${expenseErr.message}` };
    }

    revalidatePath("/gastos");
    revalidatePath("/fondos");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    console.error("Error en saveExpenseAction:", err);
    return { success: false, error: err?.message || "Error inesperado al guardar el gasto." };
  }
}

/** Agrega un nuevo gasto mediante Form Action y redirige */
export async function addExpense(f: FormData) {
  const result = await saveExpenseAction(f);
  if (!result.success) {
    fail("/gastos/nuevo", result.error || "Error al registrar el gasto.");
  }
  redirect(`/gastos?success=gasto_agregado`);
}

/** Enviar o Auto-Autorizar informe de gastos */
export async function submitReport(f: FormData) {
  const profile = await requireRole();
  const reportId = str(f, "report_id");
  if (!reportId) fail("/gastos", "ID de informe no válido.");

  const sb = await createClient();
  const isManagement = ["admin", "general_manager", "manager"].includes(profile.role);

  if (isManagement) {
    // Para roles de gerencia o administración, se auto-aprueban los gastos y el informe directamente
    // 1. Aprobar todos los gastos del informe que no hayan sido rechazados
    const { error: expError } = await sb
      .from("expenses")
      .update({ status: "approved" })
      .eq("report_id", reportId)
      .neq("status", "rejected");

    if (expError) {
      fail("/gastos", `Error al autorizar gastos: ${expError.message}`);
    }

    // 2. Actualizar el informe a approved y etapa concluida
    const { error: repError } = await sb
      .from("expense_reports")
      .update({
        status: "approved",
        approval_stage: "done",
      })
      .eq("id", reportId)
      .eq("user_id", profile.id);

    if (repError) {
      fail("/gastos", `Error al autorizar informe: ${repError.message}`);
    }

    // 3. Registrar en historial de aprobaciones
    await sb.from("approval_history").insert({
      report_id: reportId,
      subject_user_id: profile.id,
      approver_id: profile.id,
      action: "approved",
      comments: "Informe auto-autorizado directamente por perfil gerencial / administración",
    });

    revalidatePath("/gastos");
    revalidatePath("/aprobaciones");
    revalidatePath("/fondos");
    revalidatePath("/dashboard");
    redirect("/gastos?success=informe_auto_aprobado");
  } else {
    // Para colaboradores comunes, pasa a estado 'submitted' a la bandeja de revisión
    const { error } = await sb
      .from("expense_reports")
      .update({ status: "submitted" })
      .eq("id", reportId)
      .eq("user_id", profile.id);

    if (error) {
      fail("/gastos", `Error al enviar informe: ${error.message}`);
    }

    // Registrar en historial de aprobaciones
    await sb.from("approval_history").insert({
      report_id: reportId,
      subject_user_id: profile.id,
      action: "submitted",
      comments: "Informe enviado a revisión por el colaborador",
    });

    // Notificar a aprobadores
    try {
      await notifyRole(["admin", "manager", "general_manager"], {
        title: "Nueva Rendición de Gastos",
        message: `${profile.full_name} ha enviado un informe de gastos para revisión y aprobación.`,
        type: "expense_submitted",
        link: "/aprobaciones",
      });
    } catch (err) {
      console.error("Error notificando envío de informe:", err);
    }

    revalidatePath("/gastos");
    revalidatePath("/aprobaciones");
    revalidatePath("/fondos");
    revalidatePath("/dashboard");
    redirect("/gastos?success=informe_enviado");
  }
}

/** Eliminar un gasto de un informe borrador */
export async function deleteExpense(f: FormData) {
  const profile = await requireRole();
  const expenseId = str(f, "expense_id");
  if (!expenseId) fail("/gastos", "ID de gasto inválido.");

  const sb = await createClient();
  const { error } = await sb
    .from("expenses")
    .delete()
    .eq("id", expenseId)
    .eq("user_id", profile.id);

  if (error) {
    fail("/gastos", `No se pudo eliminar el gasto: ${error.message}`);
  }

  revalidatePath("/gastos");
  revalidatePath("/fondos");
  redirect("/gastos?success=gasto_eliminado");
}
