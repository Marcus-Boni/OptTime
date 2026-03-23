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
- Changing the TimeEntryForm modal itself (fields, validation, Outlook integration)

---

## 3. Changes

### 3.1 Remove Summary Card

**Remove entirely:**
- The header badges section (daily logged hours, target, recent project)
- `WeeklyCapacityBar` component usage from the time page
- `DailyCapacityBar` component usage from the time page
- Any capacity-related imports/state in the time page

**Rationale**: Progress is already visible through per-day bars inside WeekView. The summary card duplicates this information and pushes the actual content below the fold.

### 3.2 Reorganize Header & Tabs

**New header layout:**
- **Row 1**: Page title "Registro de Tempo" (left) + "+ Novo Registro" button (right)
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

**Remove:**
- Any other registration trigger outside these two canonical entry points (e.g., duplicate-last button in header area, extra action buttons that open the same modal).

### 3.4 Drag & Drop in WeekView

**Library**: `@dnd-kit/core` + `@dnd-kit/sortable`

**Architecture:**
- `DndContext` wraps the 7-column week grid
- Each `TimeEntryCard` in WeekView becomes a **draggable** item
- Each day column is a **droppable** zone
- Sensors: `PointerSensor` (mouse) + `TouchSensor` (mobile) with activation distance to avoid conflicts with clicks

**Visual feedback:**
- Dragged card: reduced opacity at origin, ghost follows cursor
- Target column: subtle highlight border/background on hover

**Drop behavior — context menu:**
When a card is dropped on a different day, a small popover/menu appears at the drop location with two options:
- **"Mover para [dia]"**: Calls `updateEntry` changing the `date` field to the target day
- **"Duplicar em [dia]"**: Calls `createEntry` copying `projectId`, `description`, `duration`, `billable`, `azureWorkItemId`, `azureWorkItemTitle` with the new date

**Restrictions:**
- Only entries with editable timesheets (`status === "open"` or `status === "rejected"` or `timesheetId === null`) can be dragged
- Non-editable entries show no drag handle / cursor
- Dropping on the same day is a no-op (menu doesn't appear)

### 3.5 "Submit Week" Button in WeekView

**Position**: In the WeekView header bar, alongside the week navigation buttons (previous/next/current week).

**Flow:**
1. User clicks "Submeter Semana"
2. Confirmation dialog: "Submeter semana X de 2026? Isso enviará N registros (Xh total) para aprovação."
3. On confirm: calls `getOrCreateTimesheet(period, "weekly")` then `submitTimesheet(id)`
4. Success toast notification
5. Button state updates to reflect new status

**States:**
- **Enabled**: Timesheet status is `open` or `rejected` AND week has entries
- **Disabled** (with tooltip "Sem registros"): Week has no entries
- **Replaced by status badge**: If timesheet is `submitted` → "Submetida" badge; if `approved` → "Aprovada" badge

**Period calculation**: Uses the same ISO week format already in use — `YYYY-Www` derived from the WeekView's current displayed week.

### 3.6 User Preferences (localStorage)

**Storage key**: `harvest:time-preferences`

**Persisted values:**

| Key | Type | Default | Saved when |
|-----|------|---------|------------|
| `defaultView` | `"week"` \| `"day"` \| `"month"` | `"week"` | User switches tab |
| `lastProjectId` | `string \| null` | `null` | User saves a time entry |
| `defaultBillable` | `boolean` | `true` | User saves a time entry |
| `defaultDuration` | `number \| null` | `null` | User saves a time entry (stores duration in minutes) |
| `submitMode` | `"close"` \| `"continue"` | `"close"` | User toggles the mode in create form |

**Behavior:**
- Preferences are saved silently on usage — no settings UI needed
- `TimeEntryForm` reads preferences on mount to pre-fill: last project, billable default, last duration, submit mode
- User can always override pre-filled values before saving
- Page reads `defaultView` on mount to set initial active tab

**Implementation**: Simple utility module with `getTimePreferences()` and `saveTimePreference(key, value)` functions wrapping `localStorage` with JSON serialization and a try/catch for SSR safety.

---

## 4. Component Changes Summary

| Component | Action | Details |
|-----------|--------|---------|
| `TimePage` | **Modify** | Remove summary section, capacity bars, redundant buttons. Restructure header. Default view to week. Read preferences on mount. |
| `WeekView` | **Modify** | Add DndContext wrapper, droppable columns, drag & drop logic, context menu, "Submit Week" button, timesheet status display. |
| `TimeEntryCard` (WeekView) | **Modify** | Add draggable wrapper with drag handle. Conditionally enable based on entry editability. |
| `TimeEntryForm` | **Modify** | Read preferences for pre-filling fields. Save preferences on successful submit. |
| `DayView` | **No change** | Keep "+" buttons as-is. |
| `MonthView` | **No change** | No modifications needed. |
| `WeeklyCapacityBar` | **No removal** | Component file stays (may be used elsewhere), just removed from TimePage. |
| `DailyCapacityBar` | **No removal** | Same — removed from TimePage usage only. |
| New: `time-preferences.ts` | **Create** | Utility module for localStorage preference read/write. |
| New: `DragDropContextMenu` | **Create** | Small popover component for Move/Duplicate choice after drop. |

---

## 5. Dependencies

**New npm package:**
- `@dnd-kit/core` — drag & drop engine
- `@dnd-kit/sortable` — sortable primitives (for list context)
- `@dnd-kit/utilities` — CSS utilities for transforms

**No other new dependencies required.** All other functionality uses existing libraries (react-hook-form, zustand, radix-ui, lucide-react, date-fns).

---

## 6. Edge Cases

- **Empty week submission**: Button disabled with tooltip. Cannot submit a week with zero entries.
- **Already submitted week**: Button replaced by status badge. No double submission possible.
- **Drag to same day**: No-op — context menu does not appear.
- **Drag non-editable entry**: Drag is not enabled (no drag handle rendered). Entry appears static.
- **localStorage unavailable**: Graceful fallback to defaults (week view, no pre-fill). try/catch in utility functions.
- **SSR**: Preferences read only on client mount via useEffect, avoiding hydration mismatch.
- **Concurrent edits**: After move/duplicate, entries refetch via `TIME_ENTRIES_UPDATED_EVENT` to sync state.
