import { useEffect, useState } from "react";
import type { StartTimerPayload } from "../../shared/api";
import {
  getHiddenProjectIds,
  hideProject,
  showProject,
} from "../../shared/project-filtering";
import { matchProjectFromDevOpsContext } from "../../shared/project-matching";
import type { ActiveTimer, Project } from "../../shared/types";

interface TimerControlProps {
  timer: ActiveTimer | null;
  projects: Project[];
  /** Full project list (visible + hidden) — used in the manage panel */
  allProjects: Project[];
  workItemId: number | null;
  workItemTitle: string;
  /** DevOps project name — used to auto-select the matching OptSolv project */
  devOpsProjectName: string;
  /** Whether the project was already matched to the current DevOps context */
  isProjectAutoSelected: boolean;
  onStart: (payload: Omit<StartTimerPayload, "action">) => Promise<void>;
  onStop: () => Promise<void>;
  /** Called after the user hides/shows a project so the project list can reload */
  onProjectsChanged: () => void;
}

export function TimerControl({
  timer,
  projects,
  allProjects,
  workItemId,
  workItemTitle,
  devOpsProjectName,
  isProjectAutoSelected,
  onStart,
  onStop,
  onProjectsChanged,
}: TimerControlProps) {
  // Falls back to first available project when no match is found (user must pick).
  const [projectId, setProjectId] = useState(() =>
    matchProjectFromDevOpsContext(projects, devOpsProjectName).projectId,
  );
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManageProjects, setShowManageProjects] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(getHiddenProjectIds);

  const isTimerForThisItem =
    timer !== null && timer.azureWorkItemId === workItemId;

  useEffect(() => {
    if (projects.length === 0) return;

    setProjectId((currentProjectId) => {
      const stillValid = projects.some(
        (project) => project.id === currentProjectId,
      );
      if (currentProjectId && stillValid) return currentProjectId;
      return matchProjectFromDevOpsContext(projects, devOpsProjectName).projectId;
    });
  }, [projects, devOpsProjectName]);

  function handleHideProject(id: string) {
    hideProject(id);
    const next = new Set(hiddenIds);
    next.add(id);
    setHiddenIds(next);
    // If the current selection was hidden, reset to the best available match
    if (projectId === id) {
      setProjectId(
        matchProjectFromDevOpsContext(projects, devOpsProjectName).projectId,
      );
    }
    onProjectsChanged();
  }

  function handleShowProject(id: string) {
    showProject(id);
    const next = new Set(hiddenIds);
    next.delete(id);
    setHiddenIds(next);
    onProjectsChanged();
  }

  async function handleStart() {
    if (!projectId) {
      setError("Selecione um projeto.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onStart({
        projectId,
        description: description || workItemTitle || "Timer",
        billable: true,
        azureWorkItemId:
          workItemId != null && workItemId > 0 ? workItemId : undefined,
        azureWorkItemTitle: workItemTitle || undefined,
      });
    } catch (err) {
      setError("Erro ao iniciar o timer.");
      console.error("[TimerControl] handleStart:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    setLoading(true);
    setError(null);
    try {
      await onStop();
    } catch (err) {
      setError("Erro ao parar o timer.");
      console.error("[TimerControl] handleStop:", err);
    } finally {
      setLoading(false);
    }
  }

  if (timer && !isTimerForThisItem) {
    // A timer is running for a different work item — show a compact notice
    return (
      <div style={s.otherTimerBox}>
        <span style={{ color: "var(--yellow)" }}>▶</span>
        Timer ativo em outro item —{" "}
        <button
          type="button"
          style={s.textBtn}
          onClick={handleStop}
          disabled={loading}
        >
          parar
        </button>
      </div>
    );
  }

  if (isTimerForThisItem) {
    // Timer is running for THIS work item
    return (
      <div style={s.activeBox}>
        <div style={s.activeRow}>
          <PulsingDot />
          <span style={{ color: "var(--green)", fontWeight: 600 }}>
            Timer em execução
          </span>
        </div>
        <div style={s.activeDesc}>{timer.description || "(sem descrição)"}</div>
        {error && <div style={s.errorMsg}>{error}</div>}
        <button
          type="button"
          style={loading ? { ...s.stopBtn, opacity: 0.5 } : s.stopBtn}
          onClick={handleStop}
          disabled={loading}
        >
          ⏹ Parar e Salvar
        </button>
      </div>
    );
  }

  // No timer running — show start form
  return (
    <div style={s.startBox}>
      {/* ── Project selector (hidden when auto-selected in PBI context) ── */}
      {projects.length > 0 && !isProjectAutoSelected && (
        <div style={s.projectRow}>
          <div style={s.labelRow}>
            <label style={s.label} htmlFor="tc-projectId">
              Projeto
            </label>
            <button
              type="button"
              style={s.manageBtn}
              onClick={() => setShowManageProjects((v) => !v)}
              aria-expanded={showManageProjects}
              aria-label="Gerenciar visibilidade de projetos"
              title="Ocultar projetos inativos do seletor"
            >
              {showManageProjects ? "← Voltar" : "Gerenciar"}
            </button>
          </div>

          {showManageProjects ? (
            <ManageProjectsPanel
              allProjects={allProjects}
              hiddenIds={hiddenIds}
              onHide={handleHideProject}
              onShow={handleShowProject}
            />
          ) : (
            <select
              id="tc-projectId"
              style={s.select}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={loading}
              aria-label="Selecionar projeto"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <input
        style={s.input}
        type="text"
        placeholder="Descrição (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={loading}
        aria-label="Descrição do timer (opcional)"
      />

      {error && <div style={s.errorMsg}>{error}</div>}

      <button
        type="button"
        style={
          loading || !projectId ? { ...s.startBtn, opacity: 0.5 } : s.startBtn
        }
        onClick={handleStart}
        disabled={loading || !projectId}
      >
        ▶ Iniciar Timer
      </button>
    </div>
  );
}

// ── ManageProjectsPanel ───────────────────────────────────────────────────────

interface ManageProjectsPanelProps {
  allProjects: Project[];
  hiddenIds: Set<string>;
  onHide: (id: string) => void;
  onShow: (id: string) => void;
}

function ManageProjectsPanel({
  allProjects,
  hiddenIds,
  onHide,
  onShow,
}: ManageProjectsPanelProps) {
  return (
    <div style={mp.panel} role="list" aria-label="Gerenciar projetos">
      {allProjects.length === 0 && (
        <p style={mp.empty}>Nenhum projeto encontrado.</p>
      )}
      {allProjects.map((p) => {
        const isHidden = hiddenIds.has(p.id);
        return (
          <div key={p.id} style={mp.row} role="listitem">
            <span style={mp.dot} aria-hidden="true">
              <svg width="8" height="8" viewBox="0 0 8 8">
                <circle cx="4" cy="4" r="4" fill={p.color} />
              </svg>
            </span>
            <span style={isHidden ? mp.nameHidden : mp.name}>{p.name}</span>
            <button
              type="button"
              style={isHidden ? mp.showBtn : mp.hideBtn}
              onClick={() => (isHidden ? onShow(p.id) : onHide(p.id))}
              aria-label={`${isHidden ? "Mostrar" : "Ocultar"} projeto ${p.name}`}
            >
              {isHidden ? "Mostrar" : "Ocultar"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── PulsingDot ────────────────────────────────────────────────────────────────

function PulsingDot() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "var(--green)",
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  startBox: { display: "flex", flexDirection: "column", gap: 8 },
  projectRow: { display: "flex", flexDirection: "column", gap: 3 },
  labelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 10,
    color: "var(--muted)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  manageBtn: {
    background: "none",
    border: "none",
    color: "var(--brand)",
    fontSize: 10,
    cursor: "pointer",
    padding: 0,
    fontWeight: 600,
    letterSpacing: "0.03em",
    textDecoration: "underline",
    textUnderlineOffset: 2,
  },
  activeBox: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    background: "rgba(34,197,94,0.07)",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
  },
  activeRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 13 },
  activeDesc: { fontSize: 12, color: "var(--muted)" },
  otherTimerBox: {
    fontSize: 12,
    color: "var(--muted)",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "8px 12px",
  },
  select: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "7px 10px",
    color: "var(--text)",
    fontSize: 13,
    width: "100%",
  },
  input: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "7px 10px",
    color: "var(--text)",
    fontSize: 13,
    width: "100%",
  },
  errorMsg: { fontSize: 12, color: "var(--red)" },
  textBtn: {
    background: "none",
    border: "none",
    color: "var(--brand)",
    cursor: "pointer",
    fontSize: 12,
    padding: 0,
    textDecoration: "underline",
  },
  startBtn: {
    background: "var(--brand)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "8px 14px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    width: "100%",
  },
  stopBtn: {
    background: "rgba(239,68,68,0.15)",
    color: "var(--red)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "var(--radius)",
    padding: "7px 14px",
    fontWeight: 600,
    fontSize: 12,
    cursor: "pointer",
    width: "100%",
  },
};

const mp: Record<string, React.CSSProperties> = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "8px 10px",
    maxHeight: 180,
    overflowY: "auto",
  },
  empty: { fontSize: 12, color: "var(--muted)", textAlign: "center" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 0",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  dot: { flexShrink: 0, lineHeight: 0 },
  name: { flex: 1, fontSize: 12, color: "var(--text)", minWidth: 0 },
  nameHidden: {
    flex: 1,
    fontSize: 12,
    color: "var(--muted)",
    minWidth: 0,
    textDecoration: "line-through",
    opacity: 0.6,
  },
  hideBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--muted)",
    fontSize: 10,
    cursor: "pointer",
    padding: "2px 6px",
    flexShrink: 0,
  },
  showBtn: {
    background: "rgba(249,115,22,0.12)",
    border: "1px solid rgba(249,115,22,0.3)",
    borderRadius: 4,
    color: "var(--brand)",
    fontSize: 10,
    cursor: "pointer",
    padding: "2px 6px",
    flexShrink: 0,
  },
};
