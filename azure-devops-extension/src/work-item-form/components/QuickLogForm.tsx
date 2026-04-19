import { useEffect, useRef, useState } from "react";
import type {
  CreateTimeEntryPayload,
  IFormServiceSubset,
} from "../../shared/api";
import { syncWorkItemFields } from "../../shared/api";
import {
  getHiddenProjectIds,
  hideProject,
  showProject,
} from "../../shared/project-filtering";
import { matchProjectFromDevOpsContext } from "../../shared/project-matching";
import type { Project } from "../../shared/types";

export interface QuickLogFormProps {
  projects: Project[];
  /** Full project list (visible + hidden) — used in the manage panel */
  allProjects: Project[];
  workItemId: number | null;
  workItemTitle: string;
  /** DevOps project name — used to auto-select the matching OptSolv project */
  devOpsProjectName: string;
  /** Current Azure DevOps organisation + project slug used to build work-item URL */
  devOpsBaseUrl: string;
  formService: IFormServiceSubset | null;
  /** Whether the project was already matched to the current DevOps context */
  isProjectAutoSelected: boolean;
  /** Controlled description value — shared with Dashboard to survive tab switches */
  description: string;
  onDescriptionChange: (value: string) => void;
  onCreated: () => void;
  onCreateEntry: (payload: CreateTimeEntryPayload) => Promise<unknown>;
  /** Called after the user hides/shows a project so the project list can reload */
  onProjectsChanged: () => void;
}

export function QuickLogForm({
  projects,
  allProjects,
  workItemId,
  workItemTitle,
  devOpsProjectName,
  devOpsBaseUrl,
  formService,
  isProjectAutoSelected,
  description,
  onDescriptionChange,
  onCreated,
  onCreateEntry,
  onProjectsChanged,
}: QuickLogFormProps) {
  const today = new Date().toISOString().slice(0, 10);

  // Pre-select project matching the DevOps project context.
  // Falls back to first available project when no match is found (user must pick).
  const [projectId, setProjectId] = useState(() =>
    matchProjectFromDevOpsContext(projects, devOpsProjectName).projectId,
  );
  const [date, setDate] = useState(today);
  const [selectedDuration, setSelectedDuration] = useState("");
  const [customHours, setCustomHours] = useState("");
  const [customMinutes, setCustomMinutes] = useState("");
  const [billable, setBillable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [devOpsUpdated, setDevOpsUpdated] = useState(false);
  const [showManageProjects, setShowManageProjects] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(getHiddenProjectIds);

  const descRef = useRef<HTMLInputElement>(null);

  // Re-sync selected project when the list arrives after mount
  useEffect(() => {
    if (projects.length > 0) {
      setProjectId((prev) => {
        // Only override if the current selection is empty or not in the list
        const stillValid = projects.some((p) => p.id === prev);
        if (prev && stillValid) return prev;
        return matchProjectFromDevOpsContext(projects, devOpsProjectName).projectId;
      });
    }
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setDevOpsUpdated(false);

    const totalMinutes =
      selectedDuration === "custom"
        ? (Number(customHours) || 0) * 60 + (Number(customMinutes) || 0)
        : Number(selectedDuration) || 0;

    if (!projectId) {
      setError("Selecione um projeto.");
      return;
    }
    if (totalMinutes < 1) {
      setError("Selecione ou informe a duração.");
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
        azureWorkItemId:
          workItemId != null && workItemId > 0 ? workItemId : undefined,
        azureWorkItemTitle: workItemTitle || undefined,
      });

      // 2. Sync DevOps work item fields if we have the form service
      let devOpsMsg = "";
      if (formService && workItemId) {
        try {
          const updated = await syncWorkItemFields(formService, totalMinutes);
          if (updated.skipped) {
            devOpsMsg =
              " · DevOps: item em estado terminal, campos não modificados";
          } else {
            const remainingStr =
              updated.remainingWork !== null
                ? `, ${updated.remainingWork.toFixed(1)}h restante`
                : "";
            devOpsMsg = ` · DevOps: ${updated.completedWork.toFixed(1)}h concluído${remainingStr}`;
          }
          setDevOpsUpdated(true);
        } catch (devOpsErr) {
          console.error("[QuickLogForm] syncWorkItemFields:", devOpsErr);
          // Non-fatal — show warning but don't fail the whole save
          devOpsMsg = " · ⚠ Campos DevOps não atualizados";
        }
      }

      setSuccessMsg(`✓ Registrado com sucesso!${devOpsMsg}`);
      onDescriptionChange("");
      setSelectedDuration("");
      setCustomHours("");
      setCustomMinutes("");
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

  return (
    <form onSubmit={handleSubmit} style={s.form} noValidate>
      {/* ── Project selector (hidden when auto-selected in PBI context) ── */}
      {!isProjectAutoSelected && (
        <div style={s.row}>
          <div style={s.labelRow}>
            <label style={s.label} htmlFor="qlf-projectId">
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
          )}
        </div>
      )}

      {/* ── Description (optional) ── */}
      <div style={s.row}>
        <label style={s.label} htmlFor="qlf-description">
          Descrição <span style={s.optional}>(opcional)</span>
        </label>
        <input
          ref={descRef}
          id="qlf-description"
          style={s.input}
          type="text"
          placeholder={workItemTitle || "O que você fez?"}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          disabled={loading}
          maxLength={500}
          aria-label="Descrição do lançamento (opcional)"
        />
      </div>

      {/* ── Date + Duration row ── */}
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
          <label style={s.label} htmlFor="qlf-duration">
            Duração
          </label>
          <select
            id="qlf-duration"
            style={s.select}
            value={selectedDuration}
            onChange={(e) => setSelectedDuration(e.target.value)}
            disabled={loading}
            required
          >
            <option value="" disabled>
              Selecione a duração…
            </option>
            <option value="15">15 min</option>
            <option value="30">30 min</option>
            <option value="45">45 min</option>
            <option value="60">1h</option>
            <option value="75">1h 15m</option>
            <option value="90">1h 30m</option>
            <option value="105">1h 45m</option>
            <option value="120">2h</option>
            <option value="150">2h 30m</option>
            <option value="180">3h</option>
            <option value="210">3h 30m</option>
            <option value="240">4h</option>
            <option value="300">5h</option>
            <option value="360">6h</option>
            <option value="420">7h</option>
            <option value="480">8h</option>
            <option value="custom">Personalizado…</option>
          </select>
          {selectedDuration === "custom" && (
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <input
                style={s.inputSmall}
                type="number"
                placeholder="h"
                min={0}
                max={23}
                value={customHours}
                onChange={(e) => setCustomHours(e.target.value)}
                disabled={loading}
                aria-label="Horas (personalizado)"
              />
              <input
                style={s.inputSmall}
                type="number"
                placeholder="min"
                min={0}
                max={59}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                disabled={loading}
                aria-label="Minutos (personalizado)"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Billable toggle + DevOps badge ── */}
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
            {devOpsUpdated && <span style={s.devOpsTag}>DevOps ✓</span>}
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
        style={
          loading ? { ...s.btn, opacity: 0.6, cursor: "not-allowed" } : s.btn
        }
        disabled={loading || projects.length === 0}
        aria-busy={loading}
      >
        {loading ? "Salvando…" : "Salvar Lançamento"}
      </button>
    </form>
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

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  form: { display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", flexDirection: "column", gap: 3 },
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
