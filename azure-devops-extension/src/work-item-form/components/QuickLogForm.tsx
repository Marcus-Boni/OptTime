import { useEffect, useRef, useState } from "react";
import type { CreateTimeEntryPayload } from "../../shared/api";
import { syncWorkItemFields } from "../../shared/api";
import type { Project } from "../../shared/types";

interface DevOpsFormService {
  getFieldValue: (
    field: string,
    options?: { returnOriginalValue: boolean },
  ) => Promise<unknown>;
  setFieldValue: (field: string, value: unknown) => Promise<void>;
  save?: () => Promise<void>;
}

export interface QuickLogFormProps {
  projects: Project[];
  workItemId: number | null;
  workItemTitle: string;
  /** DevOps project name — used to auto-select the matching OptSolv project */
  devOpsProjectName: string;
  /** Current Azure DevOps organisation + project slug used to build work-item URL */
  devOpsBaseUrl: string;
  formService: DevOpsFormService | null;
  onCreated: () => void;
  onCreateEntry: (payload: CreateTimeEntryPayload) => Promise<unknown>;
}

/** Find the best-match project ID from the list given a DevOps project name */
function resolveInitialProjectId(
  projects: Project[],
  devOpsProjectName: string,
): string {
  if (projects.length === 0) return "";
  if (!devOpsProjectName) return projects[0].id;

  const needle = devOpsProjectName.toLowerCase();
  // Exact match first
  const exact = projects.find((p) => p.name.toLowerCase() === needle);
  if (exact) return exact.id;
  // Partial match (either direction)
  const partial = projects.find(
    (p) =>
      p.name.toLowerCase().includes(needle) ||
      needle.includes(p.name.toLowerCase()),
  );
  return partial?.id ?? projects[0].id;
}

export function QuickLogForm({
  projects,
  workItemId,
  workItemTitle,
  devOpsProjectName,
  devOpsBaseUrl,
  formService,
  onCreated,
  onCreateEntry,
}: QuickLogFormProps) {
  const today = new Date().toISOString().slice(0, 10);

  // Pre-select project matching the DevOps project context
  const [projectId, setProjectId] = useState(() =>
    resolveInitialProjectId(projects, devOpsProjectName),
  );
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [billable, setBillable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [devOpsUpdated, setDevOpsUpdated] = useState(false);

  const descRef = useRef<HTMLInputElement>(null);

  // Re-sync selected project when the list arrives after mount
  useEffect(() => {
    if (projects.length > 0) {
      setProjectId((prev) => {
        // Only override if the current selection is empty or not in the list
        const stillValid = projects.some((p) => p.id === prev);
        if (prev && stillValid) return prev;
        return resolveInitialProjectId(projects, devOpsProjectName);
      });
    }
  }, [projects, devOpsProjectName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setDevOpsUpdated(false);

    const h = Number(hours) || 0;
    const m = Number(minutes) || 0;
    const totalMinutes = h * 60 + m;

    if (!projectId) {
      setError("Selecione um projeto.");
      return;
    }
    if (totalMinutes < 1) {
      setError("Informe a duração (horas e/ou minutos).");
      return;
    }
    if (totalMinutes > 1440) {
      setError("Duração máxima é 24 horas.");
      return;
    }

    setLoading(true);
    try {
      // 1. Create time entry in Harvest/OptSolv
      await onCreateEntry({
        projectId,
        description: description.trim() || workItemTitle || "Sem descrição",
        date,
        duration: totalMinutes,
        billable,
        azureWorkItemId: workItemId ?? undefined,
        azureWorkItemTitle: workItemTitle || undefined,
      });

      // 2. Sync DevOps work item fields if we have the form service
      let devOpsMsg = "";
      if (formService && workItemId) {
        try {
          const updated = await syncWorkItemFields(formService, totalMinutes);
          devOpsMsg = ` · DevOps: ${updated.completedWork.toFixed(1)}h concluído, ${updated.remainingWork.toFixed(1)}h restante`;
          setDevOpsUpdated(true);
        } catch (devOpsErr) {
          console.error("[QuickLogForm] syncWorkItemFields:", devOpsErr);
          // Non-fatal — show warning but don't fail the whole save
          devOpsMsg = " · ⚠ Campos DevOps não atualizados";
        }
      }

      setSuccessMsg(`✓ Registrado com sucesso!${devOpsMsg}`);
      setDescription("");
      setHours("");
      setMinutes("");
      setTimeout(() => {
        setSuccessMsg(null);
        setDevOpsUpdated(false);
        onCreated();
      }, 1800);
    } catch (err) {
      console.error("[QuickLogForm] handleSubmit:", err);
      setError("Erro ao registrar. Verifique os dados e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const workItemUrl =
    workItemId && devOpsBaseUrl
      ? `${devOpsBaseUrl}/_workitems/edit/${workItemId}`
      : null;

  const durationValue = `${Number(hours) || 0}h ${Number(minutes) || 0}m`;
  const isValidDuration = (Number(hours) || 0) * 60 + (Number(minutes) || 0) >= 1;

  return (
    <form onSubmit={handleSubmit} style={s.form} noValidate>
      {/* Project */}
      <div style={s.row}>
        <label style={s.label} htmlFor="qlf-projectId">
          Projeto
        </label>
        <select
          id="qlf-projectId"
          style={s.select}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={loading}
          required
          aria-describedby={!projectId ? "qlf-projectId-err" : undefined}
        >
          {projects.length === 0 && (
            <option value="">Nenhum projeto disponível</option>
          )}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Description (optional) */}
      <div style={s.row}>
        <label style={s.label} htmlFor="qlf-description">
          Descrição{" "}
          <span style={s.optional}>(opcional)</span>
        </label>
        <input
          ref={descRef}
          id="qlf-description"
          style={s.input}
          type="text"
          placeholder={workItemTitle || "O que você fez?"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          maxLength={500}
          aria-label="Descrição do lançamento (opcional)"
        />
      </div>

      {/* Date + Duration row */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ ...s.row, flex: "0 0 44%" }}>
          <label style={s.label} htmlFor="qlf-date">
            Data
          </label>
          <input
            id="qlf-date"
            style={s.input}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div style={{ ...s.row, flex: 1 }}>
          <label style={s.label} htmlFor="qlf-hours">
            Duração
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              id="qlf-hours"
              style={s.inputSmall}
              type="number"
              placeholder="h"
              min={0}
              max={23}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              disabled={loading}
              aria-label="Horas"
            />
            <input
              id="qlf-minutes"
              style={s.inputSmall}
              type="number"
              placeholder="min"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              disabled={loading}
              aria-label="Minutos"
            />
          </div>
          {isValidDuration && (
            <span style={s.durationPreview}>{durationValue}</span>
          )}
        </div>
      </div>

      {/* Billable toggle + DevOps badge */}
      <div style={s.metaRow}>
        <label style={s.checkRow}>
          <input
            type="checkbox"
            checked={billable}
            onChange={(e) => setBillable(e.target.checked)}
            disabled={loading}
            aria-label="Lançamento faturável"
          />
          <span style={s.checkLabel}>Faturável</span>
        </label>

        {workItemId && (
          <div style={s.wiBadge}>
            {workItemUrl ? (
              <a
                href={workItemUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={s.wiLink}
                title={`Abrir work item #${workItemId} no Azure DevOps`}
              >
                🔗 #{workItemId}
              </a>
            ) : (
              <span>#{workItemId}</span>
            )}
            {devOpsUpdated && (
              <span style={s.devOpsTag}>DevOps ✓</span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={s.error} role="alert" aria-live="polite">
          {error}
        </div>
      )}
      {successMsg && (
        <div style={s.successMsg} role="status" aria-live="polite">
          {successMsg}
        </div>
      )}

      <button
        type="submit"
        style={loading ? { ...s.btn, opacity: 0.6, cursor: "not-allowed" } : s.btn}
        disabled={loading || projects.length === 0}
        aria-busy={loading}
      >
        {loading ? "Salvando…" : "Salvar Lançamento"}
      </button>
    </form>
  );
}

const s: Record<string, React.CSSProperties> = {
  form: { display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", flexDirection: "column", gap: 3 },
  label: {
    fontSize: 10,
    color: "var(--muted)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  optional: {
    fontWeight: 400,
    textTransform: "none",
    letterSpacing: 0,
    fontSize: 10,
    opacity: 0.7,
  },
  select: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "7px 10px",
    color: "var(--text)",
    fontSize: 13,
    width: "100%",
    cursor: "pointer",
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
  inputSmall: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "7px 8px",
    color: "var(--text)",
    fontSize: 13,
    flex: 1,
    minWidth: 0,
  },
  durationPreview: {
    fontSize: 10,
    color: "var(--brand)",
    marginTop: 2,
    fontVariantNumeric: "tabular-nums",
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
  },
  checkLabel: { fontSize: 12, color: "var(--muted)" },
  wiBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: "var(--muted)",
    background: "rgba(249,115,22,0.08)",
    border: "1px solid rgba(249,115,22,0.2)",
    borderRadius: "var(--radius)",
    padding: "4px 8px",
  },
  wiLink: {
    color: "var(--brand)",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 11,
  },
  devOpsTag: {
    fontSize: 10,
    color: "var(--green)",
    background: "rgba(74,222,128,0.12)",
    border: "1px solid rgba(74,222,128,0.25)",
    borderRadius: 4,
    padding: "1px 5px",
    fontWeight: 600,
  },
  error: { fontSize: 12, color: "var(--red)" },
  successMsg: {
    fontSize: 12,
    color: "var(--green)",
    fontWeight: 600,
    lineHeight: 1.5,
  },
  btn: {
    background: "var(--brand)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "9px 14px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    width: "100%",
    transition: "opacity 0.15s",
    minHeight: 44,
  },
};
