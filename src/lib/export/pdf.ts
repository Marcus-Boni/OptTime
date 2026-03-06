import jsPDF from "jspdf";

interface TimeEntryRow {
  date: string;
  project: string;
  description: string;
  duration: number; // minutes
  billable: boolean;
  status: string;
}

const BRAND = [249, 115, 22] as const;
const HEADER_TEXT = [255, 255, 255] as const;
const ALT_ROW = [248, 248, 248] as const;
const WHITE = [255, 255, 255] as const;
const TEXT = [30, 30, 30] as const;

function drawTable(
  doc: jsPDF,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  startX: number,
  startY: number,
  rowHeight = 8,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = startX;
  let y = startY;

  // Header row
  doc.setFillColor(...BRAND);
  doc.rect(startX, y, pageWidth - 2 * margin, rowHeight, "F");
  doc.setTextColor(...HEADER_TEXT);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  let x = startX;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x + 2, y + rowHeight - 2);
    x += colWidths[i];
  }
  y += rowHeight;

  // Data rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  for (let r = 0; r < rows.length; r++) {
    if (y + rowHeight > pageHeight - 10) {
      doc.addPage();
      y = 14;
    }
    // Alternate row background
    if (r % 2 === 1) {
      doc.setFillColor(...ALT_ROW);
    } else {
      doc.setFillColor(...WHITE);
    }
    doc.rect(startX, y, pageWidth - 2 * margin, rowHeight, "F");
    doc.setTextColor(...TEXT);
    x = startX;
    for (let i = 0; i < rows[r].length; i++) {
      const cell = (rows[r][i] ?? "").toString();
      // Truncate long text
      const maxChars = Math.floor(colWidths[i] / 2.2);
      const text =
        cell.length > maxChars ? `${cell.slice(0, maxChars - 1)}…` : cell;
      doc.text(text, x + 2, y + rowHeight - 2);
      x += colWidths[i];
    }
    y += rowHeight;
  }

  return y;
}

/**
 * Generate and download a PDF summary by project.
 */
export function exportSummaryByProjectToPDF({
  projectData,
  title = "Resumo por Projeto",
  period,
  filename = "resumo-projetos",
}: {
  projectData: {
    name: string;
    totalMinutes: number;
    billableMinutes: number;
  }[];
  title?: string;
  period?: string;
  filename?: string;
}) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEXT);
  doc.text(title, 14, 16);

  let headerY = 22;
  if (period) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(period, 14, headerY);
    headerY += 6;
  }

  const tableWidth = pageWidth - 28;
  const colWidths = [tableWidth - 90, 30, 30, 30];

  drawTable(
    doc,
    ["Projeto", "Total", "Faturável", "Não Faturável"],
    projectData.map((p) => [
      p.name,
      minutesToHours(p.totalMinutes),
      minutesToHours(p.billableMinutes),
      minutesToHours(p.totalMinutes - p.billableMinutes),
    ]),
    colWidths,
    14,
    headerY,
  );

  doc.save(`${filename}.pdf`);
}

interface TimeEntryRow {
  date: string;
  project: string;
  description: string;
  duration: number; // minutes
  billable: boolean;
  status: string;
}

function minutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function translateStatus(status: string): string {
  const map: Record<string, string> = {
    draft: "Rascunho",
    submitted: "Submetido",
    approved: "Aprovado",
    rejected: "Rejeitado",
  };
  return map[status] ?? status;
}

/**
 * Generate and download a PDF report of time entries.
 */
export function exportTimeEntriesToPDF({
  entries,
  title = "Relatório de Lançamentos",
  period,
  filename = "timesheet-export",
}: {
  entries: TimeEntryRow[];
  title?: string;
  period?: string;
  filename?: string;
}) {
  const doc = new jsPDF({ orientation: "landscape" });

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 18);

  if (period) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(period, 14, 26);
  }

  // Totals
  const totalMinutes = entries.reduce((s, e) => s + e.duration, 0);
  const billableMinutes = entries
    .filter((e) => e.billable)
    .reduce((s, e) => s + e.duration, 0);

  doc.setFontSize(10);
  doc.text(
    `Total: ${minutesToHours(totalMinutes)}  |  Faturável: ${minutesToHours(billableMinutes)}`,
    14,
    period ? 33 : 26,
  );

  const startY = period ? 38 : 32;

  // Table
  autoTable(doc, {
    startY,
    head: [["Data", "Projeto", "Descrição", "Duração", "Faturável", "Status"]],
    body: entries.map((e) => [
      e.date,
      e.project,
      e.description,
      minutesToHours(e.duration),
      e.billable ? "Sim" : "Não",
      translateStatus(e.status),
    ]),
    headStyles: {
      fillColor: [249, 115, 22], // brand orange
      textColor: 255,
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 22 },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 18, halign: "center" },
      5: { cellWidth: 22 },
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${filename}.pdf`);
}
