import * as XLSX from "xlsx";

interface TimeEntryRow {
  date: string;
  project: string;
  description: string;
  duration: number; // minutes
  billable: boolean;
  status: string;
  azureWorkItemId?: number | null;
  azureWorkItemTitle?: string | null;
}

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Generate and download an Excel (.xlsx) file of time entries.
 */
export function exportTimeEntriesToExcel(
  entries: TimeEntryRow[],
  filename = "timesheet-export",
) {
  const rows = entries.map((e) => ({
    Data: e.date,
    Projeto: e.project,
    Descrição: e.description,
    Horas: minutesToHours(e.duration),
    Faturável: e.billable ? "Sim" : "Não",
    Status: translateStatus(e.status),
    "Work Item ID": e.azureWorkItemId ?? "",
    "Work Item Título": e.azureWorkItemTitle ?? "",
  }));

  // Totals row
  const totalHours = minutesToHours(
    entries.reduce((sum, e) => sum + e.duration, 0),
  );
  const billableHours = minutesToHours(
    entries.filter((e) => e.billable).reduce((sum, e) => sum + e.duration, 0),
  );
  rows.push({
    Data: "",
    Projeto: "",
    Descrição: "TOTAL",
    Horas: totalHours,
    Faturável: `${billableHours}h faturável`,
    Status: "",
    "Work Item ID": "",
    "Work Item Título": "",
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 36 },
    { wch: 8 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 30 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");

  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Group entries by project and generate an Excel summary.
 */
export function exportSummaryByProjectToExcel(
  projectData: {
    name: string;
    totalMinutes: number;
    billableMinutes: number;
  }[],
  filename = "resumo-projetos",
) {
  const rows = projectData.map((p) => ({
    Projeto: p.name,
    "Total (h)": minutesToHours(p.totalMinutes),
    "Faturável (h)": minutesToHours(p.billableMinutes),
    "Não Faturável (h)": minutesToHours(p.totalMinutes - p.billableMinutes),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resumo por Projeto");
  XLSX.writeFile(wb, `${filename}.xlsx`);
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
