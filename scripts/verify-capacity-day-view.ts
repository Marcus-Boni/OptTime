import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DayView } from "@/components/time/DayView";
import type { TimeEntry } from "@/hooks/use-time-entries";

const noop = () => {};
for (const hours of [4, 6, 8]) {
  const props = {
    entries: [],
    selectedDate: new Date(2026, 9, 5),
    selectedDateLocked: false,
    dailyTargetMinutes: hours * 60,
    onSelectedDateChange: noop,
    onEdit: noop,
    onDelete: noop,
    onDuplicate: noop,
    onAdjustMeeting: noop,
    onOpenCreate: noop,
    assistantEnabled: false,
    suggestions: [],
    suggestionsLoading: false,
    suggestionsError: null,
    onAssistantEnabledChange: noop,
    onRetrySuggestions: noop,
    onApplySuggestion: noop,
    onApplySuggestionCommit: noop,
    appliedSuggestionCommitKeys: [],
    onEditSuggestion: noop,
    onIgnoreSuggestion: noop,
  };
  const markup = renderToStaticMarkup(createElement(DayView, props));
  assert.match(
    markup,
    new RegExp(`/ ${hours}h`),
    `${hours}h daily goal must be displayed`,
  );
  const entry: TimeEntry = {
    id: "entry-1",
    userId: "user-1",
    projectId: "project-1",
    timesheetId: null,
    description: "Implementação da capacidade individual",
    date: "2026-10-05",
    duration: hours * 60,
    billable: true,
    azureWorkItemId: null,
    azureWorkItemTitle: null,
    startTime: null,
    endTime: null,
    azdoSyncStatus: "synced",
    createdAt: "2026-10-05T12:00:00Z",
    updatedAt: "2026-10-05T12:00:00Z",
    project: {
      id: "project-1",
      name: "Projeto",
      code: "PRJ",
      color: "#ff6600",
    },
  };
  const complete = renderToStaticMarkup(
    createElement(DayView, { ...props, entries: [entry] }),
  );
  assert.match(
    complete,
    />Completo</,
    `${hours}h must complete the person's day`,
  );
  assert.doesNotMatch(
    complete,
    /faltam /,
    "A completed shorter schedule must not request extra hours",
  );
}
console.info("Daily view respects 4h, 6h and 8h schedules.");
