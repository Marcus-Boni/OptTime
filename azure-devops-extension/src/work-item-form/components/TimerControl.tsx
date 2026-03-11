import { useState } from "react";
import type { StartTimerPayload } from "../../shared/api";
import type { ActiveTimer, Project } from "../../shared/types";

/** Find the best-match project ID from the list given a DevOps project name */
function resolveInitialProjectId(
  projects: Project[],
  devOpsProjectName: string,
): string {
  if (projects.length === 0) return "";
  if (!devOpsProjectName) return projects[0]?.id ?? "";

  const needle = devOpsProjectName.toLowerCase();
  const exact = projects.find((p) => p.name.toLowerCase() === needle);
  if (exact) return exact.id;
  const partial = projects.find(
    (p) =>
      p.name.toLowerCase().includes(needle) ||
      needle.includes(p.name.toLowerCase()),
  );
  return partial?.id ?? projects[0]?.id ?? "";
}

interface Props {
  timer: ActiveTimer | null;
  projects: Project[];
  workItemId: number | null;
  workItemTitle: string;
  /** DevOps project name — used to auto-select the matching OptSolv project */
  devOpsProjectName: string;
  onStart: (payload: Omit<StartTimerPayload, "action">) => Promise<void>;
  onStop: () => Promise<void>;
}

export function TimerControl({
  timer,
  projects,
  workItemId,
  workItemTitle,
  devOpsProjectName,
  onStart,
  onStop,
}: Props) {
  const [projectId, setProjectId] = useState(() =>
    resolveInitialProjectId(projects, devOpsProjectName),
  );
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTimerForThisItem =
    timer !== null && timer.azureWorkItemId === workItemId;

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
        azureWorkItemId: workItemId ?? undefined,
        azureWorkItemTitle: workItemTitle || undefined,
      });
    } catch (err) {
      setError("Erro ao iniciar o timer.");
      console.error(err);
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
      console.error(err);
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
      {projects.length > 0 && (
        <select
          style={s.select}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={loading}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      <input
        style={s.input}
        type="text"
        placeholder="Descrição (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={loading}
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

const s: Record<string, React.CSSProperties> = {
  startBox: { display: "flex", flexDirection: "column", gap: 8 },
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
