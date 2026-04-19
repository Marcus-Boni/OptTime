"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Folder,
  Home,
  Lightbulb,
  Link2,
  Pause,
  Settings,
  Square,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTimer } from "@/hooks/use-timer";
import { useTimesheets } from "@/hooks/use-timesheets";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import type { User as UserType } from "@/types/user";

interface NavigationItem {
  name: string;
  href: string;
  icon: typeof Home;
  badge?: number;
}

const baseNavigation: NavigationItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Registrar Tempo", href: "/dashboard/time", icon: Clock },
  { name: "Projetos", href: "/dashboard/projects", icon: Folder },
  {
    name: "Integrações",
    href: "/dashboard/integrations",
    icon: Link2,
  },
  {
    name: "Sugestões",
    href: "/dashboard/suggestions",
    icon: Lightbulb,
  },
  {
    name: "ConfiguraÃ§Ãµes",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

const managementNav = [
  {
    name: "Aprovações",
    href: "/dashboard/timesheets/approvals",
    icon: CheckSquare,
  },
  {
    name: "Horas da Equipe",
    href: "/dashboard/team-hours",
    icon: Clock,
  },
  { name: "Equipe", href: "/dashboard/people", icon: Users },
  { name: "Configurações", href: "/dashboard/settings", icon: Settings },
];

function getPendingSubmitWeeksLabel(count: number): string {
  return count === 1
    ? "1 Semana pendente de submit"
    : `${count} Semanas pendentes de submit`;
}

function PendingSubmitWeeksBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  const label = getPendingSubmitWeeksLabel(count);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          className="h-5 min-w-5 cursor-help justify-center bg-brand-500 px-1.5 text-[10px] font-bold text-white"
          aria-label={label}
        >
          {count}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span>{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function TimerWidget({ collapsed }: { collapsed: boolean }) {
  const {
    displayTime,
    isPaused,
    hasTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    timer,
  } = useTimer();

  if (!hasTimer) return null;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="pulse-glow mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500">
            <Image src="/logo-white.svg" alt="Timer" width={14} height={21} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="font-mono font-semibold">{displayTime}</p>
          <p className="text-xs text-muted-foreground">
            {timer?.project?.name}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mx-3 mb-2 overflow-hidden rounded-xl border border-brand-500/20 bg-brand-500/5 p-3"
    >
      <div className="flex items-center gap-2 text-brand-500">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-500">
          <Image src="/logo-white.svg" alt="Logo" width={9} height={13} />
        </div>
        <span className="text-xs font-medium uppercase tracking-wider">
          Timer Ativo
        </span>
      </div>
      <p className="mt-1 font-mono text-xl font-bold text-foreground">
        {displayTime}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {timer?.project?.name}
      </p>
      <div className="mt-2 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 flex-1 text-xs"
          onClick={isPaused ? resumeTimer : pauseTimer}
          aria-label={isPaused ? "Retomar timer" : "Pausar timer"}
        >
          <Pause className="mr-1 h-3 w-3" />
          {isPaused ? "Retomar" : "Pausar"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 flex-1 text-xs text-destructive hover:text-destructive"
          onClick={() => stopTimer()}
          aria-label="Parar timer"
        >
          <Square className="mr-1 h-3 w-3" />
          Parar
        </Button>
      </div>
    </motion.div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const {
    sidebarCollapsed,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebarOpen,
  } = useUIStore();

  const user: UserType | null = isPending
    ? null
    : ((session?.user as unknown as UserType) ?? null);
  const { timesheets } = useTimesheets(undefined, {
    enabled: !isPending && !!user,
  });
  const isManager =
    !isPending && (user?.role === "manager" || user?.role === "admin");
  const pendingSubmitWeeksCount = timesheets.filter(
    (timesheet) =>
      timesheet.status === "open" || timesheet.status === "rejected",
  ).length;
  const navigation = baseNavigation.map((item) =>
    item.href === "/dashboard/time"
      ? {
          ...item,
          badge:
            pendingSubmitWeeksCount > 0 ? pendingSubmitWeeksCount : undefined,
        }
      : item,
  );
  const appNavigation: NavigationItem[] = [
    ...navigation.filter((item) => item.href !== "/dashboard/settings"),
    { name: "Configurações", href: "/dashboard/settings", icon: Settings },
  ];

  return (
    <TooltipProvider>
      <AnimatePresence>
        {mobileSidebarOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-sidebar transition-all duration-300",
          sidebarCollapsed ? "w-18" : "w-[260px]",
          mobileSidebarOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div
          className={cn(
            "relative flex h-16 items-center px-4",
            sidebarCollapsed
              ? "justify-center"
              : "justify-between border-b border-border",
          )}
        >
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 shadow-lg shadow-brand-500/20">
              <Image
                src="/logo-white.svg"
                alt="OptSolv Logo"
                width={14}
                height={21}
              />
            </div>
            {!sidebarCollapsed ? (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden"
              >
                <span className="font-display text-lg font-bold text-foreground">
                  OptSolv
                </span>
                <span className="font-display text-lg font-light text-brand-500">
                  {" "}
                  Time
                </span>
              </motion.div>
            ) : null}
          </Link>

          <Button
            variant="outline"
            size="icon"
            onClick={toggleSidebar}
            className={cn(
              "absolute z-50 hidden h-6 w-6 rounded-full border border-border bg-sidebar p-0 shadow-sm transition-all hover:bg-accent lg:flex",
              sidebarCollapsed
                ? "-right-3 top-1/2 -translate-y-1/2"
                : "relative right-0 translate-x-0",
            )}
            aria-label={
              sidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"
            }
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full py-3">
            <TimerWidget collapsed={sidebarCollapsed} />

            <nav className="px-2" aria-label="Navegação principal">
              <ul className="space-y-1">
                {appNavigation.map((item) => {
                  const isActive = pathname === item.href;
                  const linkContent = (
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-brand-500/10 text-brand-500"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        sidebarCollapsed && "justify-center px-2",
                      )}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <item.icon
                        className={cn(
                          "h-5 w-5 shrink-0",
                          isActive ? "text-brand-500" : "",
                        )}
                      />
                      {!sidebarCollapsed ? (
                        <>
                          <span className="flex-1">{item.name}</span>
                          {item.badge ? (
                            <PendingSubmitWeeksBadge count={item.badge} />
                          ) : null}
                        </>
                      ) : null}
                    </Link>
                  );

                  return (
                    <li key={item.href}>
                      {sidebarCollapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                          <TooltipContent side="right">
                            <span>{item.name}</span>
                            {item.badge ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {getPendingSubmitWeeksLabel(item.badge)}
                              </p>
                            ) : null}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        linkContent
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>

            {isManager ? (
              <>
                <Separator className="mx-4 my-3" />
                {!sidebarCollapsed ? (
                  <p className="px-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Gestão
                  </p>
                ) : null}
                <nav className="mt-1 px-2" aria-label="Navegação de gestão">
                  <ul className="space-y-1">
                    {managementNav
                      .filter((item) => item.href !== "/dashboard/settings")
                      .map((item) => {
                        const isActive =
                          pathname === item.href ||
                          pathname.startsWith(`${item.href}/`);
                        const linkContent = (
                          <Link
                            href={item.href}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                              isActive
                                ? "bg-brand-500/10 text-brand-500"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                              sidebarCollapsed && "justify-center px-2",
                            )}
                            aria-current={isActive ? "page" : undefined}
                          >
                            <item.icon
                              className={cn(
                                "h-5 w-5 shrink-0",
                                isActive ? "text-brand-500" : "",
                              )}
                            />
                            {!sidebarCollapsed ? (
                              <span>{item.name}</span>
                            ) : null}
                          </Link>
                        );

                        return (
                          <li key={item.href}>
                            {sidebarCollapsed ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {linkContent}
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  {item.name}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              linkContent
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </nav>
              </>
            ) : null}
          </ScrollArea>
        </div>

        <div className="border-t border-border p-3">
          {isPending ? (
            <div
              className={cn(
                "flex items-center gap-3 px-2 py-2",
                sidebarCollapsed && "justify-center px-0",
              )}
            >
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              {!sidebarCollapsed ? (
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-24 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
              ) : null}
            </div>
          ) : (
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent",
                sidebarCollapsed && "justify-center px-0",
              )}
            >
              <UserAvatar
                name={user?.name ?? ""}
                image={user?.image}
                size="default"
              />
              {!sidebarCollapsed ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user?.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user?.role}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
