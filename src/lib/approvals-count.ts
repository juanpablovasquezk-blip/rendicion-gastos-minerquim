import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/roles";

export interface PendingApprovalsSummary {
  total: number;
  fundsCount: number;
  reportsCount: number;
}

/**
 * Obtiene el conteo consolidado de aprobaciones pendientes según el rol del usuario
 */
export async function getPendingApprovalsSummary(
  role: UserRole,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userId?: string
): Promise<PendingApprovalsSummary> {
  if (role === "employee") {
    return { total: 0, fundsCount: 0, reportsCount: 0 };
  }

  try {
    const sb = await createClient();

    // 1. Solicitudes de fondos pendientes
    const { data: pendingFunds } = await sb
      .from("cash_advances")
      .select("id, status, approval_stage, user_id")
      .in("status", ["requested", "approved"]);

    // 2. Informes de gastos / rendiciones pendientes
    const { data: submittedReports } = await sb
      .from("expense_reports")
      .select("id, status, report_type, user_id, needs_gm")
      .in("status", ["submitted", "partially_approved", "approved"]);

    let fundsCount = 0;
    let reportsCount = 0;

    if (role === "admin") {
      // Gerencia de Operaciones revisa solicitudes de fondos iniciales e informes de colaboradores
      const fondosOperaciones = (pendingFunds || []).filter(
        (f) =>
          f.status === "requested" &&
          (f.approval_stage === "admin" || f.approval_stage === "manager") &&
          (!userId || f.user_id !== userId)
      );
      const rendicionesOperaciones = (submittedReports || []).filter(
        (r) =>
          (r.status === "submitted" || r.status === "partially_approved") &&
          (!userId || r.user_id !== userId)
      );

      fundsCount = fondosOperaciones.length;
      reportsCount = rendicionesOperaciones.length;
    } else if (role === "general_manager") {
      // Gerencia General gestiona depósitos de fondos y pagos de reembolsos autorizados
      const fondosGM = (pendingFunds || []).filter(
        (f) => f.status === "approved" || f.approval_stage === "general_manager"
      );
      const reembolsosGM = (submittedReports || []).filter(
        (r) => r.status === "approved" && r.report_type === "reimbursement"
      );
      const rendicionesGM = (submittedReports || []).filter(
        (r) => (r.status === "submitted" || r.status === "partially_approved") && r.needs_gm
      );

      fundsCount = fondosGM.length;
      reportsCount = reembolsosGM.length + rendicionesGM.length;
    } else if (role === "manager") {
      // Jefaturas revisan solicitudes de su área
      const fondosManager = (pendingFunds || []).filter(
        (f) => f.status === "requested" && f.approval_stage === "manager" && (!userId || f.user_id !== userId)
      );
      const rendicionesManager = (submittedReports || []).filter(
        (r) =>
          (r.status === "submitted" || r.status === "partially_approved") &&
          (!userId || r.user_id !== userId)
      );

      fundsCount = fondosManager.length;
      reportsCount = rendicionesManager.length;
    }

    return {
      total: fundsCount + reportsCount,
      fundsCount,
      reportsCount,
    };
  } catch (err) {
    console.error("Error obteniendo conteo de aprobaciones pendientes:", err);
    return { total: 0, fundsCount: 0, reportsCount: 0 };
  }
}
