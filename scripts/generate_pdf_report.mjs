import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function formatCLP(amount) {
  return '$' + Math.round(Number(amount || 0)).toLocaleString('es-CL');
}

function formatDateCL(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

async function generateReport() {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const navy = [30, 41, 59];
  const darkBlue = [15, 23, 42];
  const slate = [71, 85, 105];
  const lightBg = [248, 250, 252];
  const emerald = [16, 149, 102];
  const greenText = [5, 102, 69];

  // Helper for Header
  function drawHeader(title, subtitle) {
    // Top banner
    doc.setFillColor(...navy);
    doc.rect(margin, margin, contentWidth, 54, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text('MINERQUIM SpA', margin + 14, margin + 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(226, 232, 240);
    doc.text('SISTEMA DE GESTIÓN Y RENDICIÓN DE GASTOS', margin + 14, margin + 38);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`FECHA EMISIÓN: ${formatDateCL(new Date().toISOString())}`, pageWidth - margin - 14, margin + 30, { align: 'right' });

    // Subtitle bar
    let y = margin + 64;
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 24, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...darkBlue);
    doc.text(title, margin + 10, y + 16);

    return y + 32;
  }

  // Helper for Footer
  function drawFooter() {
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - margin - 15, pageWidth - margin, pageHeight - margin - 15);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...slate);
      doc.text('Minerquim SpA - Informe Oficial de Rendición de Cuentas y Fondos a Rendir', margin, pageHeight - margin - 5);
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - margin - 5, { align: 'right' });
    }
  }

  // ================= PAGE 1: RESUMEN EJECUTIVO =================
  let y = drawHeader('INFORME CONSOLIDADO DE RENDICIÓN DE FONDOS Y GASTOS', '');

  // Collaborator Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 52, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...slate);
  doc.text('COLABORADOR:', margin + 12, y + 18);
  doc.text('CORREO ELECTRÓNICO:', margin + 12, y + 36);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...darkBlue);
  doc.text('JUAN PABLO VÁSQUEZ', margin + 110, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.text('juanpablo.vasquezk@gmail.com', margin + 145, y + 36);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...slate);
  doc.text('DEPARTAMENTO:', margin + 330, y + 18);
  doc.text('ESTADO CUENTA:', margin + 330, y + 36);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...darkBlue);
  doc.text('Operaciones y Logística', margin + 425, y + 18);
  doc.setTextColor(...greenText);
  doc.text('Al Día / Rendido', margin + 425, y + 36);

  y += 66;

  // Overview Introduction
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...slate);
  const intro = 'El presente informe consolida los fondos depositados por la empresa y el detalle pormenorizado de los gastos efectuados y rendidos con sus respectivos comprobantes tributarios y respaldos operacionales.';
  doc.text(intro, margin, y, { maxWidth: contentWidth });
  y += 24;

  // Summary Table of Renditions
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...navy);
  doc.text('1. RESUMEN GLOBAL POR PERÍODO / FONDO', margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Período / Fondo', 'Monto Depositado', 'Total Gastado', 'Diferencia', 'Estado / Resolución']],
    body: [
      [
        'Fondos Operativos y Mantención (Oct 2026)\nCamión HZXR47, grúa, bencina, insumos',
        formatCLP(1346000),
        formatCLP(1357846),
        '+' + formatCLP(11846) + ' (A favor colab.)',
        'Cerrado y Aprobado\nReembolso emitido'
      ],
      [
        'Contingencia Transvip / Uber (Nov 2026)\n6 viajes traslado colaboradores',
        formatCLP(100000),
        formatCLP(101450),
        '+' + formatCLP(1450) + ' (A favor colab.)',
        'Cerrado y Aprobado\nReembolso emitido'
      ],
      [
        'Fondo Aplicaciones y Software (Nov 2026)\nSupabase, Google AI, Flight Radar',
        formatCLP(123000),
        formatCLP(122843),
        '-' + formatCLP(157) + ' (Saldo disponible)',
        'Activo / Conforme'
      ],
      [
        'Fondos Permisos y Vestuario (07-Oct 2026)\nPermisos providencia, ropa Torino',
        formatCLP(355000),
        formatCLP(366532),
        '+' + formatCLP(11532) + ' (A favor colab.)',
        'Liquidado y Pagado'
      ]
    ],
    foot: [
      ['TOTALES CONSOLIDADOS', formatCLP(1924000), formatCLP(1948671), '+' + formatCLP(24671) + ' a favor', 'Auditado y Cuadrado']
    ],
    theme: 'grid',
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles: { fontSize: 8, textColor: darkBlue },
    footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: 'bold', fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 170 },
      1: { cellWidth: 85, halign: 'right' },
      2: { cellWidth: 85, halign: 'right' },
      3: { cellWidth: 100, halign: 'right' },
      4: { cellWidth: 100, halign: 'center' }
    }
  });

  y = doc.lastAutoTable.finalY + 18;

  // Global Totals Box
  doc.setFillColor(236, 253, 245); // Emerald-50
  doc.setDrawColor(16, 185, 129);
  doc.roundedRect(margin, y, contentWidth, 54, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...greenText);
  doc.text('ESTADO FINANCIERO CONSOLIDADO:', margin + 14, y + 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...darkBlue);
  doc.text(`Total Fondos Entregados: ${formatCLP(1924000)}   |   Total Gastos Respaldados: ${formatCLP(1948671)}`, margin + 14, y + 38);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...greenText);
  doc.text(`Saldo a Favor Colaborador: +${formatCLP(24671)}`, pageWidth - margin - 14, y + 28, { align: 'right' });

  // Signatures on Page 1
  y += 75;
  const colW = (contentWidth - 40) / 2;

  // Signature 1: Collaborator
  doc.setDrawColor(148, 163, 184);
  doc.line(margin + 20, y + 40, margin + 20 + colW - 40, y + 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...darkBlue);
  doc.text('JUAN PABLO VÁSQUEZ', margin + 20 + (colW - 40) / 2, y + 52, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...slate);
  doc.text('Firma Colaborador / Rendidor', margin + 20 + (colW - 40) / 2, y + 62, { align: 'center' });

  // Signature 2: Approval
  doc.line(margin + colW + 40, y + 40, margin + colW + 40 + colW - 40, y + 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...darkBlue);
  doc.text('GABRIEL ACUÑA / GERENCIA', margin + colW + 40 + (colW - 40) / 2, y + 52, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...slate);
  doc.text('Aprobación y Visto Bueno Fondos', margin + colW + 40 + (colW - 40) / 2, y + 62, { align: 'center' });


  // ================= PAGE 2: RENDICIÓN OCTUBRE (FONDOS OPERATIVOS) =================
  doc.addPage();
  y = drawHeader('2. RENDICIÓN BOLSA DE FONDOS OPERATIVOS (OCTUBRE 2026)', '');

  // Subheader info: Deposited Funds
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text('A. FONDOS RECIBIDOS / DEPOSITADOS:', margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Fecha', 'Motivo / Destino Declarado', 'Depositado Por', 'Medio', 'Monto']],
    body: [
      ['23/10/2026', 'Reparación Puerta Chevrolet, reparación neumático mula, mantención camión', 'Gabriel Acuña', 'Transferencia', formatCLP(315000)],
      ['28/10/2026', '80.000 Revisión técnica camión, 240.000 mantención camión, 310.000 200 Lt bencina', 'Gabriel Acuña', 'Transferencia', formatCLP(630000)],
      ['29/10/2026', 'Diferencia Mantención camión ($295.000) y diferencia grúa ($65.500)', 'Gabriel Acuña', 'Transferencia', formatCLP(401000)]
    ],
    foot: [
      ['TOTAL RECIBIDO', '', '', '', formatCLP(1346000)]
    ],
    theme: 'grid',
    headStyles: { fillColor: slate, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: darkBlue },
    footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 65 },
      1: { cellWidth: 265 },
      2: { cellWidth: 75 },
      3: { cellWidth: 65 },
      4: { cellWidth: 70, halign: 'right' }
    }
  });

  y = doc.lastAutoTable.finalY + 12;

  // Itemized Expenses
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text('B. DETALLE PORMENORIZADO DE GASTOS EFECTUADOS (18 COMPROBANTES):', margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Fecha', 'Proveedor / Emisor', 'Glosa / Detalle del Gasto', 'Documento', 'IVA', 'Total']],
    body: [
      ['1', '19/10/2026', 'Rendición Operacional', 'Arreglo piolas camión 47', 'S/F', '$0', formatCLP(50000)],
      ['2', '19/10/2026', 'Rendición Operacional', 'Movida revisión técnica grúa naranja', 'S/F', '$0', formatCLP(40000)],
      ['3', '19/10/2026', 'DGAC', 'PCP Emilio Barros', 'Folio 470553', '$0', formatCLP(10327)],
      ['4', '19/10/2026', 'Rendición Operacional', 'Revisión técnica y gases grúa HSDW-68', 'S/F', formatCLP(4555), formatCLP(28530)],
      ['5', '20/10/2026', 'TRECK S.A.', 'Ropa de trabajo Manuel Pizarro (Nuevo)', 'Folio 3159391', formatCLP(13995), formatCLP(87652)],
      ['6', '20/10/2026', 'Autopista Acceso AMB', 'Peaje acceso vial Pudahuel Grúa HSDW-68', 'Folio 928634', formatCLP(287), formatCLP(1800)],
      ['7', '21/10/2026', 'Rendición Operacional', 'Movida revisión furgón KXRH-16', 'S/F', formatCLP(5588), formatCLP(35000)],
      ['8', '21/10/2026', 'PLÁSTICOS HADDAD S.A.', 'Contenedor 20 Lts muestra de agua', 'Folio 236502', formatCLP(1026), formatCLP(6426)],
      ['9', '22/10/2026', 'REV. TÉCNICAS SAN DÁMASO', 'Inspección técnica vehicular KXRH-16', 'Folio 7453251', formatCLP(2155), formatCLP(13500)],
      ['10', '22/10/2026', 'Google LLC', 'Suscripción Google AI Pro (5 TB)', 'Folio 78568..', '$0', formatCLP(21700)],
      ['11', '26/10/2026', 'DGAC', 'TICA Cristopher Gutiérrez', 'Folio 471258', '$0', formatCLP(10327)],
      ['12', '28/10/2026', 'JVL COMBUSTIBLES', '200 Litros de gasolina 93 octanos', 'Folio 506160', formatCLP(49307), formatCLP(308820)],
      ['13', '28/10/2026', 'GRÚA EXPRESS SpA', 'Servicio de grúa, traslado tractor Toyota', 'Folio 516', formatCLP(10450), formatCLP(65450)],
      ['14', '29/10/2026', 'DGAC', 'TICAS: Cuña, Cuevas, Lizana, Cornejo', 'Folio 471716', formatCLP(6595), formatCLP(41308)],
      ['15', '29/10/2026', 'RRC EIRL', 'M.O. Mantención de motor camión HZXR-47', 'Folio 3097', formatCLP(85500), formatCLP(535500)],
      ['16', '29/10/2026', 'IMPERIAL S.A.', 'Cinta embalaje, cinta elec., monomando', 'Folio 00162678', formatCLP(3698), formatCLP(23156)],
      ['17', '30/10/2026', 'Rendición Operacional', 'Apoyo revisión técnica HZXR-47', 'S/F', '$0', formatCLP(50000)],
      ['18', '30/10/2026', 'DEKRA Revisión Técnica', 'Inspección técnica vehicular TA2 HZXR-47', 'Folio 961831', formatCLP(4526), formatCLP(28350)]
    ],
    foot: [
      ['', '', '', 'TOTAL GASTOS RENDIDOS', '', formatCLP(187127), formatCLP(1357846)]
    ],
    theme: 'grid',
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7, textColor: darkBlue },
    footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 16, halign: 'center' },
      1: { cellWidth: 50 },
      2: { cellWidth: 124 },
      3: { cellWidth: 170 },
      4: { cellWidth: 60 },
      5: { cellWidth: 45, halign: 'right' },
      6: { cellWidth: 75, halign: 'right' }
    }
  });

  y = doc.lastAutoTable.finalY + 12;

  // Balance Box for October
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 38, 4, 4, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...slate);
  doc.text(`Total Depositado: ${formatCLP(1346000)}  -  Total Gastado: ${formatCLP(1357846)}`, margin + 12, y + 16);
  doc.text('Resolución: Reembolso emitido bajo Folio ID 1fa9abaa... por saldo a favor.', margin + 12, y + 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...greenText);
  doc.text(`SALDO A FAVOR COLABORADOR: +${formatCLP(11846)}`, pageWidth - margin - 12, y + 22, { align: 'right' });


  // ================= PAGE 3: RENDICIÓN NOVIEMBRE (UBER Y APLICACIONES) =================
  doc.addPage();
  y = drawHeader('3. RENDICIONES NOVIEMBRE 2026 (TRASLADOS Y APLICACIONES)', '');

  // Section 1: Uber
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text('A. RENDICIÓN FONDO TRASLADOS DE EMERGENCIA / UBER', margin, y);
  y += 6;

  // Deposit Info Uber
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Fecha', 'Motivo / Destino', 'Depositado Por', 'Medio', 'Monto Depositado']],
    body: [
      ['11/11/2026', 'Transvip inoperativo. Gestión de traslados Uber personal', 'Gabriel Acuña', 'Transferencia', formatCLP(100000)]
    ],
    theme: 'grid',
    headStyles: { fillColor: slate, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: darkBlue },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 260 },
      2: { cellWidth: 80 },
      3: { cellWidth: 60 },
      4: { cellWidth: 70, halign: 'right' }
    }
  });

  y = doc.lastAutoTable.finalY + 6;

  // Expenses Uber
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Fecha', 'Proveedor', 'Pasajero / Detalle del Traslado', 'Documento', 'Monto']],
    body: [
      ['1', '10/11/2026', 'UBER', 'Transporte Matías Medina', 'Comprobante Uber', formatCLP(17200)],
      ['2', '10/11/2026', 'UBER', 'Transporte Recogida Juan Colina', 'Comprobante Uber', formatCLP(16793)],
      ['3', '10/11/2026', 'UBER', 'Recogida Claudio Castro', 'Comprobante Uber', formatCLP(13679)],
      ['4', '10/11/2026', 'UBER', 'Recogida Esteban Berrios', 'Comprobante Uber', formatCLP(23397)],
      ['5', '11/11/2026', 'UBER', 'Recogida Juan Colina', 'Comprobante Uber', formatCLP(16655)],
      ['6', '11/11/2026', 'UBER', 'Recogida Claudio Castro', 'Comprobante Uber', formatCLP(13726)]
    ],
    foot: [
      ['', '', '', 'TOTAL GASTOS TRASLADOS UBER', '', formatCLP(101450)]
    ],
    theme: 'grid',
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: darkBlue },
    footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' },
      1: { cellWidth: 70 },
      2: { cellWidth: 80 },
      3: { cellWidth: 230 },
      4: { cellWidth: 70 },
      5: { cellWidth: 70, halign: 'right' }
    }
  });

  y = doc.lastAutoTable.finalY + 6;

  // Small balance box Uber
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 24, 3, 3, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...slate);
  doc.text(`Depositado: ${formatCLP(100000)}  |  Gastado: ${formatCLP(101450)}  (Reembolso generado: Folio b694c35d...)`, margin + 10, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...greenText);
  doc.text(`SALDO A FAVOR: +${formatCLP(1450)}`, pageWidth - margin - 10, y + 15, { align: 'right' });

  y += 36;

  // Section 2: Apps
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text('B. RENDICIÓN FONDO APLICACIONES TECNOLÓGICAS Y SOFTWARE', margin, y);
  y += 6;

  // Deposit Info Apps
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Fecha', 'Motivo / Destino', 'Depositado Por', 'Medio', 'Monto Depositado']],
    body: [
      ['12/11/2026', 'Pago de aplicaciones ya descontadas', 'Gabriel Acuña', 'Transferencia', formatCLP(123000)]
    ],
    theme: 'grid',
    headStyles: { fillColor: slate, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: darkBlue },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 260 },
      2: { cellWidth: 80 },
      3: { cellWidth: 60 },
      4: { cellWidth: 70, halign: 'right' }
    }
  });

  y = doc.lastAutoTable.finalY + 6;

  // Expenses Apps
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Fecha', 'Proveedor', 'Servicio / Licencia', 'Documento', 'IVA', 'Total']],
    body: [
      ['1', '05/11/2026', 'Supabase Pte. Ltd.', 'Base de datos de aplicaciones y backend', 'YNGRRR-00009', formatCLP(13846), formatCLP(86721)],
      ['2', '06/11/2026', 'Google LLC', '2500 AI Credits (Google One)', 'SOP.3339-3312..', formatCLP(4311), formatCLP(27000)],
      ['3', '12/11/2026', 'FlightRadar24', 'Suscripción App Flight Radar', 'S/F', '$0', formatCLP(9122)]
    ],
    foot: [
      ['', '', '', 'TOTAL APLICACIONES', '', formatCLP(18157), formatCLP(122843)]
    ],
    theme: 'grid',
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: darkBlue },
    footStyles: { fillColor: [241, 245, 249], textColor: navy, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' },
      1: { cellWidth: 65 },
      2: { cellWidth: 105 },
      3: { cellWidth: 165 },
      4: { cellWidth: 75 },
      5: { cellWidth: 45, halign: 'right' },
      6: { cellWidth: 65, halign: 'right' }
    }
  });

  y = doc.lastAutoTable.finalY + 6;

  // Small balance box Apps
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 24, 3, 3, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...slate);
  doc.text(`Depositado: ${formatCLP(123000)}  |  Gastado: ${formatCLP(122843)}  (Fondo ID: 2e225e38...)`, margin + 10, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...navy);
  doc.text(`SALDO DISPONIBLE EMPRESA: ${formatCLP(157)}`, pageWidth - margin - 10, y + 15, { align: 'right' });


  // Draw Page Numbers and Footers across all pages
  drawFooter();

  // Save PDF to disk
  const outputPath = path.resolve('public', 'informe_rendicion_gastos_juan_pablo_vasquez.pdf');
  const buffer = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(outputPath, buffer);

  // Also save a copy in root folder for easy access
  const rootPath = path.resolve('INFORME_RENDICION_GASTOS_JUAN_PABLO_VASQUEZ.pdf');
  fs.writeFileSync(rootPath, buffer);

  console.log(`PDF Successfully generated:`);
  console.log(`- Web public path: ${outputPath} (${buffer.length} bytes)`);
  console.log(`- Root project path: ${rootPath} (${buffer.length} bytes)`);
}

generateReport().catch(console.error);
