import jsPDF from "jspdf";

interface TimeEntryRow {
  date: string;
  project: string;
  description: string;
  duration: number;
  billable: boolean;
  status: string;
}

type MetricCard = {
  label: string;
  value: string;
  meta: string;
};

type TableOptions = {
  title: string;
  description: string;
  headers: string[];
  rows: string[][];
  colWidths: number[];
  startY: number;
  rowHeight?: number;
};

const BRAND = [249, 115, 22] as const;
const BRAND_DARK = [194, 65, 12] as const;
const BRAND_SOFT = [255, 237, 213] as const;
const SURFACE = [249, 250, 251] as const;
const SURFACE_ALT = [244, 245, 247] as const;
const BORDER = [229, 231, 235] as const;
const TEXT = [17, 24, 39] as const;
const TEXT_MUTED = [107, 114, 128] as const;
const WHITE = [255, 255, 255] as const;
const PAGE_MARGIN = 14;
const FOOTER_HEIGHT = 16;
const CONTENT_BOTTOM = 284;
const CONTENT_BOTTOM_LANDSCAPE = 195;

let brandLogoDataUrlPromise: Promise<string | null> | null = null;

function minutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (h === 0) return `${m}min`;
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

function formatGeneratedAt(date = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

function ellipsizeText(doc: jsPDF, value: string, maxWidth: number): string {
  if (doc.getTextWidth(value) <= maxWidth) return value;

  const ellipsis = "...";
  let trimmed = value;

  while (trimmed.length > 1) {
    trimmed = trimmed.slice(0, -1);
    const candidate = `${trimmed}${ellipsis}`;
    if (doc.getTextWidth(candidate) <= maxWidth) return candidate;
  }

  return ellipsis;
}

function setFillColor(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setTextColor(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2]);
}

async function loadSvgAsPngDataUrl(
  path: string,
  width: number,
  height: number,
): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const response = await fetch(path);
    if (!response.ok) return null;

    const svgContent = await response.text();
    const blob = new Blob([svgContent], {
      type: "image/svg+xml;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("logo-load-failed"));
        img.src = objectUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) return null;

      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

async function getBrandLogoDataUrl() {
  if (!brandLogoDataUrlPromise) {
    brandLogoDataUrlPromise = loadSvgAsPngDataUrl("/logo-white.svg", 220, 330);
  }

  return brandLogoDataUrlPromise;
}

function drawBrandMark(
  doc: jsPDF,
  x: number,
  y: number,
  size: number,
  logoDataUrl: string | null,
) {
  setFillColor(doc, BRAND);
  doc.roundedRect(x + 1.2, y + 1.2, size - 2.4, size - 2.4, 3.2, 3.2, "F");

  if (logoDataUrl) {
    doc.addImage(
      logoDataUrl,
      "PNG",
      x + size * 0.29,
      y + size * 0.16,
      size * 0.42,
      size * 0.68,
      undefined,
      "FAST",
    );
  }
}

function drawHeader(
  doc: jsPDF,
  {
    title,
    period,
    logoDataUrl,
    landscape = false,
  }: {
    title: string;
    period?: string;
    logoDataUrl: string | null;
    landscape?: boolean;
  },
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const heroHeight = landscape ? 44 : 54;

  setFillColor(doc, BRAND);
  doc.rect(0, 0, pageWidth, heroHeight, "F");

  setFillColor(doc, BRAND_DARK);
  doc.rect(0, heroHeight - 4, pageWidth, 4, "F");

  drawBrandMark(doc, PAGE_MARGIN, 9, 16, logoDataUrl);

  setTextColor(doc, WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("OptSolv", PAGE_MARGIN + 21, 17);

  doc.setFont("helvetica", "normal");
  doc.text("Time", PAGE_MARGIN + 36.5, 17);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(title, PAGE_MARGIN, landscape ? 31 : 35);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(
    period ?? "Período personalizado",
    PAGE_MARGIN,
    landscape ? 40 : 45.5,
  );

  doc.setFontSize(9);
  const generatedLabel = ``;
  const generatedWidth = doc.getTextWidth(generatedLabel);
  doc.text(generatedLabel, pageWidth - PAGE_MARGIN - generatedWidth, 17);

  return heroHeight + 12;
}

function drawMetricCards(
  doc: jsPDF,
  metrics: MetricCard[],
  startY: number,
  columns: 2 | 4,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 6;
  const cardHeight = columns === 4 ? 22 : 24;
  const rows = Math.ceil(metrics.length / columns);
  const cardWidth =
    (pageWidth - PAGE_MARGIN * 2 - gap * (columns - 1)) / columns;

  doc.setLineWidth(0.2);
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);

  metrics.forEach((metric, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = PAGE_MARGIN + column * (cardWidth + gap);
    const y = startY + row * (cardHeight + gap);

    setFillColor(doc, SURFACE);
    doc.roundedRect(x, y, cardWidth, cardHeight, 3.5, 3.5, "FD");

    setFillColor(doc, BRAND_SOFT);
    doc.roundedRect(x, y, 2.6, cardHeight, 2.6, 2.6, "F");

    setTextColor(doc, TEXT_MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(metric.label.toUpperCase(), x + 5, y + 6.5);

    setTextColor(doc, TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(columns === 4 ? 14 : 15);
    doc.text(metric.value, x + 5, y + 14);

    setTextColor(doc, TEXT_MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      ellipsizeText(doc, metric.meta, cardWidth - 10),
      x + 5,
      y + cardHeight - 4.5,
    );
  });

  return startY + rows * cardHeight + (rows - 1) * gap;
}

function drawSectionHeader(
  doc: jsPDF,
  title: string,
  description: string,
  y: number,
) {
  setTextColor(doc, TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, PAGE_MARGIN, y);

  setTextColor(doc, TEXT_MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(description, 120);
  doc.text(lines, PAGE_MARGIN, y + 5.5);

  return y + 12;
}

function drawTable(
  doc: jsPDF,
  {
    title,
    description,
    headers,
    rows,
    colWidths,
    startY,
    rowHeight = 8.5,
  }: TableOptions,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomLimit =
    pageWidth > pageHeight ? CONTENT_BOTTOM_LANDSCAPE : CONTENT_BOTTOM;
  const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
  let y = drawSectionHeader(doc, title, description, startY);

  const drawHeaderRow = () => {
    setFillColor(doc, BRAND_DARK);
    doc.roundedRect(PAGE_MARGIN, y, tableWidth, rowHeight, 2.5, 2.5, "F");

    setTextColor(doc, WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);

    let x = PAGE_MARGIN;
    headers.forEach((header, index) => {
      doc.text(header, x + 2.5, y + rowHeight - 3);
      x += colWidths[index];
    });

    y += rowHeight + 1.5;
  };

  drawHeaderRow();

  rows.forEach((row, rowIndex) => {
    const isTotalRow = rowIndex === rows.length - 1 && row[0] === "TOTAL";

    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = 18;
      drawHeaderRow();
    }

    setFillColor(
      doc,
      isTotalRow ? BRAND_SOFT : rowIndex % 2 === 0 ? WHITE : SURFACE_ALT,
    );
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.roundedRect(PAGE_MARGIN, y, tableWidth, rowHeight, 2, 2, "FD");

    setTextColor(doc, TEXT);
    doc.setFont("helvetica", isTotalRow ? "bold" : "normal");
    doc.setFontSize(8.5);

    let x = PAGE_MARGIN;
    row.forEach((cell, cellIndex) => {
      const paddedWidth = colWidths[cellIndex] - 5;
      const content = ellipsizeText(doc, `${cell ?? ""}`, paddedWidth);
      doc.text(content, x + 2.5, y + rowHeight - 3);
      x += colWidths[cellIndex];
    });

    y += rowHeight + 1.5;
  });

  return y;
}

function drawFooter(
  doc: jsPDF,
  {
    title,
    generatedAt,
  }: {
    title: string;
    generatedAt: string;
  },
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);

    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.25);
    doc.line(
      PAGE_MARGIN,
      pageHeight - FOOTER_HEIGHT,
      pageWidth - PAGE_MARGIN,
      pageHeight - FOOTER_HEIGHT,
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setTextColor(doc, TEXT_MUTED);

    doc.text("OptSolv Time", PAGE_MARGIN, pageHeight - 9);

    const titleWidth = doc.getTextWidth(title);
    doc.text(title, pageWidth / 2 - titleWidth / 2, pageHeight - 9);

    const rightLabel = `Página ${page} de ${totalPages}`;
    const rightLabelWidth = doc.getTextWidth(rightLabel);
    doc.text(
      rightLabel,
      pageWidth - PAGE_MARGIN - rightLabelWidth,
      pageHeight - 9,
    );

    doc.setFontSize(7.5);
    const generatedLabel = `Gerado em ${generatedAt}`;
    const generatedWidth = doc.getTextWidth(generatedLabel);
    doc.text(
      generatedLabel,
      pageWidth - PAGE_MARGIN - generatedWidth,
      pageHeight - 4.5,
    );
  }
}

function createSummaryMetrics(
  projectData: {
    totalMinutes: number;
    billableMinutes: number;
    entryCount: number;
  }[],
  totalMinutes: number,
  billableMinutes: number,
) {
  const nonBillableMinutes = Math.max(totalMinutes - billableMinutes, 0);
  const billableRate =
    totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;
  const totalEntries = projectData.reduce(
    (sum, project) => sum + project.entryCount,
    0,
  );

  return [
    {
      label: "Horas totais",
      value: minutesToHours(totalMinutes),
      meta: `${projectData.length} projetos no período`,
    },
    {
      label: "Taxa faturável",
      value: `${billableRate}%`,
      meta: `${minutesToHours(billableMinutes)} faturáveis`,
    },
    {
      label: "Horas não faturáveis",
      value: minutesToHours(nonBillableMinutes),
      meta: "Tempo interno, ajustes e apoio operacional",
    },
    {
      label: "Lançamentos",
      value: `${totalEntries}`,
      meta: "Volume total consolidado na exportação",
    },
  ] satisfies MetricCard[];
}

function createTimeEntryMetrics(entries: TimeEntryRow[]) {
  const totalMinutes = entries.reduce((sum, entry) => sum + entry.duration, 0);
  const billableMinutes = entries
    .filter((entry) => entry.billable)
    .reduce((sum, entry) => sum + entry.duration, 0);
  const nonBillableMinutes = Math.max(totalMinutes - billableMinutes, 0);
  const uniqueProjects = new Set(entries.map((entry) => entry.project)).size;

  return {
    totalMinutes,
    billableMinutes,
    metrics: [
      {
        label: "Horas totais",
        value: minutesToHours(totalMinutes),
        meta: `${entries.length} lançamentos exportados`,
      },
      {
        label: "Horas faturáveis",
        value: minutesToHours(billableMinutes),
        meta: `${
          totalMinutes > 0
            ? Math.round((billableMinutes / totalMinutes) * 100)
            : 0
        }% do tempo no período`,
      },
      {
        label: "Horas não faturáveis",
        value: minutesToHours(nonBillableMinutes),
        meta: "Tempo administrativo e apoio interno",
      },
      {
        label: "Projetos cobertos",
        value: `${uniqueProjects}`,
        meta: "Projetos distintos presentes no relatório",
      },
    ] satisfies MetricCard[],
  };
}

function configureDocument(doc: jsPDF, title: string) {
  doc.setProperties({
    title,
    author: "OptSolv Time",
    creator: "OptSolv Time",
    subject: title,
    keywords: "OptSolv Time, relatório, horas, produtividade",
  });
}

export async function exportSummaryByProjectToPDF({
  projectData,
  title = "Relatório de horas",
  period,
  filename = "resumo-projetos",
  totalMinutes,
  billableMinutes,
}: {
  projectData: {
    projectName: string;
    totalMinutes: number;
    billableMinutes: number;
    entryCount: number;
  }[];
  title?: string;
  period?: string;
  filename?: string;
  totalMinutes?: number;
  billableMinutes?: number;
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const generatedAt = formatGeneratedAt();
  const logoDataUrl = await getBrandLogoDataUrl();
  const grandTotal =
    totalMinutes ??
    projectData.reduce((sum, project) => sum + project.totalMinutes, 0);
  const grandBillable =
    billableMinutes ??
    projectData.reduce((sum, project) => sum + project.billableMinutes, 0);

  configureDocument(doc, title);

  let y = drawHeader(doc, {
    title,
    period,
    logoDataUrl,
  });

  y = drawMetricCards(
    doc,
    createSummaryMetrics(projectData, grandTotal, grandBillable),
    y,
    2,
  );
  y += 10;

  const tableWidth = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
  const colWidths = [tableWidth - 101, 25, 27, 27, 22];
  const rows = projectData.map((project) => [
    project.projectName,
    minutesToHours(project.totalMinutes),
    minutesToHours(project.billableMinutes),
    minutesToHours(project.totalMinutes - project.billableMinutes),
    String(project.entryCount),
  ]);

  rows.push([
    "TOTAL",
    minutesToHours(grandTotal),
    minutesToHours(grandBillable),
    minutesToHours(Math.max(grandTotal - grandBillable, 0)),
    String(projectData.reduce((sum, project) => sum + project.entryCount, 0)),
  ]);

  drawTable(doc, {
    title: "Resumo por projeto",
    description:
      "Visão consolidada com horas totais, recorte faturável e volume de lançamentos para apoiar acompanhamento e compartilhamento executivo.",
    headers: ["Projeto", "Total", "Faturável", "Não faturável", "Lançamentos"],
    rows,
    colWidths,
    startY: y,
    rowHeight: 9,
  });

  drawFooter(doc, { title: "", generatedAt });
  doc.save(`${filename}.pdf`);
}

export async function exportTimeEntriesToPDF({
  entries,
  title = "Relatório de lançamentos",
  period,
  filename = "timesheet-export",
}: {
  entries: TimeEntryRow[];
  title?: string;
  period?: string;
  filename?: string;
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const generatedAt = formatGeneratedAt();
  const logoDataUrl = await getBrandLogoDataUrl();
  const { totalMinutes, billableMinutes, metrics } =
    createTimeEntryMetrics(entries);

  configureDocument(doc, title);

  let y = drawHeader(doc, {
    title,
    period,
    logoDataUrl,
    landscape: true,
  });

  y = drawMetricCards(doc, metrics, y, 4);
  y += 9;

  const tableWidth = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
  const colWidths = [23, 53, tableWidth - 23 - 53 - 30 - 24 - 26, 30, 24, 26];

  const rows = entries.map((entry) => [
    entry.date,
    entry.project,
    entry.description,
    minutesToHours(entry.duration),
    entry.billable ? "Sim" : "Não",
    translateStatus(entry.status),
  ]);

  rows.push([
    "",
    "",
    "TOTAL",
    minutesToHours(totalMinutes),
    minutesToHours(billableMinutes),
    "",
  ]);

  drawTable(doc, {
    title: "Lançamentos detalhados",
    description:
      "Exportação detalhada para auditoria operacional, conferência individual de registros e compartilhamento com liderança ou clientes.",
    headers: ["Data", "Projeto", "Descrição", "Duração", "Faturável", "Status"],
    rows,
    colWidths,
    startY: y,
    rowHeight: 8.2,
  });

  drawFooter(doc, { title: "", generatedAt });
  doc.save(`${filename}.pdf`);
}
