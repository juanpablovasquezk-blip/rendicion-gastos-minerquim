"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizeRut } from "@/lib/format";
import crypto from "crypto";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (f: FormData, k: string) => {
  const d = str(f, k).replace(/\D/g, "");
  return d ? Number(d) : 0;
};

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

/** Agrega un nuevo gasto y lo asocia o crea un informe borrador */
export async function addExpense(f: FormData) {
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
  if (!companyId) fail("/gastos/nuevo", "Debes seleccionar la empresa a cuyo nombre se hizo la compra.");
  if (!departmentId) fail("/gastos/nuevo", "Debes seleccionar el Área / Centro de Costo.");
  if (!categoryId) fail("/gastos/nuevo", "Debes seleccionar la categoría del gasto.");
  if (!receiptTypeId) fail("/gastos/nuevo", "Debes seleccionar el tipo de comprobante.");
  if (!expenseDate) fail("/gastos/nuevo", "Debes indicar la fecha del gasto.");
  if (!totalAmount || totalAmount <= 0) fail("/gastos/nuevo", "Ingresa un monto total válido.");

  // Verificar tipo de comprobante (si requiere respaldo)
  const { data: receiptType } = await sb
    .from("receipt_types")
    .select("requires_receipt, name")
    .eq("id", receiptTypeId)
    .single();

  const requiresReceipt = receiptType?.requires_receipt ?? true;
  if (!requiresReceipt && (!justification || justification.length < 5)) {
    fail("/gastos/nuevo", "Para gastos sin comprobante, la justificación es obligatoria (mínimo 5 caracteres).");
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
        fail("/gastos/nuevo", `Error al crear el informe: ${reportErr?.message}`);
      }
      reportId = newReport.id;
    }
  }

  // 2. Procesar subida de comprobante si se adjuntó archivo
  const receiptFile = f.get("receipt_file") as File | null;
  let receiptPath: string | null = null;
  let receiptHash: string | null = null;

  if (receiptFile && receiptFile.size > 0) {
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
      fail("/gastos/nuevo", `Error al subir el comprobante: ${uploadErr.message}`);
    }
    receiptPath = fileName;
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
      fail("/gastos/nuevo", "Verifica el RUT ingresado o los montos. El RUT debe tener formato válido con dígito verificador.");
    }
    fail("/gastos/nuevo", `Error al registrar el gasto: ${expenseErr.message}`);
  }

  revalidatePath("/gastos");
  revalidatePath("/fondos");
  revalidatePath("/dashboard");
  redirect(`/gastos?success=gasto_agregado`);
}

/** Enviar informe a revisión / aprobación */
export async function submitReport(f: FormData) {
  const profile = await requireRole();
  const reportId = str(f, "report_id");
  if (!reportId) fail("/gastos", "ID de informe no válido.");

  const sb = await createClient();

  // Actualizar informe a submitted
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

  revalidatePath("/gastos");
  revalidatePath("/aprobaciones");
  revalidatePath("/dashboard");
  redirect("/gastos?success=informe_enviado");
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
