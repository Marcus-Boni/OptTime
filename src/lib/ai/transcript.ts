/**
 * Transcript helpers — turn a TimeBot conversation into shareable Markdown.
 *
 * Kept structurally typed so the export pipeline stays decoupled from the
 * client hook that owns the message state.
 */

export interface TranscriptMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface TranscriptOptions {
  /** Conversation title used as the document heading. */
  title: string;
  /** Display name shown for the human side of the conversation. */
  userName: string;
  /** Generation timestamp — defaults to now. */
  generatedAt?: Date;
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const COMBINING_MARKS = /[\u0300-\u036f]/g;

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
}

/** Build a Markdown document out of the conversation. */
export function buildTranscriptMarkdown(
  messages: TranscriptMessage[],
  { title, userName, generatedAt = new Date() }: TranscriptOptions,
): string {
  const header = [
    `# ${title}`,
    "",
    "> Conversa com o TimeBot · OptSolv Time Tracker",
    `> Exportado em ${DATE_TIME_FORMATTER.format(generatedAt)}`,
    "",
    "---",
    "",
  ];

  const body = messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => {
      const author = message.role === "user" ? userName : "TimeBot";
      const stamp = DATE_TIME_FORMATTER.format(new Date(message.createdAt));

      return `### ${author} · ${stamp}\n\n${message.content.trim()}\n`;
    });

  return [...header, ...body].join("\n");
}

/** File name for the exported transcript, e.g. `timebot-resumo-semana-2026-03-12.md`. */
export function buildTranscriptFileName(
  title: string,
  generatedAt = new Date(),
): string {
  const slug = slugify(title) || "conversa";
  const date = generatedAt.toISOString().slice(0, 10);

  return `timebot-${slug}-${date}.md`;
}

/** Trigger a client-side download of the Markdown transcript. */
export function downloadTranscript(markdown: string, fileName: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
