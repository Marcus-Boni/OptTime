"use client";

import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

/** Map path segments to display labels */
const segmentLabels: Record<string, string> = {
  dashboard: "Dashboard",
  time: "Registrar Tempo",
  timesheets: "Timesheets",
  approvals: "Aprovações",
  calendar: "Calendário",
  projects: "Projetos",
  reports: "Relatórios",
  team: "Equipe",
  export: "Exportar",
  people: "Pessoas",
  integrations: "Integrações",
  "azure-devops": "Azure DevOps",
  profile: "Perfil",
  settings: "Configurações",
  new: "Novo",
};

function isDynamicSegment(segment: string): boolean {
  return /^[a-f0-9-]{8,}$/i.test(segment);
}

export function Breadcrumb() {
  const pathname = usePathname();

  // Dashboard home
  if (pathname === "/dashboard") {
    return (
      <div className="flex items-center gap-2">
        <Home className="h-4 w-4 text-muted-foreground" />
        <span className="font-display text-sm font-semibold text-foreground">
          Dashboard
        </span>
      </div>
    );
  }

  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link
        href="/"
        className="text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Dashboard"
      >
        <Home className="h-4 w-4" />
      </Link>

      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join("/")}`;
        const isLast = index === segments.length - 1;
        const label =
          segmentLabels[segment] ??
          (isDynamicSegment(segment) ? "Detalhe" : segment);

        return (
          <Fragment key={href}>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            {isLast ? (
              <span className="font-display text-sm font-semibold text-foreground">
                {label}
              </span>
            ) : (
              <Link
                href={href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
