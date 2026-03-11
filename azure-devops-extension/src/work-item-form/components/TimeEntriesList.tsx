import type { TimeEntry } from "../../shared/types";

interface TimeEntriesListProps {
  entries: TimeEntry[];
  devOpsBaseUrl: string;
  workItemId: number | null;
  onRefresh: () => void;
}

export function TimeEntriesList({
  entries,
  devOpsBaseUrl,
  workItemId,
  onRefresh,
}: TimeEntriesListProps) {
  const workItemUrl =
    workItemId && devOpsBaseUrl
      ? `${devOpsBaseUrl}/_workitems/edit/${workItemId}`
      : null;

  if (entries.length === 0) {
    return (
      <div style={s.empty}>
        <span>Nenhum lançamento ainda.</span>
        {workItemUrl && (
          <a
            href={workItemUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={s.wiLinkEmpty}
            title="Abrir work item no Azure DevOps"
          >
            🔗 Ver work item #{workItemId}
          </a>
        )}
        <button type="button" style={s.refreshBtn} onClick={onRefresh}>
          ↺ Recarregar
        </button>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <div style={s.topRow}>
        <span style={s.count}>
          {entries.length} lançamento{entries.length !== 1 ? "s" : ""}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {workItemUrl && (
            <a
              href={workItemUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={s.wiLink}
              title={`Abrir work item #${workItemId} no Azure DevOps`}
              aria-label={`Abrir work item #${workItemId} no Azure DevOps`}
            >
              🔗 #{workItemId}
            </a>
          )}
          <button
            type="button"
            style={s.refreshBtn}
            onClick={onRefresh}
            title="Recarregar lançamentos"
            aria-label="Recarregar lançamentos"
          >
            ↺
          </button>
        </div>
      </div>

      <div style={s.list}>
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function EntryRow({ entry }: { entry: TimeEntry }) {
  const hours = Math.floor(entry.duration / 60);
  const mins = entry.duration % 60;
  const durationLabel = mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;

  return (
    <div style={entry.isOwn ? { ...s.row, ...s.ownRow } : s.row}>
      <div
        style={{ ...s.dot, background: entry.project.color }}
        aria-hidden="true"
      />
      <div style={s.rowBody}>
        <div style={s.rowTitle} title={entry.description}>
          {entry.description || <em style={{ opacity: 0.5 }}>Sem descrição</em>}
        </div>
        <div style={s.rowMeta}>
          <span style={{ color: entry.project.color }}>{entry.project.name}</span>
          {" · "}
          <span>{entry.date}</span>
          {" · "}
          <span>{entry.user.name}</span>
          {entry.billable && (
            <>
              {" · "}
              <span style={s.billableTag}>$</span>
            </>
          )}
        </div>
      </div>
      <div
        style={{
          ...s.duration,
          color: entry.isOwn ? "var(--brand)" : "var(--muted)",
        }}
      >
        {durationLabel}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", gap: 8 },
  topRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  count: { fontSize: 11, color: "var(--muted)" },
  refreshBtn: {
    background: "none",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: 13,
    padding: "2px 6px",
    lineHeight: 1,
  },
  wiLink: {
    color: "var(--brand)",
    textDecoration: "none",
    fontSize: 11,
    fontWeight: 600,
  },
  wiLinkEmpty: {
    color: "var(--brand)",
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 600,
  },
  list: { display: "flex", flexDirection: "column", gap: 4 },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 10px",
    borderRadius: "var(--radius)",
    background: "var(--surface)",
    border: "1px solid var(--border)",
  },
  ownRow: {
    borderColor: "rgba(249,115,22,0.25)",
    background: "rgba(249,115,22,0.05)",
  },
  dot: {
    flexShrink: 0,
    width: 6,
    height: 6,
    borderRadius: "50%",
    marginTop: 5,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowMeta: { fontSize: 11, color: "var(--muted)", marginTop: 2 },
  billableTag: {
    color: "var(--green)",
    fontWeight: 700,
    fontSize: 10,
  },
  duration: {
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  empty: {
    textAlign: "center",
    color: "var(--muted)",
    fontSize: 12,
    padding: "20px 0",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "center",
  },
};
