# Time Registration Page Refactor — Design Spec

**Date**: 2026-03-23
**Status**: Draft
**Motivation**: Leader feedback — summary card too large, redundant registration buttons, need for week-centric UX with drag & drop and quick submission.

---

## 1. Goals

- Remove the summary card that occupies screen space before users see actual data
- Default to week view for faster time entry workflow
- Add drag & drop in WeekView for moving/duplicating entries between days
- Add "Submit Week" button as a shortcut directly in the WeekView
- Eliminate redundant registration buttons and standardize entry points
- Save user preferences in localStorage for a smoother recurring experience
- Maximize practicality, efficiency, and usability

## 2. Non-Goals

- Changing the timesheet approval flow or API
- Modifying the MonthView or DayView internal layouts
- Adding server-side preference storage

---

## 3. Changes

### 3.1 Remove Summary Card

**Remove entirely:**
- The header badges section (daily logged hours, target, recent project)
- `WeeklyCapacityBar` component usage from the time page
- `DailyCapacityBar` component usage from the time page
- Any capacity-related imports/state in the time page
- The `getViewSummary` function — the page title becomes static ("Registro de Tempo")

**Keep:**
- `TimerWidget` — stays at the bottom of the page as-is

**Rationale**: Progress is already visible through per-day bars inside WeekView. The summary card duplicates this information and pushes the actual content below the fold.

### 3.2 Reorganize Header & Tabs

**New header layout:**
- **Row 1**: Static page title "Registro de Tempo" (left) + "+ Novo Registro" button (right)
- **Row 2**: View tabs (Dia / Semana / Mês) directly below the title

**Key changes:**
- Tabs move from inside the (now removed) summary card to the page header
- Week view is the default (instead of current default)
- View preference is persisted in localStorage

### 3.3 Standardize Registration Buttons

**Keep:**
- **Header button**: "+ Novo Registro" — opens `TimeEntryForm` in create mode. Uses selected date or today as default.
- **"+" buttons inside views**: Present in DayView (per day) and WeekView (per column). Open `TimeEntryForm` with the specific day pre-filled.
- **Quick Entry (command palette)**: Stays as-is — global shortcut, not redundancy.

**Remove explicitly:**
- "Lançar manualmente" button in the header area
- "Duplicar última" button in the header area
- Any other registration trigger outside the two canonical entry points above

### 3.4 Drag & Drop in WeekView

**Library**: `@dnd-kit/core` + `@dnd-kit/utilities`

> Note: `@dnd-kit/sortable` is NOT needed — this is a cross-container drag (between day columns), not a sortable list reorder.

**Architecture:**
- `DndContext` wraps the 7-column week grid inside `WeekView`
- Each inline entry element in WeekView's day columns becomes a **draggable** item (wrapped with `useDraggable`). Note: WeekView renders entries as inline `<div>` elements, NOT using `TimeEntryCard` — the draggable wrapper is applied to these existing inline elements.
- Each day column is a **droppable** zone (wrapped with `useDroppable`)
- Sensors: `PointerSensor` (mouse) + `TouchSensor` (mobile) + `KeyboardSensor` (accessibility) with activation distance to avoid conflicts with clicks

**Visual feedback:**
- Dragged card: reduced opacity at origin, ghost follows cursor via `DragOverlay`
- Target column: subtle highlight border/background on hover

**Drop behavior — context menu:**
When a card is dropped on a different day, a small popover/menu appears at the drop location with two options:
- **"Mover para [dia]"**: Calls `onMoveEntry(entryId, newDate)` callback
- **"Duplicar em [dia]"**: Calls `onDuplicateEntry(entryId, newDate)` callback

**Error handling:** If the move/duplicate API call fails, show an error toast. No optimistic UI — the refetch via `TIME_ENTRIES_UPDATED_EVENT` handles the state update on success.

**Data flow for drag operations:**
`TimePage` passes two new callback props to `WeekView`:
- `onMoveEntry(entryId: string, newDate: string)` — calls `updateEntry(entryId, { date: newDate })`
- `onDuplicateEntry(entryId: string, newDate: string)` — finds the entry by ID, calls `createEntry` copying `projectId`, `description`, `duration`, `billable`, `azureWorkItemId`, `azureWorkItemTitle` with the new date

This keeps the data mutation logic in `TimePage` (which owns the `useTimeEntries` hook) and keeps `WeekView` as a presentational component with callbacks.

**Restrictions:**
- Only entries with editable timesheets (`status === "open"` or `status === "rejected"` or `timesheetId === null`) can be dragged
- Non-editable entries show no drag handle / cursor
- Dropping on the same day is a no-op (menu doesn't appear)

### 3.5 "Submit Week" Button in WeekView

**Position**: In the WeekView header bar, alongside the week navigation buttons (previous/next/current week).

**Flow:**
1. User clicks "Submeter Semana"
2. Confirmation dialog: "Submeter semana X de 2026? Isso enviará N registros (Xh total) para aprovação."
3. On confirm: calls `onSubmitWeek()` callback prop
4. Success toast notification
5. Button state updates to reflect new status

**Data flow:**
`TimePage` manages the timesheet state for the current week using `useTimesheets` hook:
- On week change, calls `getOrCreateTimesheet(period, "weekly")` to get/create the timesheet
- Passes `weekTimesheetStatus` and `onSubmitWeek` as props to `WeekView`
- `onSubmitWeek` calls `submitTimesheet(timesheetId)` from the hook

**Period string derivation**: Uses `date-fns` functions — `getISOWeekYear(date)` and `getISOWeek(date)` to produce the `YYYY-Www` format, e.g.:
```typescript
const period = `${getISOWeekYear(weekStart)}-W${getISOWeek(weekStart).toString().padStart(2, "0")}`;
```

**States:**
- **Enabled**: Timesheet status is `open` or `rejected` AND week has entries
- **Disabled** (with tooltip "Sem registros"): Week has no entries
- **Replaced by status badge**: If timesheet is `submitted` → "Submetida" badge; if `approved` → "Aprovada" badge

### 3.6 User Preferences (localStorage)

**Storage key**: `harvest:time-preferences`

**Persisted values:**

| Key | Type | Default | Saved when |
|-----|------|---------|------------|
| `defaultView` | `"week"` \| `"day"` \| `"month"` | `"week"` | User switches tab |
| `lastProjectId` | `string \| null` | `null` | User saves a time entry |
| `defaultBillable` | `boolean` | `true` | User saves a time entry |
| `defaultDuration` | `number` | `60` | User saves a time entry (stores duration in minutes) |
| `submitMode` | `"close"` \| `"continue"` | `"close"` | User saves a time entry (saves whichever mode was active) |

**Behavior:**
- Preferences are saved silently on usage — no settings UI needed
- `TimeEntryForm` reads preferences on mount to pre-fill: last project, billable default, last duration
- The existing `submitMode` state in `TimeEntryForm` initializes from the preference instead of hardcoded `"close"`. The existing toggle UI in the form (close vs continue) is already present — the preference just persists the last choice.
- `defaultDuration` defaults to `60` (matching the existing form default of 60 minutes). When a preference is saved, it overrides this default on next form open.
- User can always override pre-filled values before saving
- Page reads `defaultView` on mount to set initial active tab

**Implementation**: Simple utility module `lib/time-preferences.ts` with `getTimePreferences()` and `saveTimePreference(key, value)` functions wrapping `localStorage` with JSON serialization and a try/catch for SSR safety.

---

## 4. Component Changes Summary

| Component | Action | Details |
|-----------|--------|---------|
| `TimePage` | **Modify** | Remove summary section, capacity bars, `getViewSummary`, redundant buttons ("Lançar manualmente", "Duplicar última"). Restructure header with static title + tabs. Default view to week. Read preferences on mount. Add `useTimesheets` for week submission. Pass `onMoveEntry`, `onDuplicateEntry`, `onSubmitWeek`, `weekTimesheetStatus` props to WeekView. |
| `WeekView` | **Modify** | Add `DndContext` wrapper, `useDroppable` on day columns, `useDraggable` on inline entry elements, `DragOverlay`, context menu on drop, "Submit Week" button in header, timesheet status badge. Accept new callback props. |
| `TimeEntryForm` | **Modify** | Read preferences for pre-filling fields (last project, billable, duration). Save preferences on successful submit. Initialize `submitMode` from preference. |
| `DayView` | **No change** | Keep "+" buttons as-is. |
| `MonthView` | **No change** | No modifications needed. |
| `WeeklyCapacityBar` | **Keep file, remove usage** | Component file stays (may be used elsewhere), removed from TimePage. |
| `DailyCapacityBar` | **Keep file, remove usage** | Same — removed from TimePage usage only. |
| New: `lib/time-preferences.ts` | **Create** | Utility module for localStorage preference read/write. |
| New: `DragDropContextMenu` | **Create** | Small popover component for Move/Duplicate choice after drop. |

---

## 5. Dependencies

**New npm packages:**
- `@dnd-kit/core` — drag & drop engine
- `@dnd-kit/utilities` — CSS utilities for transforms

**No other new dependencies required.** All other functionality uses existing libraries (react-hook-form, zustand, radix-ui, lucide-react, date-fns).

---

## 6. Edge Cases

- **Empty week submission**: Button disabled with tooltip. Cannot submit a week with zero entries.
- **Already submitted week**: Button replaced by status badge. No double submission possible.
- **Drag to same day**: No-op — context menu does not appear.
- **Drag non-editable entry**: Drag is not enabled (no drag handle rendered). Entry appears static.
- **Drag API failure**: Error toast shown. No optimistic UI to rollback — entry stays in original position.
- **localStorage unavailable**: Graceful fallback to defaults (week view, 60min duration, billable true, no project pre-fill). try/catch in utility functions.
- **SSR**: Preferences read only on client mount via useEffect, avoiding hydration mismatch.
- **Concurrent edits**: After move/duplicate, entries refetch via `TIME_ENTRIES_UPDATED_EVENT` to sync state.
- **TimerWidget**: Remains at the bottom of the page, unaffected by header changes.
