# Design: Azure DevOps Extension — Duration Select, KPI Removal & Bug Fixes

**Date:** 2026-03-24
**Files affected:**
- `azure-devops-extension/src/work-item-form/components/QuickLogForm.tsx`
- `azure-devops-extension/src/work-item-form/components/Dashboard.tsx`
- `azure-devops-extension/src/shared/api.ts`
- `azure-devops-extension/src/shared/scheduling.ts`

---

## 1. Duration Select with Predefined Options

### Problem
The current duration input consists of two separate `<input type="number">` fields (hours and minutes). This requires multiple interactions and is error-prone in the constrained space of a DevOps extension panel.

### Solution
Replace the two number inputs with a single `<select>` element listing predefined durations. A "Personalizado..." option at the end reveals the original h/min inputs inline.

### Predefined Options (value in minutes)
```
15 min  → 15
30 min  → 30
45 min  → 45
1h      → 60
1h 15m  → 75
1h 30m  → 90
1h 45m  → 105
2h      → 120
2h 30m  → 150
3h      → 180
3h 30m  → 210
4h      → 240
5h      → 300
6h      → 360
7h      → 420
8h      → 480
Personalizado... → "custom"
```

### State Changes in `QuickLogForm`
- Remove: `hours: string`, `minutes: string`
- Add: `selectedDuration: string` (default `""` = placeholder/empty), `customHours: string`, `customMinutes: string`
- Duration resolution logic:
  ```ts
  const totalMinutes =
    selectedDuration === "custom"
      ? (Number(customHours) || 0) * 60 + (Number(customMinutes) || 0)
      : Number(selectedDuration) || 0;
  ```
- Reset on success: clear `selectedDuration` back to `""`, clear `customHours`/`customMinutes`

### UI Layout
- The select replaces the h/min inputs in the existing Date + Duration row.
- When `selectedDuration === "custom"`, render the two number inputs (h + min) immediately below the select, styled the same as before.
- The `durationPreview` span is removed (no longer needed — the select label itself is self-descriptive).

---

## 2. Remove KPI Stats Row

### Problem
The stats row (Total, Minhas horas, Timer) occupies ~55px of vertical space in a panel that is already width/height constrained. The data it shows is also visible in the Histórico tab, making it redundant.

### Solution
Remove the `statsRow` block and its three `<Stat>` sub-components from `Dashboard.tsx`. Remove related computed variables `totalHours` and `myHours`. Keep `entryCount` (used for the "Histórico (N)" tab label). Keep `isTimerActive` (used for the timer tab indicator dot).

### Code to Remove
- `const totalHours = minutesToHours(workItemData.totalMinutes);`
- `const myHours = minutesToHours(workItemData.myMinutes);`
- The entire `<div style={s.statsRow}>` block (lines ~226–234)
- The `Stat` sub-component function and its styles (`statCard`, `statLabel`, `statValue`, `statsRow`)
- The `minutesToHours` helper (only used by the removed stats)

---

## 3. Bug Fix: azureWorkItemId Validation Error (400)

### Problem
The API rejects payloads where `azureWorkItemId` is `0` with:
```
{"fieldErrors":{"azureWorkItemId":["Too small: expected number to be >0"]}}
```
This happens for newly created work items whose ID is `0`. The current code uses `workItemId ?? undefined`, but the nullish coalescing operator `??` does not convert `0` to `undefined` — only `null`/`undefined` trigger the fallback.

### Root Cause
In `WorkItemFormApp.tsx`, `getId()` may return `0` for unsaved work items. The guard `typeof id === "number" && Number.isFinite(id)` passes for `0`, so `workItemId` is set to `0`. Then in `QuickLogForm.tsx`:
```ts
azureWorkItemId: workItemId ?? undefined  // 0 ?? undefined === 0 ❌
```

### Fix — `QuickLogForm.tsx`
```ts
azureWorkItemId: workItemId != null && workItemId > 0 ? workItemId : undefined,
```

---

## 4. Bug Fix: CompletedWork Set to 0 When Task is Done

### Problem A — Skipping sync for Done work items
When a work item is set to "Done", calling `setFieldValues` on scheduling fields can produce unexpected results (fields may be read-only or reset by DevOps). The user expects that registering time on a Done task does **not** modify `CompletedWork` or `RemainingWork` — matching DevOps default behavior.

### Fix A — `syncWorkItemFields` in `api.ts`
Before reading/writing scheduling fields, read `System.State`. If the value is a terminal state (`"Done"`, `"Closed"`, `"Resolved"`, `"Removed"`), return early without modifying any fields:
```ts
const state = await formService.getFieldValue("System.State", { returnOriginalValue: false });
const TERMINAL_STATES = new Set(["Done", "Closed", "Resolved", "Removed"]);
if (typeof state === "string" && TERMINAL_STATES.has(state)) {
  return { completedWork: 0, remainingWork: 0, saved: false, skipped: true };
}
```
Return type gains an optional `skipped?: boolean` field.

### Problem B — No OriginalEstimate: only update CompletedWork
When a work item has no `OriginalEstimate` and no `RemainingWork`, the current `resolveSchedulingHours` computes `remainingWork = 0` and writes it back. This overwrites a field that was intentionally empty.

### Fix B — `scheduling.ts` / `syncWorkItemFields`
In `resolveSchedulingHours`, add an `hasOriginalEstimate` flag. When `originalEstimate` is null/empty **and** `remainingWork` is null/empty, return `remainingWork: null` to signal "do not update". In `syncWorkItemFields`, only include `RemainingWork` in the `setFieldValues` call when the returned value is non-null.

```ts
// scheduling.ts
export function resolveSchedulingHours(values: { ... }) {
  const hasEstimate = typeof values.originalEstimate === "number" && values.originalEstimate > 0;
  const hasRemaining = typeof values.remainingWork === "number" && values.remainingWork > 0;
  // ...
  return {
    completedWork: nextCompletedWork,
    remainingWork: (hasEstimate || hasRemaining)
      ? roundHours(Math.max(0, baselineHours - nextCompletedWork))
      : null,  // null = do not write this field
  };
}
```

In `syncWorkItemFields`, conditionally include `RemainingWork`:
```ts
const fieldsToUpdate: Record<string, unknown> = {
  "Microsoft.VSTS.Scheduling.CompletedWork": updatedFields.completedWork,
};
if (updatedFields.remainingWork !== null) {
  fieldsToUpdate["Microsoft.VSTS.Scheduling.RemainingWork"] = updatedFields.remainingWork;
}
```

---

## Files Summary

| File | Change |
|------|--------|
| `QuickLogForm.tsx` | Replace h/min inputs with duration select + custom toggle; fix `azureWorkItemId` guard |
| `Dashboard.tsx` | Remove `statsRow`, `Stat` component, `minutesToHours`, related styles |
| `api.ts` | `syncWorkItemFields`: skip sync for terminal states; conditionally write `RemainingWork` |
| `scheduling.ts` | `resolveSchedulingHours`: return `null` for `remainingWork` when no estimate/remaining exists |

---

## Out of Scope
- Timer tab duration input (uses different component `TimerControl.tsx`) — not requested
- Backend API changes
- Adding new DevOps field syncs beyond the existing ones
