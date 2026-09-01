# Velow Responsive Range Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent weekly/monthly range plans, repair the plan workspace across phone and tablet layouts, make swipe completion discoverable and responsive, and simplify semester controls and progress copy.

**Architecture:** Add a small `RangePlan` aggregate with deterministic week/month keys and an IndexedDB upsert service; keep `PlanTask` as the only task source. Integrate a shared responsive drawer into `PlansPage`, isolate the selected-day task panel from the month calendar, and evolve the existing gesture policy through pure domain functions before changing `TaskBar`.

**Tech Stack:** React 19, TypeScript, CSS Modules, Dexie 4, dexie-react-hooks, Vitest, Testing Library, Vite PWA.

**Spec:** `docs/superpowers/specs/2026-09-01-velow-plan-workspace-responsive-range-plans-design.md`

## Global Constraints

- Work on `feat/multiday-plan-task` in `D:\workplace\projects\project01-velo\workspace`; do not modify the stable `repository` worktree directly.
- Preserve `PlanTask` and `PlanTaskGroup` as the single task source; a range plan never owns or copies tasks.
- Keep the user-visible product name `Velow Notebook` and brand purple `#901D78`.
- Each natural week and each natural month has at most one range plan.
- Mobile uses a bottom drawer; widths from 768px use a right-side drawer.
- No checkbox and no thin task progress bar; completion remains a right-swipe action with keyboard and menu equivalents.
- User-visible “周期” becomes “学期”, while the internal `period` route value and `LearningPeriod` type remain unchanged.
- All interactive targets are at least 44×44 CSS px, focus is visible, and nonessential motion respects `prefers-reduced-motion`.
- Verify 375, 390, 768, 834, 1024, 1366, and 1440px without page-level horizontal overflow.
- Do not add a cloud service, authentication dependency, state-management library, or UI component framework.
- Do not create task-by-task commits; run every test checkpoint, then create one consolidated commit after Task 7 passes.

---

### Task 1: Range-plan domain model and database schema

**Files:**
- Modify: `src/db/types.ts:1-44`
- Modify: `src/db/velo-db.ts:1-67`
- Modify: `src/db/velo-db.test.ts`
- Create: `src/features/plans/domain/range-plans.ts`
- Create: `src/features/plans/domain/range-plans.test.ts`

**Interfaces:**
- Consumes: `parseLocalDate(date: string)` and `formatLocalDate(date: Date)` from the existing local-date helpers.
- Produces: `RangePlanKind`, `RangePlan`, `RangePlanInput`, `getRangePlanBounds(kind, selectedDate)`, `getRangePlanId(kind, selectedDate)`, `normalizeRangePlanInput(input)`, and `validateRangePlanInput(input)`.

- [x] **Step 1: Write failing range-boundary and validation tests**

Create `range-plans.test.ts` with real boundary cases:

```ts
import { describe, expect, it } from "vitest"
import { getRangePlanBounds, getRangePlanId, normalizeRangePlanInput, validateRangePlanInput } from "./range-plans"

describe("range plans", () => {
  it("uses Monday through Sunday across a year boundary", () => {
    expect(getRangePlanBounds("week", "2027-01-01")).toEqual({
      rangeStart: "2026-12-28",
      rangeEnd: "2027-01-03",
    })
    expect(getRangePlanId("week", "2027-01-01")).toBe("week:2026-12-28")
  })

  it("uses the full leap-year month", () => {
    expect(getRangePlanBounds("month", "2028-02-14")).toEqual({
      rangeStart: "2028-02-01",
      rangeEnd: "2028-02-29",
    })
    expect(getRangePlanId("month", "2028-02-14")).toBe("month:2028-02")
  })

  it("normalizes copy and rejects invalid inputs", () => {
    expect(normalizeRangePlanInput({ theme: "  冲刺线代  ", goal: " 完成复习 ", focusItems: [" 矩阵 ", ""], note: " 复盘 " })).toEqual({
      theme: "冲刺线代",
      goal: "完成复习",
      focusItems: ["矩阵"],
      note: "复盘",
    })
    expect(validateRangePlanInput({ theme: " ", goal: "目标", focusItems: [] })).toEqual({ ok: false, field: "theme", message: "请输入计划主题" })
    expect(validateRangePlanInput({ theme: "主题", goal: " ", focusItems: [] })).toEqual({ ok: false, field: "goal", message: "请输入总体目标" })
    expect(validateRangePlanInput({ theme: "主题", goal: "目标", focusItems: ["1", "2", "3", "4", "5", "6"] })).toEqual({ ok: false, field: "focusItems", message: "重点事项最多 5 条" })
  })
})
```

- [x] **Step 2: Run the domain test and observe the missing-module failure**

Run: `pnpm test:run src/features/plans/domain/range-plans.test.ts`

Expected: FAIL because `range-plans.ts` does not exist.

- [x] **Step 3: Add the range-plan types and pure domain implementation**

Add to `src/db/types.ts`:

```ts
export type RangePlanKind = "week" | "month"

export interface RangePlan {
  id: string
  kind: RangePlanKind
  rangeStart: string
  rangeEnd: string
  theme: string
  goal: string
  focusItems: string[]
  note?: string
  createdAt: number
  updatedAt: number
}
```

Create `range-plans.ts` with this public input and result shape:

```ts
export interface RangePlanInput {
  theme: string
  goal: string
  focusItems: string[]
  note?: string
}

export type RangePlanValidation =
  | { ok: true }
  | { ok: false; field: keyof RangePlanInput; message: string }
```

Use local noon dates to avoid UTC offsets. For weeks, subtract `(day + 6) % 7` days to reach Monday; for months, construct the first day and day zero of the following month. Normalize all copy with `trim()`, discard blank focus items, and convert a blank note to `undefined`.

- [x] **Step 4: Add a failing database schema test**

Extend `src/db/velo-db.test.ts` to open the current database and assert:

```ts
expect(db.rangePlans.schema.primKey.keyPath).toBe("id")
expect(db.rangePlans.schema.indexes.map((index) => index.name)).toEqual(
  expect.arrayContaining(["kind", "rangeStart", "rangeEnd", "updatedAt"]),
)
```

Also reuse the existing upgrade fixture to assert that legacy tasks, task groups, learning periods, notes, and app metadata remain unchanged after version 4 opens.

- [x] **Step 5: Run the database test and observe the missing table failure**

Run: `pnpm test:run src/db/velo-db.test.ts`

Expected: FAIL because `VeloDB` has no `rangePlans` table.

- [x] **Step 6: Add database version 4**

Add `rangePlans!: Table<RangePlan, string>` and import `RangePlan`. Add version 4 with every existing version-3 store unchanged plus:

```ts
rangePlans: "&id, kind, rangeStart, rangeEnd, updatedAt"
```

No upgrade callback is needed because the new table is empty and no existing rows change.

- [x] **Step 7: Run the focused tests**

Run: `pnpm test:run src/features/plans/domain/range-plans.test.ts src/db/velo-db.test.ts`

Expected: PASS.

- [x] **Step 8: Record the domain and schema checkpoint**

Run: `git diff --check -- src/db/types.ts src/db/velo-db.ts src/db/velo-db.test.ts src/features/plans/domain/range-plans.ts src/features/plans/domain/range-plans.test.ts`

Expected: no whitespace errors. Keep the verified changes uncommitted for the final consolidated commit.

---

### Task 2: Transactional range-plan persistence and workspace query

**Files:**
- Create: `src/features/plans/data/range-plan-service.ts`
- Create: `src/features/plans/data/range-plan-service.test.ts`
- Modify: `src/features/plans/usePlanWorkspace.ts:5-70`
- Modify: `src/features/plans/usePlanWorkspace.test.tsx`

**Interfaces:**
- Consumes: Task 1 `RangePlan`, `RangePlanKind`, `RangePlanInput`, `getRangePlanBounds`, `getRangePlanId`, `normalizeRangePlanInput`, and `validateRangePlanInput`.
- Produces: `RangePlanValidationError`, `saveRangePlan(db, kind, selectedDate, input, now): Promise<RangePlan>`, `getRangePlan(db, kind, selectedDate): Promise<RangePlan | undefined>`, and `snapshot.rangePlan: RangePlan | null` for week/month views.

- [x] **Step 1: Write failing service tests**

Cover create, same-range update, normalization, validation, and range integrity:

```ts
it("upserts one record for the same natural week", async () => {
  const first = await saveRangePlan(db, "week", "2026-09-01", {
    theme: "线代复习", goal: "完成矩阵章节", focusItems: ["矩阵乘法"], note: "晚间复盘",
  }, 10)
  const second = await saveRangePlan(db, "week", "2026-09-06", {
    theme: "线代冲刺", goal: "完成错题", focusItems: ["秩"], note: "",
  }, 20)

  expect(second.id).toBe(first.id)
  expect(second.createdAt).toBe(10)
  expect(second.updatedAt).toBe(20)
  expect(second.rangeStart).toBe("2026-08-31")
  expect(await db.rangePlans.count()).toBe(1)
})
```

Assert `RangePlanValidationError.field` for blank theme, blank goal, and six focus items. Assert `getRangePlan` returns `undefined` for day views that have no week/month request.

- [x] **Step 2: Run the service test and observe the missing-service failure**

Run: `pnpm test:run src/features/plans/data/range-plan-service.test.ts`

Expected: FAIL because the service does not exist.

- [x] **Step 3: Implement transactional upsert**

The implementation must calculate the deterministic id and bounds inside the service, validate normalized input, and preserve `createdAt`:

```ts
export async function saveRangePlan(
  db: VeloDB,
  kind: RangePlanKind,
  selectedDate: string,
  input: RangePlanInput,
  now: number,
): Promise<RangePlan> {
  const normalized = normalizeRangePlanInput(input)
  const validation = validateRangePlanInput(normalized)
  if (!validation.ok) throw new RangePlanValidationError(validation.field, validation.message)

  return db.transaction("rw", db.rangePlans, async () => {
    const id = getRangePlanId(kind, selectedDate)
    const existing = await db.rangePlans.get(id)
    const bounds = getRangePlanBounds(kind, selectedDate)
    const saved: RangePlan = {
      id,
      kind,
      ...bounds,
      ...normalized,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await db.rangePlans.put(saved)
    return saved
  })
}
```

- [x] **Step 4: Run service tests**

Run: `pnpm test:run src/features/plans/data/range-plan-service.test.ts`

Expected: PASS.

- [x] **Step 5: Write a failing workspace-query test**

In `usePlanWorkspace.test.tsx`, save a week plan and assert a week snapshot returns it, a date from the same week returns the same record, and a day snapshot returns `rangePlan: null`.

- [x] **Step 6: Run the workspace test and observe the missing snapshot field**

Run: `pnpm test:run src/features/plans/usePlanWorkspace.test.tsx`

Expected: FAIL because `PlanWorkspaceSnapshot` has no `rangePlan`.

- [x] **Step 7: Query range plans only for week and month views**

Add `rangePlan: RangePlan | null` to the snapshot. In the live query, derive a key for `week` or `month`, read `db.rangePlans.get(key)`, and return `null` for `day` and `period`. Include `db.rangePlans` in the Dexie query through the table access; no second React hook is needed.

- [x] **Step 8: Run focused tests and record the checkpoint**

Run: `pnpm test:run src/features/plans/data/range-plan-service.test.ts src/features/plans/usePlanWorkspace.test.tsx`

Expected: PASS.

Run: `git diff --check -- src/features/plans/data/range-plan-service.ts src/features/plans/data/range-plan-service.test.ts src/features/plans/usePlanWorkspace.ts src/features/plans/usePlanWorkspace.test.tsx`

Expected: no whitespace errors. Keep the verified changes uncommitted.

---

### Task 3: Responsive range-plan summary and drawer

**Files:**
- Create: `src/features/plans/components/RangePlanSummary.tsx`
- Create: `src/features/plans/components/RangePlanSummary.test.tsx`
- Create: `src/features/plans/components/RangePlanDrawer.tsx`
- Create: `src/features/plans/components/RangePlanDrawer.test.tsx`
- Modify: `src/features/plans/components/PlanDialog.module.css`
- Modify: `src/pages/PlansPage.tsx:107-330`
- Modify: `src/pages/PlansPage.test.tsx`
- Modify: `src/features/plans/PlansPage.module.css`

**Interfaces:**
- Consumes: Task 2 `saveRangePlan`, `RangePlanValidationError`, `snapshot.rangePlan`, `snapshot.progress`, and the existing `PlanDialog` focus trap.
- Produces: `RangePlanSummary({ kind, plan, onOpen })` and `RangePlanDrawer({ db, kind, selectedDate, open, plan, completed, total, onClose, returnFocusTo })`.

- [x] **Step 1: Write failing summary tests**

Assert exact accessible copy:

```tsx
render(<RangePlanSummary kind="week" plan={null} onOpen={onOpen} />)
expect(screen.getByRole("button", { name: "制定本周计划" })).toBeVisible()

render(<RangePlanSummary kind="month" plan={savedPlan} onOpen={onOpen} />)
expect(screen.getByText("线代冲刺")).toBeVisible()
expect(screen.getByRole("button", { name: "查看或编辑本月计划" })).toBeVisible()
```

The button must contain an `aria-hidden` plus icon and have computed `min-height: 44px`.

- [x] **Step 2: Run the summary test and observe the missing-component failure**

Run: `pnpm test:run src/features/plans/components/RangePlanSummary.test.tsx`

Expected: FAIL because `RangePlanSummary.tsx` does not exist.

- [x] **Step 3: Implement the summary component and title-area styling**

Render one semantic section with a single-line theme summary. Use the existing brand button language, cool-blue metadata, and an explicit accessible name. Allow the summary to wrap below the title below 430px.

- [x] **Step 4: Write failing drawer behavior tests**

Test these real flows with a temporary `VeloDB`:

- opens with range label and task summary (`3 项任务 · 已完成 1 项`);
- validates blank theme and goal next to the fields with `aria-describedby` and `aria-invalid`;
- adds and removes focus-item inputs up to five;
- saves one record and calls `onClose`;
- edits an existing plan without creating a second row;
- a rejected first save retains the typed values and exposes a “重试” button;
- Escape with a dirty form opens an in-drawer discard confirmation; confirming closes and returns focus to the trigger.

- [x] **Step 5: Run the drawer test and observe the missing-component failure**

Run: `pnpm test:run src/features/plans/components/RangePlanDrawer.test.tsx`

Expected: FAIL because `RangePlanDrawer.tsx` does not exist.

- [x] **Step 6: Implement the shared drawer using `PlanDialog`**

Use native labeled inputs and the existing dialog focus trap. Track a normalized initial draft to detect unsaved changes. Keep the form mounted only while `open` is true so changing week/month cannot leak stale values. The action row contains `取消` and `保存计划`; on phone it remains inside the scrollable form above the safe area.

Add `.rangePlanForm` to the same responsive surface selectors as `.form`; at 768px it inherits the existing 360px right drawer. Do not create a second overlay system.

- [x] **Step 7: Write a failing page-integration test**

In `PlansPage.test.tsx`, render a week URL and assert the “制定本周计划” button opens a dialog. Save a plan, close it, and assert the title-area summary changes to “查看或编辑本周计划” without reloading. Repeat the entry assertion for a month URL. Assert day and semester views do not show a range-plan button.

- [x] **Step 8: Run the page test and observe the missing integration**

Run: `pnpm test:run src/pages/PlansPage.test.tsx`

Expected: FAIL because `PlansPage` does not render the summary or drawer.

- [x] **Step 9: Integrate with `PlansPage`**

Store `isRangePlanDrawerOpen` and `rangePlanTrigger`. Derive `rangePlanKind` only when `view` is `week` or `month`. Render the summary inside `.surfaceHeading` and the drawer beside existing dialogs. Pass `snapshot.rangePlan`, `snapshot.progress.completed`, and `snapshot.progress.total`. Close the range drawer before opening task or learning-period editors.

- [x] **Step 10: Run focused tests and record the checkpoint**

Run: `pnpm test:run src/features/plans/components/RangePlanSummary.test.tsx src/features/plans/components/RangePlanDrawer.test.tsx src/pages/PlansPage.test.tsx`

Expected: PASS.

Run: `git diff --check -- src/features/plans/components/RangePlanSummary.tsx src/features/plans/components/RangePlanDrawer.tsx src/features/plans/components/PlanDialog.module.css src/pages/PlansPage.tsx src/features/plans/PlansPage.module.css`

Expected: no whitespace errors. Keep the verified changes uncommitted.

---

### Task 4: Month selected-day panel and phone/tablet layout

**Files:**
- Create: `src/features/plans/components/SelectedDayTaskPanel.tsx`
- Create: `src/features/plans/components/SelectedDayTaskPanel.test.tsx`
- Modify: `src/features/plans/components/MonthPlanView.tsx:45-112`
- Modify: `src/features/plans/components/MonthPlanView.test.tsx`
- Modify: `src/features/plans/components/WeekPlanView.tsx:45-108`
- Modify: `src/features/plans/PlansPage.module.css:280-557`
- Modify: `src/features/plans/PlansPage.responsive.test.ts`

**Interfaces:**
- Consumes: existing `TaskBar`, selected date, sorted selected-date tasks, task-group labels, and task open/move callbacks.
- Produces: `SelectedDayTaskPanel({ dateLabel, tasks, renderTask, variant })` with an accessible disclosure on phone/portrait and a static scroll panel on landscape.

- [x] **Step 1: Write failing selected-day panel tests**

Test a five-task panel:

```tsx
expect(screen.getByRole("button", { name: "展开 2026年9月1日任务" })).toHaveAttribute("aria-expanded", "false")
expect(screen.getByText("另有 3 项")).toBeVisible()
expect(screen.queryByText("任务 5")).not.toBeInTheDocument()

await user.click(screen.getByRole("button", { name: "展开 2026年9月1日任务" }))
expect(screen.getByRole("button", { name: "收起 2026年9月1日任务" })).toHaveAttribute("aria-expanded", "true")
expect(screen.getByText("任务 5")).toBeVisible()
```

Assert the list container has a stable `id` referenced by `aria-controls`.

- [x] **Step 2: Run the panel test and observe the missing-component failure**

Run: `pnpm test:run src/features/plans/components/SelectedDayTaskPanel.test.tsx`

Expected: FAIL because the component does not exist.

- [x] **Step 3: Implement the panel without duplicating task behavior**

The panel receives `renderTask(task)` so it does not know about the database or task groups. In compact mode it renders the first two items plus `另有 N 项`; in expanded mode it renders all items in the same `ul`. Add a dedicated disclosure button rather than making the whole section clickable.

- [x] **Step 4: Write failing month-view and CSS contract tests**

Update `MonthPlanView.test.tsx` to assert five tasks create a collapsed selected-day panel and clicking another date resets the panel scroll position without changing its expanded state.

Replace outdated fixed-width CSS assertions with contracts for:

```ts
expect(css).toMatch(/\.monthWeekDays\s*{[^}]*grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\)/s)
expect(css).toMatch(/\.monthGrid\s*{[^}]*min-width:\s*0/s)
expect(css).toMatch(/\.monthTaskPanelList\s*{[^}]*overflow-y:\s*auto/s)
expect(css).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.viewSurface\s*{[^}]*grid-column:\s*1\s*\/\s*-1/s)
expect(css).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.monthPlan\s*{[^}]*grid-template-columns:\s*minmax\(0, 1\.7fr\) minmax\(280px, 1fr\)/s)
```

- [x] **Step 5: Run focused tests and observe the old layout failures**

Run: `pnpm test:run src/features/plans/components/SelectedDayTaskPanel.test.tsx src/features/plans/components/MonthPlanView.test.tsx src/features/plans/PlansPage.responsive.test.ts`

Expected: FAIL because `MonthPlanView` still owns the unbounded task section and CSS uses fixed 44px month columns/old sticky panel behavior.

- [x] **Step 6: Refactor month rendering and responsive CSS**

Use `SelectedDayTaskPanel` for the selected day. Remove negative or viewport-edge positioning from `.monthTaskPanel`. Apply `min-width: 0` through `.viewSurface`, `.monthPlan`, `.monthGrid`, `.monthWeekRow`, and `.monthWeekDays`. Use seven `minmax(0, 1fr)` columns and `box-sizing: border-box` for date cells.

At 768–1023px, stack calendar and selected-day panel. At 1024px and above, make `.viewSurface` span the workspace and give `.monthPlan` a 1.7fr/1fr internal grid. Place `.progressPanel` and `.periodContext` on the row below as equal columns. Keep the weekly grid full width at the same breakpoint.

- [x] **Step 7: Run focused tests and record the checkpoint**

Run: `pnpm test:run src/features/plans/components/SelectedDayTaskPanel.test.tsx src/features/plans/components/MonthPlanView.test.tsx src/features/plans/components/WeekPlanView.test.tsx src/features/plans/PlansPage.responsive.test.ts`

Expected: PASS.

Run: `git diff --check -- src/features/plans/components/SelectedDayTaskPanel.tsx src/features/plans/components/MonthPlanView.tsx src/features/plans/components/WeekPlanView.tsx src/features/plans/PlansPage.module.css`

Expected: no whitespace errors. Keep the verified changes uncommitted.

---

### Task 5: Discoverable and responsive swipe completion

**Files:**
- Modify: `src/features/plans/domain/task-gesture.ts`
- Modify: `src/features/plans/domain/task-gesture.test.ts`
- Modify: `src/features/plans/components/TaskBar.tsx:23-260`
- Modify: `src/features/plans/components/TaskBar.test.tsx`
- Modify: `src/features/plans/components/TaskBar.module.css`
- Create: `src/features/plans/components/SwipeDiscoveryHint.tsx`
- Create: `src/features/plans/components/SwipeDiscoveryHint.test.tsx`
- Modify: `src/pages/PlansPage.tsx`
- Modify: `src/pages/PlansPage.test.tsx`

**Interfaces:**
- Consumes: existing `FlowArrowIcon`, `setTaskCompletion`, `appMeta`, and `UndoNotice`.
- Produces: `getGestureIntent(deltaX, deltaY)`, `shouldCompleteSwipe(distance, width, elapsedMs)`, and the persisted app-meta key `plan:swipe-completion-hint-dismissed`.

- [x] **Step 1: Rewrite gesture-policy tests for direction, threshold, and velocity**

Replace the 70% expectation with:

```ts
expect(getGestureIntent(5, 1)).toBe("pending")
expect(getGestureIntent(7, 2)).toBe("horizontal")
expect(getGestureIntent(4, 12)).toBe("vertical")
expect(shouldCompleteSwipe(44, 100, 800)).toBe(false)
expect(shouldCompleteSwipe(45, 100, 800)).toBe(true)
expect(shouldCompleteSwipe(20, 100, 30)).toBe(true)
expect(shouldCompleteSwipe(19, 100, 30)).toBe(false)
```

Use the constants `SWIPE_START_PX = 6`, `SWIPE_DISTANCE_RATIO = 0.45`, `FLICK_MIN_RATIO = 0.2`, and `FLICK_MIN_VELOCITY = 0.55` so tests and production share one policy.

- [x] **Step 2: Run the domain test and observe the old-policy failure**

Run: `pnpm test:run src/features/plans/domain/task-gesture.test.ts`

Expected: FAIL because direction and elapsed-time APIs do not exist and the old threshold is 70%.

- [x] **Step 3: Implement the pure gesture policy**

Return `"pending" | "horizontal" | "vertical"`. Before 6px of dominant movement return pending; after that, lock to the dominant axis. Complete when distance ratio is at least 0.45, or when it is at least 0.2 and positive velocity is at least 0.55px/ms.

- [x] **Step 4: Write failing TaskBar interaction tests**

Add real pointer sequences for:

- 45px slow swipe completes a 100px task;
- 44px slow swipe does not complete;
- 20px in 30ms completes as a flick;
- vertical dominance cancels swipe and preserves scroll behavior;
- horizontal intent clears the 350ms long-press timer;
- an incomplete task always contains a decorative flow arrow before movement;
- a completed task has “已完成” text and no checkbox or thin progress element;
- reduced-motion styles remove transition duration.

Mock pointer timestamps by passing `timeStamp` in `fireEvent.pointerDown`, `pointerMove`, and `pointerUp`.

- [x] **Step 5: Run TaskBar tests and observe the old interaction failures**

Run: `pnpm test:run src/features/plans/components/TaskBar.test.tsx`

Expected: FAIL because `TaskBar` still waits for 70%, cancels vertical motion at a fixed 8px without direction locking, and renders the arrow only while swiping.

- [x] **Step 6: Update `TaskBar` with an axis lock and persistent arrow**

Add `pointerStartedAt` and `gestureIntent` refs. On pointer move, lock once the pure policy leaves pending. Horizontal intent cancels the long-press timer and updates progress; vertical intent clears swipe state and leaves the gesture to scrolling. On release, pass elapsed milliseconds into `shouldCompleteSwipe`.

Render `FlowArrowIcon` for every incomplete task with `aria-hidden="true"`; use CSS variables for opacity and transform. Keep completion fill as a transformed overlay, not a layout-width animation. Preserve Enter/Space completion, long-press dragging, undo, retry, and click suppression.

- [x] **Step 7: Write failing one-time discovery hint tests**

Render the hint with a temporary database. Assert the arrow and “向右滑动完成” appear when the app-meta key is missing, the dismiss button is 44px, clicking it writes `value: "1"`, and remounting hides the hint.

- [x] **Step 8: Implement and integrate the discovery hint**

Create `SwipeDiscoveryHint` with a live query on `db.appMeta.get("plan:swipe-completion-hint-dismissed")`. Render it in `PlansPage` only when the current snapshot has an incomplete task. Dismiss with a transaction-safe `put` and keep retry UI on failure.

- [x] **Step 9: Run focused tests and record the checkpoint**

Run: `pnpm test:run src/features/plans/domain/task-gesture.test.ts src/features/plans/components/TaskBar.test.tsx src/features/plans/components/SwipeDiscoveryHint.test.tsx src/pages/PlansPage.test.tsx`

Expected: PASS.

Run: `git diff --check -- src/features/plans/domain/task-gesture.ts src/features/plans/components/TaskBar.tsx src/features/plans/components/TaskBar.module.css src/features/plans/components/SwipeDiscoveryHint.tsx src/pages/PlansPage.tsx`

Expected: no whitespace errors. Keep the verified changes uncommitted.

---

### Task 6: Semester controls and view-specific progress copy

**Files:**
- Create: `src/features/plans/components/PeriodActionsMenu.tsx`
- Create: `src/features/plans/components/PeriodActionsMenu.test.tsx`
- Modify: `src/features/plans/components/LearningPeriodView.tsx:45-116`
- Modify: `src/features/plans/components/LearningPeriodView.test.tsx`
- Modify: `src/features/plans/components/PlanViewSwitcher.tsx:10-16`
- Modify: `src/features/plans/components/PlanProgress.tsx`
- Create: `src/features/plans/components/PlanProgress.test.tsx`
- Modify: `src/pages/PlansPage.tsx`
- Modify: `src/pages/PlansPage.test.tsx`
- Modify: `src/features/plans/PlansPage.module.css:558-650`

**Interfaces:**
- Consumes: existing learning-period callbacks and `PlanView`.
- Produces: `PeriodActionsMenu({ period, canMigrate, onEdit, onMigrate, onDelete })` and `PlanProgress({ completed, total, view })`.

- [x] **Step 1: Write failing progress-copy tests**

Use a parameterized component test:

```tsx
it.each([
  ["day", 1, 1, "今日任务已全部完成"],
  ["week", 2, 2, "本周任务已全部完成"],
  ["month", 3, 3, "本月任务已全部完成"],
  ["period", 4, 4, "本学期任务已全部完成"],
] as const)("uses %s completion copy", (view, completed, total, copy) => {
  render(<PlanProgress completed={completed} total={total} view={view} />)
  expect(screen.getByText(copy)).toBeVisible()
})
```

Also assert `0/0` reads “当前还没有任务” and `2/5` reads “已完成 2 项，还有 3 项”.

- [x] **Step 2: Run the progress test and observe the missing `view` API**

Run: `pnpm test:run src/features/plans/components/PlanProgress.test.tsx`

Expected: FAIL because the component does not accept `view` and still emits generic copy.

- [x] **Step 3: Implement view-specific copy and pass the current view**

Use a `Record<PlanView, string>` for the all-complete sentence and pass `view` from `PlansPage`. Keep the native `<progress>` element and polite numeric announcement.

- [x] **Step 4: Write failing semester navigation and action tests**

Assert:

- the view switcher button label is “学期”, not “周期”;
- the page heading is “学期与假期”;
- the top primary button is named “新建学期或假期” and contains an aria-hidden plus;
- no secondary “新建周期” button remains below the list;
- the selected period exposes one “更多学期操作” control;
- opening it shows “编辑学期”“处理上学期任务”“删除学期”;
- delete remains a normal button that calls the existing confirmation flow;
- the context card says “当前学期” or “当前日期未归属学期或假期”.

- [x] **Step 5: Run focused tests and observe old labels/layout**

Run: `pnpm test:run src/features/plans/components/LearningPeriodView.test.tsx src/pages/PlansPage.test.tsx`

Expected: FAIL because old “周期” copy and three inline action buttons remain.

- [x] **Step 6: Implement an accessible compact actions menu**

Use native `<details>` and `<summary aria-label="更多学期操作">` so keyboard activation and disclosure state work without a new menu library. Place three full-width buttons inside; delete uses danger text plus a “危险操作” visually hidden label, not color alone. Close the disclosure after any action.

Move the create action above the period-card list and style it as a brand primary button. Keep the empty-state primary action. Rename user-facing copy while preserving `view=period`, `LearningPeriod`, and existing database values.

- [x] **Step 7: Run focused tests and record the checkpoint**

Run: `pnpm test:run src/features/plans/components/PlanProgress.test.tsx src/features/plans/components/LearningPeriodView.test.tsx src/pages/PlansPage.test.tsx`

Expected: PASS.

Run: `git diff --check -- src/features/plans/components/PeriodActionsMenu.tsx src/features/plans/components/LearningPeriodView.tsx src/features/plans/components/PlanViewSwitcher.tsx src/features/plans/components/PlanProgress.tsx src/pages/PlansPage.tsx src/features/plans/PlansPage.module.css`

Expected: no whitespace errors. Keep the verified changes uncommitted.

---

### Task 7: Full verification, browser matrix, and delivery documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/design-qa.md`
- Modify: `docs/superpowers/plans/2026-09-01-velow-responsive-range-plans.md`

**Interfaces:**
- Consumes: all tasks above.
- Produces: a verified implementation, updated QA evidence, and a checked-off execution plan.

- [x] **Step 1: Run the complete automated verification**

Run: `pnpm verify`

Expected: typecheck, ESLint, every Vitest suite, and production build pass. The existing Vite chunk-size advisory may remain; new errors or warnings may not.

- [x] **Step 2: Run the PWA lifecycle verification**

Run: `pnpm test:pwa-lifecycle`

Expected: PASS with the existing database name `velo` and no loss of tasks, range plans, learning periods, notes, or app metadata.

- [x] **Step 3: Inspect the phone layout in the local browser**

At widths 375 and 390px, verify:

- week/month range-plan entry is visible and at least 44px;
- month calendar remains inside its background card;
- selected-day tasks show two previews and “另有 N 项”, then expand to an internally scrolling list;
- slow 45% swipe and fast flick complete, vertical scroll does not;
- persistent arrow and one-time hint are visible without a checkbox;
- bottom range-plan drawer avoids the fixed bottom navigation and safe area.

- [x] **Step 4: Inspect tablet portrait layouts**

At widths 768 and 834px, verify the calendar spans the content width, the task panel stacks below, range-plan editing opens from the right, and progress/current-semester cards do not overlap at 200% text zoom.

- [x] **Step 5: Inspect tablet landscape and desktop layouts**

At widths 1024, 1366, and 1440px, verify the view surface spans the workspace, the month calendar and selected-day panel use the intended 1.7fr/1fr split, progress and current semester are equal cards below, and no page-level horizontal scrollbar exists.

- [x] **Step 6: Inspect accessibility and motion states**

Use keyboard only to open/save/cancel the range drawer, expand the selected-day panel, complete a task, open semester actions, and return focus after closing. Enable `prefers-reduced-motion: reduce` and verify gesture state changes remain understandable without sliding animations.

- [x] **Step 7: Update delivery documentation**

Add to `README.md` that weekly/monthly overall plans are local-first range notes and do not duplicate tasks. Add the tested viewport matrix, swipe thresholds, semester copy, drawer behavior, and any remaining known limitations to `docs/design-qa.md`.

Mark each completed checkbox in this plan as `[x]`; do not change requirement text.

- [x] **Step 8: Re-run repository checks and commit**

Run:

```powershell
git status --short
git diff --check
pnpm verify
```

Expected: only intended documentation changes remain before commit, `git diff --check` is clean, and verification passes.

Create one consolidated commit containing every verified implementation, test, plan, and documentation file:

```powershell
git add --all
git commit -m "feat: refine responsive learning plans"
```
