import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function formatCLP(amount) {
  return '$' + Math.round(Number(amount || 0)).toLocaleString('es-CL');
}

function formatDateCL(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

const MONTH_NAMES = {
  '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
  '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
  '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
};

async function buildPdf({ targetUserId = 'all', month = '', startDate = '', endDate = '', scope = 'operaciones', outFileName }) {
  const isAllUsers = targetUserId === 'all';
  const isGerencia = scope === 'gerencia' || isAllUsers;

  const filterByDate = (dateVal) => {
    if (!dateVal) return true;
    const d = dateVal.slice(0, 10);
    if (month && month !== 'all') return d.startsWith(month);
    if (startDate && endDate) return d >= startDate && d <= endDate;
    if (startDate) return d >= startDate;
    if (endDate) return d <= endDate;
    return true;
  };

  let periodLabel = 'Histórico Completo';
  if (month && month !== 'all') {
    const [year, m] = month.split('-');
    periodLabel = `${MONTH_NAMES[m] || m} ${year}`;
  } else if (startDate && endDate) {
    periodLabel = `Del ${formatDateCL(startDate)} al ${formatDateCL(endDate)}`;
  }

  const { data: allProfiles } = await supabase.from('profiles').select('id, full_name, email, role');
  const profileMap = new Map((allProfiles || []).map((p) => [p.id, p]));
  const targetProfile = profileMap.get(targetUserId) || { full_name: 'Juan Pablo Vásquez', email: 'juanpablo.vasquezk@gmail.com' };

  let advQ = supabase.from('cash_advances').select('*').order('created_at', { ascending: true });
  if (!isAllUsers) advQ = advQ.eq('user_id', targetUserId);
  const { data: rawAdv } = await advQ;
  const advances = (rawAdv || []).filter((a) => filterByDate(a.date_assigned || a.created_at));

  let repQ = supabase.from('expense_reports').select('*, expenses(*)').order('created_at', { ascending: true });
  if (!isAllUsers) repQ = repQ.eq('user_id', targetUserId);
  const { data: rawRep } = await repQ;

  const filteredReports = (rawRep || [])
    .map((r) => {
      const filteredExpenses = (r.expenses || []).filter(
        (e) =>
          e.status !== 'rejected' &&
          filterByDate(e.date || e.created_at) &&
          !e.justification?.includes('Excedente de gastos rendidos sobre') &&
          !e.description?.includes('Excedente de gastos rendidos sobre') &&
          e.supplier_name !== 'Liquidación por Cierre de Fondo'
      );
      return {
        ...r,
        expenses: filteredExpenses,
        computedTotal: filteredExpenses.reduce((sum, e) => sum + Number(e.total_amount || 0), 0)
      };
    })
    .filter((r) => r.expenses.length > 0 || filterByDate(r.created_at));

  const allFilteredExpenses = filteredReports.flatMap((r) =>
    (r.expenses || []).map((e) => ({
      ...e,
      report_title: r.title,
      report_type: r.report_type,
      report_user_id: r.user_id
    }))
  );

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  const navy = [30, 41, 59];
  const darkBlue = [15, 23, 42];
  const slate = [71, 85, 105];
  const greenText = [5, 102, 69];

  function drawHeader(title, sub) {
    doc.setFillColor(...navy);
    doc.rect(margin, margin, contentWidth, 54, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('MINERQUIM SpA', margin + 14, margin + 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(226, 232, 240);
    doc.text(
      isGerencia && isAllUsers ? 'GERENCIA GENERAL — CONTROL Y AUDITORÍA DE FONDOS' : 'SISTEMA DE GESTIÓN Y RENDICIÓN DE GASTOS',
      margin + 14,
      margin + 38
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`EMISIÓN: ${formatDateCL(new Date().toISOString())}`, pageWidth - margin - 14, margin + 24, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`PERÍODO: ${periodLabel.toUpperCase()}`, pageWidth - margin - 14, margin + 38, { align: 'right' });

    const y = margin + 64;
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 24, 'F');
    doc.setFont('helvetica', 'bold');
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
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...slate);
      doc.text('Minerquim SpA — Documento Oficial de Rendición de Cuentas y Supervisión de Fondos', margin, pageHeight - margin - 5);
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - margin - 5, { align: 'right' });
    }
  }

  if (isGerencia && isAllUsers) {
    let y = drawHeader('INFORME CONSOLIDADO GERENCIAL DE FONDOS Y RENDICIONES', '');

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, 48, 4, 4, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...slate);
    doc.text('EMISOR DEL INFORME:', margin + 12, y + 16);
    doc.text('CARGO / PERMISO:', margin + 12, y + 32);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...darkBlue);
    doc.text('Gabriel Acuña', margin + 140, y + 16);
    doc.setFont('helvetica', 'normal');
    doc.text('Gerencia General / Auditoría Financiera', margin + 140, y + 32);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...slate);
    doc.text('RANGO FILTRADO:', margin + 350, y + 16);
    doc.text('ALCANCE:', margin + 350, y + 32);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...darkBlue);
    doc.text(periodLabel, margin + 445, y + 16);
    doc.setFont('helvetica', 'normal');
    doc.text('Consolidado Toda la Empresa', margin + 445, y + 32);

    y += 62;

    const userSummaryMap = new Map();
    for (const p of allProfiles || []) {
      userSummaryMap.set(p.id, {
        name: p.full_name || 'Sin Nombre',
        email: p.email || '-',
        fundsDelivered: 0,
        expensesSpent: 0
      });
    }

    for (const adv of advances) {
      const u = userSummaryMap.get(adv.user_id);
      if (u) u.fundsDelivered += Number(adv.initial_amount || 0);
    }
    for (const exp of allFilteredExpenses) {
      const u = userSummaryMap.get(exp.user_id || exp.report_user_id);
      if (u) u.expensesSpent += Number(exp.total_amount || 0);
    }

    const summaryRows = Array.from(userSummaryMap.entries())
      .map(([uId, data]) => ({ uId, ...data, diff: data.fundsDelivered - data.expensesSpent }))
      .filter((u) => u.fundsDelivered > 0 || u.expensesSpent > 0);

    const totalDeliveredAll = summaryRows.reduce((acc, r) => acc + r.fundsDelivered, 0);
    const totalSpentAll = summaryRows.reduce((acc, r) => acc + r.expensesSpent, 0);
    const totalDiffAll = totalDeliveredAll - totalSpentAll;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...navy);
    doc.text('1. RESUMEN EJECUTIVO POR COLABORADOR', margin, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Colaborador', 'Fondos Entregados', 'Gastos Rendidos', 'Balance Período', 'Estado / Conclusión']],
      body: summaryRows.map((r) => [
        `${r.name}\n${r.email}`,
        formatCLP(r.fundsDelivered),
        formatCLP(r.expensesSpent),
        r.diff >= 0 ? `${formatCLP(r.diff)} (A favor empresa)` : `+${formatCLP(Math.abs(r.diff))} (A favor colab.)`,
        r.diff < 0 ? 'Excedente rendido / Reembolsado' : r.diff === 0 ? 'Fondos completamente cuadrados' : 'Saldo pendiente en poder del colab.'
      ]),
      foot: [
        [
          'TOTALES CONSOLIDADOS EMPRESA',
          formatCLP(totalDeliveredAll),
          formatCLP(totalSpentAll),
          totalDiffAll >= 0 ? `${formatCLP(totalDiffAll)} a favor empresa` : `+${formatCLP(Math.abs(totalDiffAll))} a favor colab.`,
          'Auditado por Gerencia'
        ]
      ],
      theme: 'grid',
      headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      bodyStyles: { fontSize: 8, textColor: darkBlue },
      footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: {
        0: { cellWidth: 170 },
        1: { cellWidth: 85, halign: 'right' },
        2: { cellWidth: 85, halign: 'right' },
        3: { cellWidth: 105, halign: 'right' },
        4: { cellWidth: 95, halign: 'center' }
      }
    });

    y = doc.lastAutoTable.finalY + 16;

    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(16, 185, 129);
    doc.roundedRect(margin, y, contentWidth, 44, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...greenText);
    doc.text('BALANCE CONSOLIDADO DEL PERÍODO (GERENCIA GENERAL):', margin + 12, y + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...darkBlue);
    doc.text(`Total Fondos Entregados: ${formatCLP(totalDeliveredAll)}   |   Total Rendido: ${formatCLP(totalSpentAll)}`, margin + 12, y + 32);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...navy);
    doc.text(
      totalDiffAll < 0 ? `Reembolso Colaboradores: +${formatCLP(Math.abs(totalDiffAll))}` : `Saldo Disponible Empresa: ${formatCLP(totalDiffAll)}`,
      pageWidth - margin - 12,
      y + 24,
      { align: 'right' }
    );

    y += 60;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...navy);
    doc.text('2. DETALLE DE FONDOS ENTREGADOS EN EL PERÍODO', margin, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Fecha', 'Receptor / Colaborador', 'Motivo / Destino', 'Estado', 'Monto']],
      body: advances.map((adv) => {
        const prof = profileMap.get(adv.user_id);
        return [
          formatDateCL(adv.date_assigned || adv.created_at),
          prof?.full_name || adv.user_id,
          adv.purpose || '-',
          adv.status === 'closed' ? 'Cerrado / Rendido' : 'Activo',
          formatCLP(adv.initial_amount)
        ];
      }),
      foot: [['TOTAL FONDOS DEL PERÍODO', '', '', '', formatCLP(totalDeliveredAll)]],
      theme: 'grid',
      headStyles: { fillColor: slate, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7.5, textColor: darkBlue },
      footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: 'bold', fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 65 },
        1: { cellWidth: 120 },
        2: { cellWidth: 190 },
        3: { cellWidth: 85, halign: 'center' },
        4: { cellWidth: 80, halign: 'right' }
      }
    });

    doc.addPage();
    y = drawHeader('3. DETALLE DE COMPROBANTES Y GASTOS RENDIDOS EN EL PERÍODO', '');

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'Fecha', 'Colaborador', 'Proveedor', 'Glosa / Detalle', 'Doc', 'IVA', 'Total']],
      body: allFilteredExpenses.map((exp, idx) => {
        const prof = profileMap.get(exp.user_id || exp.report_user_id);
        return [
          String(idx + 1),
          formatDateCL(exp.date || exp.created_at),
          prof?.full_name?.split(' ')[0] || 'Colab',
          exp.supplier_name || 'S/P',
          exp.justification || exp.description || '-',
          exp.invoice_number ? `Folio ${exp.invoice_number}` : 'S/F',
          formatCLP(exp.tax_amount || 0),
          formatCLP(exp.total_amount)
        ];
      }),
      foot: [['', '', '', '', 'TOTAL GASTOS RENDIDOS', '', formatCLP(allFilteredExpenses.reduce((s, e) => s + Number(e.tax_amount || 0), 0)), formatCLP(totalSpentAll)]],
      theme: 'grid',
      headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7, textColor: darkBlue },
      footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 16, halign: 'center' },
        1: { cellWidth: 50 },
        2: { cellWidth: 65 },
        3: { cellWidth: 100 },
        4: { cellWidth: 160 },
        5: { cellWidth: 55 },
        6: { cellWidth: 40, halign: 'right' },
        7: { cellWidth: 54, halign: 'right' }
      }
    });
  } else {
    // Operaciones (Individual)
    let y = drawHeader(`INFORME DE RENDICIÓN DE FONDOS Y GASTOS — ${targetProfile.full_name?.toUpperCase() || 'OPERACIONES'}`, '');

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, 52, 4, 4, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...slate);
    doc.text('COLABORADOR:', margin + 12, y + 18);
    doc.text('CORREO ELECTRÓNICO:', margin + 12, y + 36);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...darkBlue);
    doc.text(targetProfile.full_name || 'Juan Pablo Vásquez', margin + 115, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.text(targetProfile.email || 'juanpablo.vasquezk@gmail.com', margin + 145, y + 36);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...slate);
    doc.text('DEPARTAMENTO:', margin + 340, y + 18);
    doc.text('PERÍODO FILTRADO:', margin + 340, y + 36);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...darkBlue);
    doc.text('Operaciones y Logística', margin + 440, y + 18);
    doc.setTextColor(...greenText);
    doc.text(periodLabel, margin + 440, y + 36);

    y += 66;

    const totalDelivered = advances.reduce((sum, a) => sum + Number(a.initial_amount || 0), 0);
    const totalSpent = allFilteredExpenses.reduce((sum, e) => sum + Number(e.total_amount || 0), 0);
    const balance = totalDelivered - totalSpent;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...navy);
    doc.text('1. FONDOS RECIBIDOS / DEPOSITADOS EN EL PERÍODO', margin, y);
    y += 8;

    if (advances.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(...slate);
      doc.text('No se registran depósitos de fondos en el período seleccionado.', margin + 10, y + 10);
      y += 24;
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Fecha', 'Motivo / Destino Declarado', 'Depositado Por', 'Medio', 'Monto']],
        body: advances.map((a) => [
          formatDateCL(a.date_assigned || a.created_at),
          a.purpose || '-',
          'Gabriel Acuña',
          'Transferencia',
          formatCLP(a.initial_amount)
        ]),
        foot: [['TOTAL FONDOS DEPOSITADOS', '', '', '', formatCLP(totalDelivered)]],
        theme: 'grid',
        headStyles: { fillColor: slate, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: darkBlue },
        footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: 'bold', fontSize: 8.5 },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { cellWidth: 260 },
          2: { cellWidth: 75 },
          3: { cellWidth: 65 },
          4: { cellWidth: 70, halign: 'right' }
        }
      });
      y = doc.lastAutoTable.finalY + 14;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...navy);
    doc.text(`2. DETALLE PORMENORIZADO DE GASTOS RENDIDOS (${allFilteredExpenses.length} COMPROBANTES)`, margin, y);
    y += 8;

    if (allFilteredExpenses.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(...slate);
      doc.text('No se registran gastos rendidos en el período seleccionado.', margin + 10, y + 10);
      y += 24;
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['#', 'Fecha', 'Proveedor / Emisor', 'Glosa / Detalle del Gasto', 'Doc', 'IVA', 'Total']],
        body: allFilteredExpenses.map((e, idx) => [
          String(idx + 1),
          formatDateCL(e.date || e.created_at),
          e.supplier_name || 'Rendición Operacional',
          e.justification || e.description || '-',
          e.invoice_number ? `Folio ${e.invoice_number}` : 'S/F',
          formatCLP(e.tax_amount || 0),
          formatCLP(e.total_amount)
        ]),
        foot: [['', '', '', 'TOTAL GASTOS RENDIDOS', '', formatCLP(allFilteredExpenses.reduce((s, e) => s + Number(e.tax_amount || 0), 0)), formatCLP(totalSpent)]],
        theme: 'grid',
        headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7, textColor: darkBlue },
        footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: 'bold', fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 16, halign: 'center' },
          1: { cellWidth: 50 },
          2: { cellWidth: 120 },
          3: { cellWidth: 180 },
          4: { cellWidth: 55 },
          5: { cellWidth: 45, halign: 'right' },
          6: { cellWidth: 74, halign: 'right' }
        }
      });
      y = doc.lastAutoTable.finalY + 14;
    }

    if (y > pageHeight - 140) {
      doc.addPage();
      y = margin + 20;
    }

    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(16, 185, 129);
    doc.roundedRect(margin, y, contentWidth, 48, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...greenText);
    doc.text('LIQUIDACIÓN Y CUADRE FINANCIERO DEL PERÍODO:', margin + 12, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...darkBlue);
    doc.text(`Total Depositado: ${formatCLP(totalDelivered)}   |   Total Gastado: ${formatCLP(totalSpent)}`, margin + 12, y + 34);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    if (balance < 0) {
      doc.setTextColor(...greenText);
      doc.text(`SALDO A FAVOR COLABORADOR: +${formatCLP(Math.abs(balance))}`, pageWidth - margin - 12, y + 26, { align: 'right' });
    } else if (balance > 0) {
      doc.setTextColor(...navy);
      doc.text(`SALDO DISPONIBLE EMPRESA: ${formatCLP(balance)}`, pageWidth - margin - 12, y + 26, { align: 'right' });
    } else {
      doc.setTextColor(...navy);
      doc.text('SALDO CUADRADO: $0', pageWidth - margin - 12, y + 26, { align: 'right' });
    }

    y += 65;
    const colW = (contentWidth - 40) / 2;
    doc.setDrawColor(148, 163, 184);

    doc.line(margin + 20, y + 36, margin + 20 + colW - 40, y + 36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...darkBlue);
    doc.text(targetProfile.full_name?.toUpperCase() || 'JUAN PABLO VÁSQUEZ', margin + 20 + (colW - 40) / 2, y + 48, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...slate);
    doc.text('Firma Colaborador / Rendidor', margin + 20 + (colW - 40) / 2, y + 58, { align: 'center' });

    doc.line(margin + colW + 40, y + 36, margin + colW + 40 + colW - 40, y + 36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...darkBlue);
    doc.text('GABRIEL ACUÑA', margin + colW + 40 + (colW - 40) / 2, y + 48, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...slate);
    doc.text('Aprobación Gerencia General', margin + colW + 40 + (colW - 40) / 2, y + 58, { align: 'center' });
  }

  drawFooter();

  const buffer = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(outFileName, buffer);

  // Copy to desktop if available
  const desktopPath = 'C:/Users/jpvas/Desktop/' + path.basename(outFileName);
  if (fs.existsSync('C:/Users/jpvas/Desktop')) {
    fs.copyFileSync(outFileName, desktopPath);
  }

  console.log(`Saved: ${outFileName} (${buffer.length} bytes)`);
}

async function run() {
  const jpvId = '709da4a7-c21b-487a-b465-5739cddc561a';

  // 1. Gerencia (General Manager - Todo Noviembre 2026)
  await buildPdf({
    targetUserId: 'all',
    month: '2026-11',
    scope: 'gerencia',
    outFileName: 'INFORME_GERENCIA_GACUNA_NOVIEMBRE_2026.pdf'
  });

  // 2. Gerencia (General Manager - Todo Octubre 2026)
  await buildPdf({
    targetUserId: 'all',
    month: '2026-10',
    scope: 'gerencia',
    outFileName: 'INFORME_GERENCIA_GACUNA_OCTUBRE_2026.pdf'
  });

  // 3. Operaciones (Juan Pablo Vásquez - Noviembre 2026)
  await buildPdf({
    targetUserId: jpvId,
    month: '2026-11',
    scope: 'operaciones',
    outFileName: 'INFORME_OPERACIONES_JUAN_PABLO_NOVIEMBRE_2026.pdf'
  });

  // 4. Operaciones (Juan Pablo Vásquez - Octubre 2026)
  await buildPdf({
    targetUserId: jpvId,
    month: '2026-10',
    scope: 'operaciones',
    outFileName: 'INFORME_OPERACIONES_JUAN_PABLO_OCTUBRE_2026.pdf'
  });
}

run().catch(console.error);
