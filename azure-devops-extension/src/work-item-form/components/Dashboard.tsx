import { useCallback, useEffect, useRef, useState } from "react";
import logoUrl from "../../assets/logo-white.svg";
import type { IFormServiceSubset } from "../../shared/api";
import {
  createTimeEntry,
  getProjects,
  getTimer,
  getWorkItemTimeEntries,
  startTimer,
  stopTimer,
} from "../../shared/api";
import { clearCredentials } from "../../shared/auth";
import { getVisibleProjects } from "../../shared/project-filtering";
import { matchProjectFromDevOpsContext } from "../../shared/project-matching";
import type {
  ActiveTimer,
  Project,
  WorkItemTimeData,
} from "../../shared/types";
import { QuickLogForm } from "./QuickLogForm";
import { TimeEntriesList } from "./TimeEntriesList";
import { TimerControl } from "./TimerControl";

interface DashboardProps {
  workItemId: number | null;
  workItemTitle: string;
  /** DevOps project name extracted from SDK context, used to auto-select project */
  devOpsProjectName: string;
  devOpsBaseUrl: string;
  formService: IFormServiceSubset | null;
  onLogout: () => void;
}

type Tab = "log" | "timer" | "history";

function emptyWorkItemData(workItemId: number | null): WorkItemTimeData {
  return {
    workItemId: workItemId ?? 0,
    totalMinutes: 0,
    myMinutes: 0,
    entries: [],
  };
}

export function Dashboard({
  workItemId,
  workItemTitle,
  devOpsProjectName,
  devOpsBaseUrl,
  formService,
  onLogout,
}: DashboardProps) {
  const [tab, setTab] = useState<Tab>("log");
  const [data, setData] = useState<WorkItemTimeData | null>(null);
  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // ── Description is kept here so it survives tab switches ──────────────────
  const [sharedDescription, setSharedDescription] = useState("");

  // Store a stable ref to the last refresh time so the poll can skip if a
  // programmatic refresh just happened (avoids 5s blank wait after Start/Stop).
  const lastRefreshTs = useRef(0);

  const refresh = useCallback(async () => {
    lastRefreshTs.current = Date.now();
    try {
      const [timerData, projectList, workItemData] = await Promise.all([
        getTimer(),
        getProjects(),
        workItemId
          ? getWorkItemTimeEntries(workItemId)
          : Promise.resolve(emptyWorkItemData(workItemId)),
      ]);
      setTimer(timerData);
      setProjects(projectList);
      setData(workItemData);
      setError(null);
    } catch (err) {
      console.error("[OptSolv] refresh error:", err);
      setError("Não foi possível carregar os dados.");
    } finally {
      setLoading(false);
    }
  }, [workItemId]);

  // Initial load
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Tick every second to keep the timer display up to date locally (no API call)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Background poll every 5s — skip if we just did a programmatic refresh
  useEffect(() => {
    const interval = setInterval(() => {
      const msSinceRefresh = Date.now() - lastRefreshTs.current;
      if (msSinceRefresh > 3000) {
        void refresh();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  function handleLogout() {
    clearCredentials();
    onLogout();
  }

  function handleTabKey(e: React.KeyboardEvent, next: Tab) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setTab(next);
    }
  }

  /**
   * Optimistic timer start — immediately show the timer in the stats row
   * without waiting for the next refresh cycle.
   */
  async function handleTimerStart(
    payload: Parameters<typeof startTimer>[0],
  ): Promise<void> {
    const previousTimer = timer;
    const selectedProject = projects.find(
      (project) => project.id === payload.projectId,
    );

    setTimer({
      id: `optimistic-${Date.now()}`,
      projectId: payload.projectId,
      description: payload.description ?? "",
      billable: payload.billable ?? true,
      azureWorkItemId: payload.azureWorkItemId ?? null,
      azureWorkItemTitle: payload.azureWorkItemTitle ?? null,
      startedAt: new Date().toISOString(),
      pausedAt: null,
      accumulatedMs: 0,
      project: selectedProject ?? {
        id: payload.projectId,
        name: "Projeto",
        code: "",
        color: "#f97316",
      },
    });

    try {
      const newTimer = await startTimer(payload);
      setTimer(newTimer);
      await refresh();
    } catch (error) {
      setTimer(previousTimer);
      throw error;
    }
  }

  async function handleTimerStop(): Promise<void> {
    const previousTimer = timer;
    setTimer(null);

    try {
      await stopTimer();
      await refresh();
    } catch (error) {
      setTimer(previousTimer);
      throw error;
    }
  }

  if (loading) {
    return (
      <div style={s.center}>
        <div style={s.spinner} />
      </div>
    );
  }

  const workItemData = data ?? emptyWorkItemData(workItemId);
  const entryCount = workItemData.entries.length;

  // Timer running for THIS work item
  const isTimerActive = timer !== null && timer.azureWorkItemId === workItemId;

  // Derive visible (non-hidden) projects from the full list
  const visibleProjects = getVisibleProjects(projects);

  // isProjectAutoSelected is true ONLY when a real name/code match was found
  // between the DevOps project name and an OptSolv project.
  // A generic first-project fallback does NOT count as auto-selected.
  const { isMatched: isProjectAutoSelected } = matchProjectFromDevOpsContext(
    visibleProjects,
    devOpsProjectName,
  );

  return (
    <div style={s.container}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={s.header}>
        <div style={s.brandRow}>
          <Logo />
          <span style={s.brandName}>OptSolv</span>
        </div>
        <button
          style={s.logoutBtn}
          type="button"
          onClick={handleLogout}
          title="Desconectar"
          aria-label="Desconectar da extensão"
        >
          ✕
        </button>
      </div>

      {/* ── Work item title — hidden when project context is already known ── */}
      {workItemTitle && !isProjectAutoSelected && (
        <div style={s.wiTitle} title={workItemTitle}>
          {workItemTitle}
        </div>
      )}

      {error && (
        <div style={s.errorBox} role="alert">
          {error}{" "}
          <button
            type="button"
            style={s.retryBtn}
            onClick={() => void refresh()}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <div style={s.tabs} role="tablist" aria-label="Modos de registro">
        <TabButton
          id="tab-log"
          label="Registro Manual"
          active={tab === "log"}
          onClick={() => setTab("log")}
          onKeyDown={(e) => handleTabKey(e, "log")}
        />
        <TabButton
          id="tab-timer"
          label={
            isTimerActive ? (
              <>
                <span style={s.timerDot} aria-label="Timer ativo" />
                Timer
              </>
            ) : (
              "Timer"
            )
          }
          active={tab === "timer"}
          onClick={() => setTab("timer")}
          onKeyDown={(e) => handleTabKey(e, "timer")}
        />
        <TabButton
          id="tab-history"
          label={entryCount > 0 ? `Histórico (${entryCount})` : "Histórico"}
          active={tab === "history"}
          onClick={() => setTab("history")}
          onKeyDown={(e) => handleTabKey(e, "history")}
        />
      </div>

      {/* ── Tab panels ──────────────────────────────────────────── */}
      <div
        role="tabpanel"
        aria-labelledby={
          tab === "log"
            ? "tab-log"
            : tab === "timer"
              ? "tab-timer"
              : "tab-history"
        }
      >
        {tab === "log" && (
          <QuickLogForm
            projects={visibleProjects}
            allProjects={projects}
            workItemId={workItemId}
            workItemTitle={workItemTitle}
            devOpsProjectName={devOpsProjectName}
            devOpsBaseUrl={devOpsBaseUrl}
            formService={formService}
            isProjectAutoSelected={isProjectAutoSelected}
            description={sharedDescription}
            onDescriptionChange={setSharedDescription}
            onCreated={async () => {
              setSharedDescription("");
              await refresh();
              setTab("history");
            }}
            onCreateEntry={createTimeEntry}
            onProjectsChanged={() => void refresh()}
          />
        )}

        {tab === "timer" && (
          <TimerControl
            timer={timer}
            projects={visibleProjects}
            allProjects={projects}
            workItemId={workItemId}
            workItemTitle={workItemTitle}
            devOpsProjectName={devOpsProjectName}
            isProjectAutoSelected={isProjectAutoSelected}
            onStart={handleTimerStart}
            onStop={handleTimerStop}
            onProjectsChanged={() => void refresh()}
          />
        )}

        {tab === "history" && (
          <TimeEntriesList
            entries={workItemData.entries}
            devOpsBaseUrl={devOpsBaseUrl}
            workItemId={workItemId}
            onRefresh={refresh}
          />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabButton({
  id,
  label,
  active,
  onClick,
  onKeyDown,
}: {
  id: string;
  label: React.ReactNode;
  active: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <button
      id={id}
      role="tab"
      aria-selected={active}
      style={active ? { ...s.tab, ...s.tabActive } : s.tab}
      type="button"
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={active ? 0 : -1}
    >
      {label}
    </button>
  );
}

function Logo() {
  return (
    <div
      style={{
        background: "var(--brand)",
        borderRadius: "6px",
        width: 20,
        height: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 4px rgba(249,115,22,0.3)",
        flexShrink: 0,
      }}
    >
      <img src={logoUrl} alt="" width={12} height={12} />
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { padding: 14, display: "flex", flexDirection: "column", gap: 10 },
  center: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: 120,
  },
  spinner: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    border: "2px solid rgba(249,115,22,0.2)",
    borderTopColor: "var(--brand)",
    animation: "spin 0.8s linear infinite",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: { display: "flex", alignItems: "center", gap: 6 },
  brandName: { fontWeight: 700, fontSize: 13, color: "var(--text)" },
  logoutBtn: {
    background: "none",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: 13,
    padding: "2px 4px",
    lineHeight: 1,
  },
  wiTitle: {
    fontSize: 11,
    color: "var(--muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "5px 8px",
  },
  errorBox: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "var(--radius)",
    padding: "8px 10px",
    color: "var(--red)",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  retryBtn: {
    background: "none",
    border: "1px solid rgba(239,68,68,0.4)",
    borderRadius: 4,
    color: "var(--red)",
    fontSize: 11,
    cursor: "pointer",
    padding: "2px 8px",
    flexShrink: 0,
  },
  tabs: {
    display: "flex",
    gap: 2,
    borderBottom: "1px solid var(--border)",
    paddingBottom: 6,
  },
  tab: {
    background: "none",
    border: "none",
    padding: "4px 10px",
    borderRadius: "6px 6px 0 0",
    fontSize: 12,
    cursor: "pointer",
    color: "var(--muted)",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 5,
    transition: "color 0.15s, background 0.15s",
    minHeight: 28,
  },
  tabActive: {
    background: "rgba(249,115,22,0.12)",
    color: "var(--brand)",
    fontWeight: 700,
  },
  timerDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--green)",
    animation: "pulse 1.5s ease-in-out infinite",
    flexShrink: 0,
  },
};
