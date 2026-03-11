import { useCallback, useEffect, useRef, useState } from "react";
import logoUrl from "../../assets/logo-white.svg";
import {
  createTimeEntry,
  getProjects,
  getTimer,
  getWorkItemTimeEntries,
  startTimer,
  stopTimer,
} from "../../shared/api";
import type { IFormServiceSubset } from "../../shared/api";
import { clearCredentials } from "../../shared/auth";
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
  // Store a stable ref to the last refresh time so the poll can skip if a
  // programmatic refresh just happened (avoids 5s blank wait after Start/Stop).
  const lastRefreshTs = useRef(0);

  const refresh = useCallback(async () => {
    lastRefreshTs.current = Date.now();
    try {
      // Run timer + projects in parallel; WI entries only if we have an ID
      const [timerData, projectList] = await Promise.all([
        getTimer(),
        getProjects(),
      ]);
      setTimer(timerData);
      setProjects(projectList);

      if (workItemId) {
        const wiData = await getWorkItemTimeEntries(workItemId);
        setData(wiData);
      }
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
    const newTimer = await startTimer(payload);
    // Optimistic: apply the new timer state instantly, then do a full refresh
    setTimer(newTimer);
    await refresh();
  }

  async function handleTimerStop(): Promise<void> {
    await stopTimer();
    // Optimistic: clear timer immediately, then refresh for accurate data
    setTimer(null);
    await refresh();
  }

  if (loading) {
    return (
      <div style={s.center}>
        <div style={s.spinner} />
      </div>
    );
  }

  const totalHours = data ? minutesToHours(data.totalMinutes) : "--";
  const myHours = data ? minutesToHours(data.myMinutes) : "--";
  const entryCount = data?.entries.length ?? 0;

  // Timer running for THIS work item
  const isTimerActive =
    timer !== null && timer.azureWorkItemId === workItemId;

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

      {/* ── Work item title ─────────────────────────────────────── */}
      {workItemTitle && (
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

      {/* ── Stats row ───────────────────────────────────────────── */}
      <div style={s.statsRow}>
        <Stat label="Total" value={totalHours} />
        <Stat label="Minhas horas" value={myHours} />
        <Stat
          label="Timer"
          value={timer ? elapsedLabel(timer) : "—"}
          highlight={isTimerActive}
        />
      </div>

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
                <span
                  style={s.timerDot}
                  aria-label="Timer ativo"
                />
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
          tab === "log" ? "tab-log" : tab === "timer" ? "tab-timer" : "tab-history"
        }
      >
        {tab === "log" && (
          <QuickLogForm
            projects={projects}
            workItemId={workItemId}
            workItemTitle={workItemTitle}
            devOpsProjectName={devOpsProjectName}
            devOpsBaseUrl={devOpsBaseUrl}
            formService={formService}
            onCreated={async () => {
              await refresh();
              setTab("history");
            }}
            onCreateEntry={createTimeEntry}
          />
        )}

        {tab === "timer" && (
          <TimerControl
            timer={timer}
            projects={projects}
            workItemId={workItemId}
            workItemTitle={workItemTitle}
            devOpsProjectName={devOpsProjectName}
            onStart={handleTimerStart}
            onStop={handleTimerStop}
          />
        )}

        {tab === "history" && (
          <TimeEntriesList
            entries={data?.entries ?? []}
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

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={s.statCard}>
      <div style={s.statLabel}>{label}</div>
      <div
        style={{
          ...s.statValue,
          color: highlight ? "var(--brand)" : "var(--text)",
        }}
      >
        {value}
      </div>
    </div>
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

function minutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function elapsedLabel(timer: ActiveTimer): string {
  const now = Date.now();
  const start = new Date(timer.startedAt).getTime();
  const elapsed = timer.pausedAt
    ? timer.accumulatedMs
    : timer.accumulatedMs + (now - start);
  const totalSecs = Math.floor(Math.max(0, elapsed) / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const sec = totalSecs % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
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
  statsRow: { display: "flex", gap: 6 },
  statCard: {
    flex: 1,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "7px 8px",
  },
  statLabel: {
    fontSize: 9,
    color: "var(--muted)",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  statValue: {
    fontSize: 13,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
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
