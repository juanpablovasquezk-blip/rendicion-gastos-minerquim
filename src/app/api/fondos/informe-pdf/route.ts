import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function formatCLP(amount: number | null | undefined): string {
  return "$" + Math.round(Number(amount || 0)).toLocaleString("es-CL");
}

function formatDateCL(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

const MONTH_NAMES: Record<string, string> = {
  "01": "Enero",
  "02": "Febrero",
  "03": "Marzo",
  "04": "Abril",
  "05": "Mayo",
  "06": "Junio",
  "07": "Julio",
  "08": "Agosto",
  "09": "Septiembre",
  "10": "Octubre",
  "11": "Noviembre",
  "12": "Diciembre",
};

export async function GET(request: NextRequest) {
  try {
    const profile = await requireRole();
    const adminSb = createAdminClient();

    const searchParams = request.nextUrl.searchParams;
    const requestedUserId = searchParams.get("userId") || "";
    const month = searchParams.get("month") || ""; // e.g. "2026-10", "2026-11", or "all"
    const startDate = searchParams.get("startDate") || ""; // e.g. "2026-10-01"
    const endDate = searchParams.get("endDate") || ""; // e.g. "2026-10-31"
    const scopeParam = searchParams.get("scope") || ""; // "gerencia" | "operaciones"

    const isManagement = profile.role === "general_manager" || profile.role === "admin" || profile.role === "manager";
    const isGerencia = profile.role === "general_manager" || scopeParam === "gerencia";

    // Determine target user(s)
    let targetUserId = profile.id;
    let isAllUsers = false;

    if (isManagement) {
      if (requestedUserId === "all" || (isGerencia && (!requestedUserId || requestedUserId === "all"))) {
        isAllUsers = true;
      } else if (requestedUserId) {
        targetUserId = requestedUserId;
      }
    }

    // Date filter helper
    const filterByDate = (dateVal: string | null | undefined) => {
      if (!dateVal) return true;
      const d = dateVal.slice(0, 10);
      if (month && month !== "all") {
        return d.startsWith(month);
      }
      if (startDate && endDate) {
        return d >= startDate && d <= endDate;
      }
      if (startDate) {
        return d >= startDate;
      }
      if (endDate) {
        return d <= endDate;
      }
      return true;
    };

    // Human-readable Period label
    let periodLabel = "Histórico Completo";
    if (month && month !== "all") {
      const [year, m] = month.split("-");
      periodLabel = `${MONTH_NAMES[m] || m} ${year}`;
    } else if (startDate && endDate) {
      periodLabel = `Del ${formatDateCL(startDate)} al ${formatDateCL(endDate)}`;
    } else if (startDate) {
      periodLabel = `Desde el ${formatDateCL(startDate)}`;
    } else if (endDate) {
      periodLabel = `Hasta el ${formatDateCL(endDate)}`;
    }

    // 1. Fetch profiles
    const { data: allProfiles } = await adminSb
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true });

    const profileMap = new Map((allProfiles || []).map((p) => [p.id, p]));
    const targetProfile = profileMap.get(targetUserId) || profile;

    // 2. Fetch cash advances
    let advancesQuery = adminSb
      .from("cash_advances")
      .select("*")
      .order("created_at", { ascending: true });

    if (!isAllUsers) {
      advancesQuery = advancesQuery.eq("user_id", targetUserId);
    }

    const { data: rawAdvances } = await advancesQuery;
    const advances = (rawAdvances || []).filter((a) =>
      filterByDate(a.date_assigned || a.created_at)
    );

    // 3. Fetch expenses and reports
    let reportsQuery = adminSb
      .from("expense_reports")
      .select("*, expenses(*)")
      .order("created_at", { ascending: true });

    if (!isAllUsers) {
      reportsQuery = reportsQuery.eq("user_id", targetUserId);
    }

    const { data: rawReports } = await reportsQuery;

    // Filter expenses within reports
    const filteredReports = (rawReports || [])
      .map((r) => {
        const filteredExpenses = (r.expenses || []).filter(
          (e: any) =>
            e.status !== "rejected" &&
            filterByDate(e.date || e.created_at) &&
            !e.justification?.includes("Excedente de gastos rendidos sobre") &&
            !e.description?.includes("Excedente de gastos rendidos sobre") &&
            e.supplier_name !== "Liquidación por Cierre de Fondo"
        );
        return {
          ...r,
          expenses: filteredExpenses,
          computedTotal: filteredExpenses.reduce(
            (sum: number, e: any) => sum + Number(e.total_amount || 0),
            0
          ),
        };
      })
      .filter((r) => r.expenses.length > 0 || filterByDate(r.created_at));

    // Extract all individual expenses
    const allFilteredExpenses = filteredReports.flatMap((r) =>
      (r.expenses || []).map((e: any) => ({
        ...e,
        report_title: r.title,
        report_type: r.report_type,
        report_user_id: r.user_id,
      }))
    );

    // ================= GENERATE PDF =================
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "letter",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 36;
    const contentWidth = pageWidth - margin * 2;

    const navy: [number, number, number] = [30, 41, 59];
    const darkBlue: [number, number, number] = [15, 23, 42];
    const slate: [number, number, number] = [71, 85, 105];
    const greenText: [number, number, number] = [5, 102, 69];

    function drawHeader(title: string, subheader: string) {
      doc.setFillColor(...navy);
      doc.rect(margin, margin, contentWidth, 54, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(255, 255, 255);
      doc.text("MINERQUIM SpA", margin + 14, margin + 22);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(226, 232, 240);
      doc.text(
        isGerencia && isAllUsers
          ? "GERENCIA GENERAL — CONTROL Y AUDITORÍA DE FONDOS"
          : "SISTEMA DE GESTIÓN Y RENDICIÓN DE GASTOS",
        margin + 14,
        margin + 38
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(
        `EMISIÓN: ${formatDateCL(new Date().toISOString())}`,
        pageWidth - margin - 14,
        margin + 24,
        { align: "right" }
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(203, 213, 225);
      doc.text(`PERÍODO: ${periodLabel.toUpperCase()}`, pageWidth - margin - 14, margin + 38, {
        align: "right",
      });

      const y = margin + 64;
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, contentWidth, 24, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...darkBlue);
      doc.text(title, margin + 10, y + 16);

      return y + 32;
    }

    function drawFooter() {
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, pageHeight - margin - 15, pageWidth - margin, pageHeight - margin - 15);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...slate);
        doc.text(
          "Minerquim SpA — Documento Oficial de Rendición de Cuentas y Supervisión de Fondos",
          margin,
          pageHeight - margin - 5
        );
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - margin - 5, {
          align: "right",
        });
      }
    }

    // =========================================================================
    // CASE A: GERENCIA GENERAL CONSOLIDADO (TODOS LOS COLABORADORES)
    // =========================================================================
    if (isGerencia && isAllUsers) {
      let y = drawHeader(
        "INFORME CONSOLIDADO GERENCIAL DE FONDOS Y RENDICIONES",
        "Control Gerencial de Entregas y Rendiciones"
      );

      // Gerencia Info Card
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, y, contentWidth, 48, 4, 4, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...slate);
      doc.text("EMISOR DEL INFORME:", margin + 12, y + 16);
      doc.text("CARGO / PERMISO:", margin + 12, y + 32);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...darkBlue);
      doc.text(profile.full_name || "Gabriel Acuña", margin + 140, y + 16);
      doc.setFont("helvetica", "normal");
      doc.text("Gerencia General / Auditoría Financiera", margin + 140, y + 32);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...slate);
      doc.text("RANGO FILTRADO:", margin + 350, y + 16);
      doc.text("ALCANCE:", margin + 350, y + 32);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...darkBlue);
      doc.text(periodLabel, margin + 445, y + 16);
      doc.setFont("helvetica", "normal");
      doc.text("Consolidado Toda la Empresa", margin + 445, y + 32);

      y += 62;

      // Group totals by collaborator
      const userSummaryMap = new Map<
        string,
        {
          name: string;
          email: string;
          fundsDelivered: number;
          expensesSpent: number;
          activeFundsCount: number;
          closedFundsCount: number;
        }
      >();

      for (const p of allProfiles || []) {
        userSummaryMap.set(p.id, {
          name: p.full_name || "Sin Nombre",
          email: p.email || "-",
          fundsDelivered: 0,
          expensesSpent: 0,
          activeFundsCount: 0,
          closedFundsCount: 0,
        });
      }

      for (const adv of advances) {
        const u = userSummaryMap.get(adv.user_id);
        if (u) {
          u.fundsDelivered += Number(adv.initial_amount || 0);
          if (adv.status === "active") u.activeFundsCount++;
          else u.closedFundsCount++;
        }
      }

      for (const exp of allFilteredExpenses) {
        const u = userSummaryMap.get(exp.user_id || exp.report_user_id);
        if (u) {
          u.expensesSpent += Number(exp.total_amount || 0);
        }
      }

      const summaryRows = Array.from(userSummaryMap.entries())
        .map(([uId, data]) => {
          const diff = data.fundsDelivered - data.expensesSpent;
          return {
            uId,
            ...data,
            diff,
          };
        })
        .filter((u) => u.fundsDelivered > 0 || u.expensesSpent > 0);

      const totalDeliveredAll = summaryRows.reduce((acc, r) => acc + r.fundsDelivered, 0);
      const totalSpentAll = summaryRows.reduce((acc, r) => acc + r.expensesSpent, 0);
      const totalDiffAll = totalDeliveredAll - totalSpentAll;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...navy);
      doc.text("1. RESUMEN EJECUTIVO POR COLABORADOR", margin, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [
          [
            "Colaborador",
            "Fondos Entregados",
            "Gastos Rendidos",
            "Balance Período",
            "Estado / Conclusión",
          ],
        ],
        body: summaryRows.map((r) => [
          `${r.name}\n${r.email}`,
          formatCLP(r.fundsDelivered),
          formatCLP(r.expensesSpent),
          r.diff >= 0
            ? `${formatCLP(r.diff)} (A favor empresa)`
            : `+${formatCLP(Math.abs(r.diff))} (A favor colab.)`,
          r.diff < 0
            ? "Excedente rendido / Reembolsado"
            : r.diff === 0
            ? "Fondos completamente cuadrados"
            : "Saldo pendiente en poder del colab.",
        ]),
        foot: [
          [
            "TOTALES CONSOLIDADOS EMPRESA",
            formatCLP(totalDeliveredAll),
            formatCLP(totalSpentAll),
            totalDiffAll >= 0
              ? `${formatCLP(totalDiffAll)} a favor empresa`
              : `+${formatCLP(Math.abs(totalDiffAll))} a favor colab.`,
            "Auditado por Gerencia",
          ],
        ],
        theme: "grid",
        headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
        bodyStyles: { fontSize: 8, textColor: darkBlue },
        footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: "bold", fontSize: 8.5 },
        columnStyles: {
          0: { cellWidth: 170 },
          1: { cellWidth: 85, halign: "right" },
          2: { cellWidth: 85, halign: "right" },
          3: { cellWidth: 105, halign: "right" },
          4: { cellWidth: 95, halign: "center" },
        },
      });

      // @ts-expect-error jspdf-autotable augmentation
      y = doc.lastAutoTable.finalY + 16;

      // Executive Box
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(16, 185, 129);
      doc.roundedRect(margin, y, contentWidth, 44, 4, 4, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...greenText);
      doc.text("BALANCE CONSOLIDADO DEL PERÍODO (GERENCIA GENERAL):", margin + 12, y + 16);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...darkBlue);
      doc.text(
        `Total Fondos Entregados: ${formatCLP(totalDeliveredAll)}   |   Total Rendido: ${formatCLP(
          totalSpentAll
        )}`,
        margin + 12,
        y + 32
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...navy);
      doc.text(
        totalDiffAll < 0
          ? `Reembolso Colaboradores: +${formatCLP(Math.abs(totalDiffAll))}`
          : `Saldo Disponible Empresa: ${formatCLP(totalDiffAll)}`,
        pageWidth - margin - 12,
        y + 24,
        { align: "right" }
      );

      // Section 2: Detailed Funds Delivered
      y += 60;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...navy);
      doc.text("2. DETALLE DE FONDOS ENTREGADOS EN EL PERÍODO", margin, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Fecha", "Receptor / Colaborador", "Motivo / Destino", "Estado", "Monto"]],
        body: advances.map((adv) => {
          const prof = profileMap.get(adv.user_id);
          return [
            formatDateCL(adv.date_assigned || adv.created_at),
            prof?.full_name || adv.user_id,
            adv.purpose || "-",
            adv.status === "closed" ? "Cerrado / Rendido" : "Activo",
            formatCLP(adv.initial_amount),
          ];
        }),
        foot: [["TOTAL FONDOS DEL PERÍODO", "", "", "", formatCLP(totalDeliveredAll)]],
        theme: "grid",
        headStyles: { fillColor: slate, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: darkBlue },
        footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: "bold", fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 65 },
          1: { cellWidth: 120 },
          2: { cellWidth: 190 },
          3: { cellWidth: 85, halign: "center" },
          4: { cellWidth: 80, halign: "right" },
        },
      });

      // Section 3: Itemized Expenses across the company
      doc.addPage();
      y = drawHeader(
        "3. DETALLE DE COMPROBANTES Y GASTOS RENDIDOS EN EL PERÍODO",
        "Respaldos Operacionales y Tributarios"
      );

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["#", "Fecha", "Colaborador", "Proveedor", "Glosa / Detalle", "Doc", "IVA", "Total"]],
        body: allFilteredExpenses.map((exp, idx) => {
          const prof = profileMap.get(exp.user_id || exp.report_user_id);
          return [
            String(idx + 1),
            formatDateCL(exp.date || exp.created_at),
            prof?.full_name?.split(" ")[0] || "Colab",
            exp.supplier_name || "S/P",
            exp.justification || exp.description || "-",
            exp.invoice_number ? `Folio ${exp.invoice_number}` : "S/F",
            formatCLP(exp.tax_amount || 0),
            formatCLP(exp.total_amount),
          ];
        }),
        foot: [
          [
            "",
            "",
            "",
            "",
            "TOTAL GASTOS RENDIDOS",
            "",
            formatCLP(
              allFilteredExpenses.reduce((sum, e) => sum + Number(e.tax_amount || 0), 0)
            ),
            formatCLP(totalSpentAll),
          ],
        ],
        theme: "grid",
        headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
        bodyStyles: { fontSize: 7, textColor: darkBlue },
        footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: "bold", fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 16, halign: "center" },
          1: { cellWidth: 50 },
          2: { cellWidth: 65 },
          3: { cellWidth: 100 },
          4: { cellWidth: 160 },
          5: { cellWidth: 55 },
          6: { cellWidth: 40, halign: "right" },
          7: { cellWidth: 54, halign: "right" },
        },
      });

      // Signatures
      // @ts-expect-error jspdf-autotable augmentation
      y = doc.lastAutoTable.finalY + 25;
      if (y > pageHeight - 110) {
        doc.addPage();
        y = margin + 40;
      }

      const colW = (contentWidth - 40) / 2;
      doc.setDrawColor(148, 163, 184);

      doc.line(margin + 20, y + 40, margin + 20 + colW - 40, y + 40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...darkBlue);
      doc.text("GABRIEL ACUÑA", margin + 20 + (colW - 40) / 2, y + 52, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...slate);
      doc.text("Gerencia General — Minerquim SpA", margin + 20 + (colW - 40) / 2, y + 62, {
        align: "center",
      });

      doc.line(margin + colW + 40, y + 40, margin + colW + 40 + colW - 40, y + 40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...darkBlue);
      doc.text("AUDITORÍA INTERNA / CONTROL", margin + colW + 40 + (colW - 40) / 2, y + 52, {
        align: "center",
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...slate);
      doc.text("Visto Bueno y Cierre de Fondos", margin + colW + 40 + (colW - 40) / 2, y + 62, {
        align: "center",
      });
    }

    // =========================================================================
    // CASE B: OPERACIONES (JUAN PABLO VÁSQUEZ) O COLABORADOR INDIVIDUAL
    // =========================================================================
    else {
      let y = drawHeader(
        `INFORME DE RENDICIÓN DE FONDOS Y GASTOS — ${
          targetProfile.id === profile.id && profile.role === "admin"
            ? "OPERACIONES"
            : targetProfile.full_name?.toUpperCase() || "COLABORADOR"
        }`,
        "Detalle de Fondos Depositados y Gastos Efectuados"
      );

      // Collaborator Info Card
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, y, contentWidth, 52, 4, 4, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...slate);
      doc.text("COLABORADOR:", margin + 12, y + 18);
      doc.text("CORREO ELECTRÓNICO:", margin + 12, y + 36);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...darkBlue);
      doc.text(targetProfile.full_name || "Juan Pablo Vásquez", margin + 115, y + 18);
      doc.setFont("helvetica", "normal");
      doc.text(targetProfile.email || "juanpablo.vasquezk@gmail.com", margin + 145, y + 36);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...slate);
      doc.text("DEPARTAMENTO:", margin + 340, y + 18);
      doc.text("PERÍODO FILTRADO:", margin + 340, y + 36);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...darkBlue);
      doc.text("Operaciones y Logística", margin + 440, y + 18);
      doc.setTextColor(...greenText);
      doc.text(periodLabel, margin + 440, y + 36);

      y += 66;

      const totalDelivered = advances.reduce(
        (sum, a) => sum + Number(a.initial_amount || 0),
        0
      );
      const totalSpent = allFilteredExpenses.reduce(
        (sum, e) => sum + Number(e.total_amount || 0),
        0
      );
      const balance = totalDelivered - totalSpent;

      // Section 1: Fondos Depositados
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...navy);
      doc.text("1. FONDOS RECIBIDOS / DEPOSITADOS EN EL PERÍODO", margin, y);
      y += 8;

      if (advances.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8.5);
        doc.setTextColor(...slate);
        doc.text("No se registran depósitos de fondos en el período seleccionado.", margin + 10, y + 10);
        y += 24;
      } else {
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [["Fecha", "Motivo / Destino Declarado", "Depositado Por", "Medio", "Monto"]],
          body: advances.map((a) => [
            formatDateCL(a.date_assigned || a.created_at),
            a.purpose || "-",
            "Gabriel Acuña",
            "Transferencia",
            formatCLP(a.initial_amount),
          ]),
          foot: [["TOTAL FONDOS DEPOSITADOS", "", "", "", formatCLP(totalDelivered)]],
          theme: "grid",
          headStyles: { fillColor: slate, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
          bodyStyles: { fontSize: 7.5, textColor: darkBlue },
          footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: "bold", fontSize: 8.5 },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 260 },
            2: { cellWidth: 75 },
            3: { cellWidth: 65 },
            4: { cellWidth: 70, halign: "right" },
          },
        });
        // @ts-expect-error jspdf-autotable augmentation
        y = doc.lastAutoTable.finalY + 14;
      }

      // Section 2: Detalle Pormenorizado de Gastos
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...navy);
      doc.text(
        `2. DETALLE PORMENORIZADO DE GASTOS RENDIDOS (${allFilteredExpenses.length} COMPROBANTES)`,
        margin,
        y
      );
      y += 8;

      if (allFilteredExpenses.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8.5);
        doc.setTextColor(...slate);
        doc.text("No se registran gastos rendidos en el período seleccionado.", margin + 10, y + 10);
        y += 24;
      } else {
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [["#", "Fecha", "Proveedor / Emisor", "Glosa / Detalle del Gasto", "Doc", "IVA", "Total"]],
          body: allFilteredExpenses.map((e, idx) => [
            String(idx + 1),
            formatDateCL(e.date || e.created_at),
            e.supplier_name || "Rendición Operacional",
            e.justification || e.description || "-",
            e.invoice_number ? `Folio ${e.invoice_number}` : "S/F",
            formatCLP(e.tax_amount || 0),
            formatCLP(e.total_amount),
          ]),
          foot: [
            [
              "",
              "",
              "",
              "TOTAL GASTOS RENDIDOS",
              "",
              formatCLP(
                allFilteredExpenses.reduce((sum, e) => sum + Number(e.tax_amount || 0), 0)
              ),
              formatCLP(totalSpent),
            ],
          ],
          theme: "grid",
          headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
          bodyStyles: { fontSize: 7, textColor: darkBlue },
          footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: "bold", fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 16, halign: "center" },
            1: { cellWidth: 50 },
            2: { cellWidth: 120 },
            3: { cellWidth: 180 },
            4: { cellWidth: 55 },
            5: { cellWidth: 45, halign: "right" },
            6: { cellWidth: 74, halign: "right" },
          },
        });
        // @ts-expect-error jspdf-autotable augmentation
        y = doc.lastAutoTable.finalY + 14;
      }

      // Check remaining page height for balance box & signatures
      if (y > pageHeight - 140) {
        doc.addPage();
        y = margin + 20;
      }

      // Section 3: Cuadre Financiero
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(16, 185, 129);
      doc.roundedRect(margin, y, contentWidth, 48, 4, 4, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...greenText);
      doc.text("LIQUIDACIÓN Y CUADRE FINANCIERO DEL PERÍODO:", margin + 12, y + 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...darkBlue);
      doc.text(
        `Total Depositado: ${formatCLP(totalDelivered)}   |   Total Gastado: ${formatCLP(totalSpent)}`,
        margin + 12,
        y + 34
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      if (balance < 0) {
        doc.setTextColor(...greenText);
        doc.text(
          `SALDO A FAVOR COLABORADOR: +${formatCLP(Math.abs(balance))}`,
          pageWidth - margin - 12,
          y + 26,
          { align: "right" }
        );
      } else if (balance > 0) {
        doc.setTextColor(...navy);
        doc.text(
          `SALDO DISPONIBLE EMPRESA: ${formatCLP(balance)}`,
          pageWidth - margin - 12,
          y + 26,
          { align: "right" }
        );
      } else {
        doc.setTextColor(...navy);
        doc.text("SALDO CUADRADO: $0", pageWidth - margin - 12, y + 26, { align: "right" });
      }

      // Signatures
      y += 65;
      const colW = (contentWidth - 40) / 2;
      doc.setDrawColor(148, 163, 184);

      doc.line(margin + 20, y + 36, margin + 20 + colW - 40, y + 36);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...darkBlue);
      doc.text(
        targetProfile.full_name?.toUpperCase() || "JUAN PABLO VÁSQUEZ",
        margin + 20 + (colW - 40) / 2,
        y + 48,
        { align: "center" }
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...slate);
      doc.text("Firma Colaborador / Rendidor", margin + 20 + (colW - 40) / 2, y + 58, {
        align: "center",
      });

      doc.line(margin + colW + 40, y + 36, margin + colW + 40 + colW - 40, y + 36);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...darkBlue);
      doc.text("GABRIEL ACUÑA", margin + colW + 40 + (colW - 40) / 2, y + 48, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...slate);
      doc.text("Aprobación Gerencia General", margin + colW + 40 + (colW - 40) / 2, y + 58, {
        align: "center",
      });
    }

    drawFooter();

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const filename = `Informe_${
      isGerencia && isAllUsers ? "Gerencia_Minerquim" : "Rendicion_Gastos_" + (targetProfile.full_name || "Usuario").replace(/\s+/g, "_")
    }_${periodLabel.replace(/\s+/g, "_")}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("PDF generation route error:", err);
    return new NextResponse("Error generating PDF", { status: 500 });
  }
}
