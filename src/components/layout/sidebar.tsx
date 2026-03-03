"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Folder,
  Home,
  Layers,
  Link2,
  Pause,
  Settings,
  Square,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession } from "@/lib/auth-client";
import { MOCK_CURRENT_USER } from "@/lib/mock-data";
import { cn, formatTimerDisplay, getInitials } from "@/lib/utils";
import { useTimerStore } from "@/stores/timer.store";
import { useUIStore } from "@/stores/ui.store";
import type { User as UserType } from "@/types/user";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Registrar Tempo", href: "/dashboard/time", icon: Clock },
  { name: "Timesheets", href: "/dashboard/timesheets", icon: Layers, badge: 2 },
  { name: "Calendário", href: "/dashboard/calendar", icon: Calendar },
  { name: "Projetos", href: "/dashboard/projects", icon: Folder },
  { name: "Relatórios", href: "/dashboard/reports", icon: BarChart3 },
];

const managementNav = [
  { name: "Equipe", href: "/dashboard/people", icon: Users },
  {
    name: "Integrações",
    href: "/dashboard/integrations/azure-devops",
    icon: Link2,
  },
  { name: "Configurações", href: "/dashboard/settings", icon: Settings },
];

/** Live Timer Widget in sidebar */
function TimerWidget({ collapsed }: { collapsed: boolean }) {
  const {
    isRunning,
    isPaused,
    projectName,
    getElapsedMs,
    pause,
    resume,
    stop,
  } = useTimerStore();
  const [displayTime, setDisplayTime] = useState("00:00:00");

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setDisplayTime(formatTimerDisplay(getElapsedMs()));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, getElapsedMs]);

  if (!isRunning) return null;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 pulse-glow">
            <Image src="/logo-white.svg" alt="Timer" width={14} height={21} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="font-mono font-semibold">{displayTime}</p>
          <p className="text-xs text-muted-foreground">{projectName}</p>
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
      <p className="truncate text-xs text-muted-foreground">{projectName}</p>
      <div className="mt-2 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 flex-1 text-xs"
          onClick={isPaused ? resume : pause}
          aria-label={isPaused ? "Retomar timer" : "Pausar timer"}
        >
          <Pause className="mr-1 h-3 w-3" />
          {isPaused ? "Retomar" : "Pausar"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 flex-1 text-xs text-destructive hover:text-destructive"
          onClick={() => stop()}
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
  const { data: session } = useSession();
  const {
    sidebarCollapsed,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebarOpen,
  } = useUIStore();
  const user = (session?.user as unknown as UserType) || MOCK_CURRENT_USER;
  const isManager = user.role === "manager" || user.role === "admin";

  return (
    <TooltipProvider>
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar container */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-sidebar transition-all duration-300",
          sidebarCollapsed ? "w-[72px]" : "w-[260px]",
          mobileSidebarOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex h-16 items-center border-b border-border px-4",
            sidebarCollapsed ? "justify-center" : "justify-between",
          )}
        >
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
              <Image
                src="/logo-white.svg"
                alt="OptSolv Logo"
                width={14}
                height={21}
              />
            </div>
            {!sidebarCollapsed && (
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
            )}
          </Link>

          {/* Collapse button — desktop only */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-7 w-7 lg:flex"
            onClick={toggleSidebar}
            aria-label={
              sidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"
            }
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        <ScrollArea className="flex-1 py-3">
          {/* Active Timer Widget */}
          <TimerWidget collapsed={sidebarCollapsed} />

          {/* Main Navigation */}
          <nav className="px-2" aria-label="Navegação principal">
            <ul className="space-y-1">
              {navigation.map((item) => {
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
                    {!sidebarCollapsed && (
                      <>
                        <span className="flex-1">{item.name}</span>
                        {item.badge && (
                          <Badge
                            variant="secondary"
                            className="h-5 min-w-5 justify-center bg-brand-500 px-1.5 text-[10px] font-bold text-white"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </>
                    )}
                  </Link>
                );

                return (
                  <li key={item.href}>
                    {sidebarCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                        <TooltipContent side="right">
                          <span>{item.name}</span>
                          {item.badge && (
                            <Badge className="ml-2 h-4 bg-brand-500 text-[10px] text-white">
                              {item.badge}
                            </Badge>
                          )}
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

          {/* Manager / Admin Section */}
          {isManager && (
            <>
              <Separator className="mx-4 my-3" />
              {!sidebarCollapsed && (
                <p className="px-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  Gestão
                </p>
              )}
              <nav className="mt-1 px-2" aria-label="Navegação de gestão">
                <ul className="space-y-1">
                  {managementNav.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      pathname.startsWith(item.href + "/");
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
                        {!sidebarCollapsed && <span>{item.name}</span>}
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
          )}
        </ScrollArea>

        {/* User profile at bottom */}
        <div className="border-t border-border p-3">
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent",
              sidebarCollapsed && "justify-center px-0",
            )}
          >
            <Avatar className="h-8 w-8 shrink-0 border border-border">
              <AvatarFallback className="bg-brand-500/10 text-xs font-semibold text-brand-500">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {user.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.role}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
