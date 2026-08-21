/**
 * White-label executive PDF for the Client Portal.
 *
 * One elegant page: brand band, project identity, KPI cards, budget bar and
 * the weekly-hours table. Client-side only (jsPDF), matching the visual
 * language of src/lib/export/pdf.ts without depending on its internals.
 */

import jsPDF from "jspdf";
import type { PortalSnapshot } from "@/types/hq";

const BRAND = [249, 115, 22] as const;
const INK = [17, 24, 39] as const;
const MUTED = [107, 114, 128] as const;
const SURFACE = [249, 250, 251] as const;
const BORDER = [229, 231, 235] as const;
const WHITE = [255, 255, 255] as const;
const MARGIN = 16;

function hoursLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}min`;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}min`;
}

function drawKpiCard(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
): void {
  doc.setFillColor(...SURFACE);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(x, y, width, 22, 2.5, 2.5, "FD");

  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.text(label.toUpperCase(), x + 5, y + 8);

  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.text(value, x + 5, y + 17);
}

export function exportPortalSnapshotToPDF(snapshot: PortalSnapshot): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;

  // ── Brand band ──
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 26, "F");

  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("OptSolv Time", MARGIN, 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Relatório executivo de acompanhamento", MARGIN, 18);

  const generated = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  doc.text(`Gerado em ${generated}`, pageWidth - MARGIN, 18, {
    align: "right",
  });

  // ── Project identity ──
  let y = 40;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(snapshot.projectName, MARGIN, y);

  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  const subtitleParts = [snapshot.projectCode];
  if (snapshot.clientName) subtitleParts.push(snapshot.clientName);
  if (snapshot.currentStage)
    subtitleParts.push(`Fase: ${snapshot.currentStage}`);
  doc.text(subtitleParts.join("  ·  "), MARGIN, y);

  // ── KPI cards ──
  y += 8;
  const gap = 4;
  const cardWidth = (contentWidth - gap * 3) / 4;

  drawKpiCard(
    doc,
    MARGIN,
    y,
    cardWidth,
    "Horas totais",
    hoursLabel(snapshot.totals.consumedMinutes),
  );
  drawKpiCard(
    doc,
    MARGIN + (cardWidth + gap),
    y,
    cardWidth,
    "Últimos 30 dias",
    hoursLabel(snapshot.totals.last30DaysMinutes),
  );
  drawKpiCard(
    doc,
    MARGIN + (cardWidth + gap) * 2,
    y,
    cardWidth,
    "Semanas ativas",
    String(snapshot.totals.activeWeeks),
  );
  drawKpiCard(
    doc,
    MARGIN + (cardWidth + gap) * 3,
    y,
    cardWidth,
    "Equipe",
    `${snapshot.totals.teamSize} pessoa${snapshot.totals.teamSize === 1 ? "" : "s"}`,
  );

  y += 32;

  // ── Budget bar ──
  if (snapshot.budget.visible && snapshot.budget.budgetMinutes !== null) {
    const ratio = Math.min(snapshot.budget.usageRatio ?? 0, 1);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text("Consumo do orçamento", MARGIN, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(
      `${hoursLabel(snapshot.budget.consumedMinutes)} de ${hoursLabel(snapshot.budget.budgetMinutes)} (${Math.round((snapshot.budget.usageRatio ?? 0) * 100)}%)`,
      pageWidth - MARGIN,
      y,
      { align: "right" },
    );

    y += 4;
    doc.setFillColor(...SURFACE);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(MARGIN, y, contentWidth, 5, 2, 2, "FD");
    if (ratio > 0) {
      doc.setFillColor(...BRAND);
      doc.roundedRect(
        MARGIN,
        y,
        Math.max(contentWidth * ratio, 4),
        5,
        2,
        2,
        "F",
      );
    }

    y += 14;
  }

  // ── Weekly table ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("Horas por semana", MARGIN, y);
  y += 5;

  const rowHeight = 8;
  const maxMinutes = Math.max(
    ...snapshot.weeklySeries.map((week) => week.minutes),
    1,
  );
  const barMaxWidth = contentWidth - 70;

  doc.setFontSize(8.5);
  for (const week of snapshot.weeklySeries) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(week.label, MARGIN, y + 5);

    const barWidth = Math.max((week.minutes / maxMinutes) * barMaxWidth, 0.8);
    doc.setFillColor(...SURFACE);
    doc.roundedRect(MARGIN + 30, y + 1.5, barMaxWidth, 4.5, 1.5, 1.5, "F");
    if (week.minutes > 0) {
      doc.setFillColor(...BRAND);
      doc.roundedRect(MARGIN + 30, y + 1.5, barWidth, 4.5, 1.5, 1.5, "F");
    }

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(hoursLabel(week.minutes), pageWidth - MARGIN, y + 5, {
      align: "right",
    });

    y += rowHeight;
  }

  // ── Footer ──
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...BORDER);
  doc.line(MARGIN, pageHeight - 16, pageWidth - MARGIN, pageHeight - 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(
    "Documento gerado automaticamente pelo OptSolv Time Tracker — dados ao vivo do projeto.",
    MARGIN,
    pageHeight - 10,
  );

  const filename = `OptSolv_Portal_${snapshot.projectCode || "projeto"}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
