import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SmartSuggestionsPanel } from "@/components/time/SmartSuggestionsPanel";
import {
  buildDeterministicSuggestions,
  type NormalizedCommitActivity,
} from "@/lib/time-assistant/engine";
import type { TimeSuggestion } from "@/types/time-suggestions";

function renderSuggestion(suggestion: TimeSuggestion): string {
  const noop = () => {};
  return renderToStaticMarkup(
    createElement(SmartSuggestionsPanel, {
      suggestions: [suggestion],
      loading: false,
      error: null,
      enabled: true,
      onRetry: noop,
      onApply: noop,
      onApplyCommit: noop,
      appliedCommitKeys: [],
      onEditAndApply: noop,
      onIgnore: noop,
    }),
  );
}

const commit: NormalizedCommitActivity = {
  id: "commit-1",
  commitId: "abc1234567",
  projectName: "Portal do Cliente",
  repositoryName: "portal",
  message: "Corrigir formulário de registro",
  comment: "Corrigir formulário de registro",
  branch: "develop",
  authorEmail: null,
  timestamp: "2026-10-01T14:00:00Z",
  workItemIds: [],
};
const base = {
  date: "2026-10-01",
  meetings: [],
  projects: [
    {
      id: "project-1",
      name: commit.projectName,
      billable: true,
      azureProjectId: null,
    },
  ],
  recentEntries: [],
  existingEntries: [],
};
const lastCommit = {
  ...commit,
  id: "commit-2",
  commitId: "def1234567",
  message: "Reunião de ajustes: implementar campos combinados",
  timestamp: "2026-10-01T14:30:00Z",
};
const [grouped] = buildDeterministicSuggestions({
  ...base,
  commits: [commit, lastCommit],
});
assert.ok(grouped);
assert.equal(grouped.sourceBreakdown.meetings, 0);
assert.equal(grouped.sourceBreakdown.commits, 2);
assert.equal(
  grouped.title,
  "Bloco de desenvolvimento — Portal do Cliente",
  "a commit message mentioning a meeting must not name the whole development block",
);
assert.equal(grouped.description, lastCommit.message);
assert.equal(grouped.payload?.description, lastCommit.message);
assert.equal(grouped.activitySummary?.commits[0]?.message, lastCommit.message);
const groupedMarkup = renderSuggestion(grouped);
const displayedTitle = groupedMarkup.match(
  /<article[\s\S]*?<p[^>]*>(.*?)<\/p>/,
)?.[1];
assert.equal(displayedTitle, grouped.title);
assert.ok(!groupedMarkup.includes(">1 reunião<"));

const [single] = buildDeterministicSuggestions({
  ...base,
  commits: [lastCommit],
});
assert.equal(single?.title, `Commit: ${lastCommit.message}`);

const [meeting] = buildDeterministicSuggestions({
  ...base,
  commits: [],
  meetings: [
    {
      id: "meeting-1",
      subject: "Reunião de ajustes",
      startDateTime: "2026-10-01T12:00:00Z",
      endDateTime: "2026-10-01T12:30:00Z",
      durationMinutes: 30,
    },
  ],
});
assert.equal(meeting?.title ?? meeting?.description, "Reunião de ajustes");
assert.ok(meeting);
assert.ok(renderSuggestion(meeting).includes(">1 reunião<"));

process.stdout.write("time suggestion titles OK\n");
