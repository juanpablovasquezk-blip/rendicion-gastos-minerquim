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

async function generateConsolidated({ month = '', startDate = '', endDate = '', outFileName }) {
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

  const { data: rawAdv } = await supabase.from('cash_advances').select('*').order('created_at', { ascending: true });
  const advances = (rawAdv || []).filter((a) => filterByDate(a.date_assigned || a.created_at));

  const { data: rawRep } = await supabase.from('expense_reports').select('*, expenses(*)').order('created_at', { ascending: true });

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

  function drawHeader(title) {
    doc.setFillColor(...navy);
    doc.rect(margin, margin, contentWidth, 54, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('MINERQUIM SpA', margin + 14, margin + 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(226, 232, 240);
    doc.text('GERENCIA DE OPERACIONES — CONSOLIDADO DE TODOS LOS FUNCIONARIOS', margin + 14, margin + 38);

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
      doc.text('Minerquim SpA — Informe Oficial de Rendición de Cuentas y Supervisión de Operaciones', margin, pageHeight - margin - 5);
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - margin - 5, { align: 'right' });
    }
  }

  // PAGE 1: RESUMEN EJECUTIVO DE TODOS LOS FUNCIONARIOS
  let y = drawHeader('INFORME GENERAL CONSOLIDADO DE FONDOS Y RENDICIÓN');

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 48, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...slate);
  doc.text('EMISOR DEL INFORME:', margin + 12, y + 16);
  doc.text('CARGO / DEPARTAMENTO:', margin + 12, y + 32);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...darkBlue);
  doc.text('Juan Pablo Vásquez', margin + 140, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text('Gerencia de Operaciones / Control de Rendiciones', margin + 140, y + 32);

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
  doc.text('Todos los Funcionarios', margin + 445, y + 32);

  y += 62;

  const userSummaryMap = new Map();
  for (const p of allProfiles || []) {
    userSummaryMap.set(p.id, {
      id: p.id,
      name: p.full_name || 'Sin Nombre',
      email: p.email || '-',
      role: p.role || 'employee',
      fundsDelivered: 0,
      expensesSpent: 0,
      userAdvances: [],
      userExpenses: []
    });
  }

  for (const adv of advances) {
    const u = userSummaryMap.get(adv.user_id);
    if (u) {
      u.fundsDelivered += Number(adv.initial_amount || 0);
      u.userAdvances.push(adv);
    }
  }

  for (const exp of allFilteredExpenses) {
    const u = userSummaryMap.get(exp.user_id || exp.report_user_id);
    if (u) {
      u.expensesSpent += Number(exp.total_amount || 0);
      u.userExpenses.push(exp);
    }
  }

  const activeUsers = Array.from(userSummaryMap.values()).filter(
    (u) => u.fundsDelivered > 0 || u.expensesSpent > 0
  );

  const totalDeliveredAll = activeUsers.reduce((acc, r) => acc + r.fundsDelivered, 0);
  const totalSpentAll = activeUsers.reduce((acc, r) => acc + r.expensesSpent, 0);
  const totalDiffAll = totalDeliveredAll - totalSpentAll;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...navy);
  doc.text('1. RESUMEN EJECUTIVO CONSOLIDADO POR FUNCIONARIO', margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Funcionario / Cargo', 'Fondos Entregados', 'Gastos Rendidos', 'Balance Período', 'Estado / Conclusión']],
    body: activeUsers.map((r) => {
      const diff = r.fundsDelivered - r.expensesSpent;
      const roleLabel =
        r.role === 'admin' ? 'Gerente Operaciones' : r.role === 'general_manager' ? 'Gerente General' : 'Operaciones / Terreno';

      return [
        `${r.name}\n${roleLabel} (${r.email})`,
        formatCLP(r.fundsDelivered),
        formatCLP(r.expensesSpent),
        diff >= 0 ? `${formatCLP(diff)} (A favor empresa)` : `+${formatCLP(Math.abs(diff))} (A favor colab.)`,
        diff < 0 ? 'Excedente rendido / Reembolsado' : diff === 0 ? 'Fondos completamente cuadrados' : 'Saldo pendiente en poder del colab.'
      ];
    }),
    foot: [
      [
        'TOTALES GENERALES EMPRESA',
        formatCLP(totalDeliveredAll),
        formatCLP(totalSpentAll),
        totalDiffAll >= 0 ? `${formatCLP(totalDiffAll)} a favor empresa` : `+${formatCLP(Math.abs(totalDiffAll))} a favor colab.`,
        'Auditado y Conforme'
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
  doc.text('BALANCE GENERAL CONSOLIDADO DE LA EMPRESA:', margin + 12, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...darkBlue);
  doc.text(
    `Total Fondos Entregados: ${formatCLP(totalDeliveredAll)}   |   Total Gastos Rendidos: ${formatCLP(totalSpentAll)}`,
    margin + 12,
    y + 32
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text(
    totalDiffAll < 0 ? `Reembolso Colaboradores: +${formatCLP(Math.abs(totalDiffAll))}` : `Saldo Disponible Empresa: ${formatCLP(totalDiffAll)}`,
    pageWidth - margin - 12,
    y + 24,
    { align: 'right' }
  );

  // DETAILED BREAKDOWN PER EMPLOYEE
  for (const u of activeUsers) {
    doc.addPage();
    y = drawHeader(`DESGLOSE DETALLADO — ${u.name.toUpperCase()}`);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, 36, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...darkBlue);
    doc.text(`Funcionario: ${u.name} (${u.email})`, margin + 10, y + 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...slate);
    const uDiff = u.fundsDelivered - u.expensesSpent;
    doc.text(
      `Fondos Recibidos: ${formatCLP(u.fundsDelivered)}   |   Gastos Rendidos: ${formatCLP(u.expensesSpent)}   |   Balance: ${
        uDiff < 0 ? '+' + formatCLP(Math.abs(uDiff)) + ' (A favor colaborador)' : formatCLP(uDiff) + ' (A favor empresa)'
      }`,
      margin + 10,
      y + 28
    );

    y += 46;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...navy);
    doc.text('A. Fondos Entregados / Depositados:', margin, y);
    y += 6;

    if (u.userAdvances.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...slate);
      doc.text('No registra depósitos directos en este período.', margin + 10, y + 8);
      y += 18;
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Fecha', 'Motivo / Destino Declarado', 'Depositado Por', 'Estado', 'Monto']],
        body: u.userAdvances.map((adv) => [
          formatDateCL(adv.date_assigned || adv.created_at),
          adv.purpose || '-',
          'Gabriel Acuña',
          adv.status === 'closed' ? 'Cerrado / Rendido' : 'Activo',
          formatCLP(adv.initial_amount)
        ]),
        foot: [['SUBTOTAL FONDOS RECIBIDOS', '', '', '', formatCLP(u.fundsDelivered)]],
        theme: 'grid',
        headStyles: { fillColor: slate, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5, textColor: darkBlue },
        footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: 'bold', fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 65 },
          1: { cellWidth: 265 },
          2: { cellWidth: 75 },
          3: { cellWidth: 65 },
          4: { cellWidth: 70, halign: 'right' }
        }
      });
      y = doc.lastAutoTable.finalY + 12;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...navy);
    doc.text(`B. Detalle de Comprobantes y Gastos Rendidos (${u.userExpenses.length} ítems):`, margin, y);
    y += 6;

    if (u.userExpenses.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...slate);
      doc.text('No registra gastos rendidos en este período.', margin + 10, y + 8);
      y += 20;
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['#', 'Fecha', 'Proveedor', 'Glosa / Detalle', 'Doc', 'IVA', 'Total']],
        body: u.userExpenses.map((exp, idx) => [
          String(idx + 1),
          formatDateCL(exp.date || exp.created_at),
          exp.supplier_name || 'S/P',
          exp.justification || exp.description || '-',
          exp.invoice_number ? `Folio ${exp.invoice_number}` : 'S/F',
          formatCLP(exp.tax_amount || 0),
          formatCLP(exp.total_amount)
        ]),
        foot: [
          [
            '',
            '',
            '',
            'SUBTOTAL GASTOS RENDIDOS',
            '',
            formatCLP(u.userExpenses.reduce((s, e) => s + Number(e.tax_amount || 0), 0)),
            formatCLP(u.expensesSpent)
          ]
        ],
        theme: 'grid',
        headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7, textColor: darkBlue },
        footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: 'bold', fontSize: 7.5 },
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
      y = doc.lastAutoTable.finalY + 12;
    }
  }

  // SIGNATURES PAGE
  doc.addPage();
  y = drawHeader('ACTA DE REVISIÓN Y APROBACIÓN DE FONDOS');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...slate);
  doc.text(
    'Se deja constancia de la revisión y auditoría de los fondos entregados y los comprobantes rendidos por todos los funcionarios de Minerquim SpA para el período indicado. Los saldos resultantes se encuentran debidamente conciliados y respaldados.',
    margin,
    y,
    { maxWidth: contentWidth }
  );

  y += 80;
  const colW = (contentWidth - 40) / 2;
  doc.setDrawColor(148, 163, 184);

  doc.line(margin + 20, y + 40, margin + 20 + colW - 40, y + 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...darkBlue);
  doc.text('JUAN PABLO VÁSQUEZ', margin + 20 + (colW - 40) / 2, y + 54, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...slate);
  doc.text('Gerencia de Operaciones — Minerquim SpA', margin + 20 + (colW - 40) / 2, y + 64, { align: 'center' });

  doc.line(margin + colW + 40, y + 40, margin + colW + 40 + colW - 40, y + 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...darkBlue);
  doc.text('GABRIEL ACUÑA', margin + colW + 40 + (colW - 40) / 2, y + 54, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...slate);
  doc.text('Gerencia General — Minerquim SpA', margin + colW + 40 + (colW - 40) / 2, y + 64, { align: 'center' });

  drawFooter();

  const buffer = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(outFileName, buffer);

  if (fs.existsSync('C:/Users/jpvas/Desktop')) {
    fs.copyFileSync(outFileName, 'C:/Users/jpvas/Desktop/' + path.basename(outFileName));
  }
  console.log(`Generated: ${outFileName} (${buffer.length} bytes, ${doc.getNumberOfPages()} pages)`);
}

async function run() {
  await generateConsolidated({
    month: 'all',
    outFileName: 'INFORME_CONSOLIDADO_TODOS_LOS_FUNCIONARIOS_HISTORICO.pdf'
  });
  await generateConsolidated({
    month: '2026-10',
    outFileName: 'INFORME_CONSOLIDADO_TODOS_LOS_FUNCIONARIOS_OCTUBRE_2026.pdf'
  });
}

run().catch(console.error);
