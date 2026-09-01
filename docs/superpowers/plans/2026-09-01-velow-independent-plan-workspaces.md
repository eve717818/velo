# Velow Notebook Independent Plan Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace calendar-derived rollups with four isolated day, week, month, and semester task workspaces that share one readable task-list UI and the existing swipe-to-complete interaction.

**Architecture:** Keep one IndexedDB `planTasks` table and add `scope + periodKey` as the sole ownership boundary. A small period-key domain module normalizes navigation and validation; the data service and live query read only the active key; shared list and navigator components render week, month, and semester workspaces while the existing day lanes retain time-of-day support.

**Tech Stack:** React 19, TypeScript 5.9, Dexie 4/IndexedDB, React Router 7, CSS Modules, Vitest + Testing Library, Playwright, Vite PWA.

**Spec:** `docs/superpowers/specs/2026-09-01-velow-independent-plan-workspaces-design.md`

## Global Constraints

- Every task has exactly one scope: `day`, `week`, `month`, or `semester`.
- A task is queried and counted only in its own `scope + periodKey`; no automatic cross-level rollup is allowed.
- Existing v4 tasks migrate to day tasks using their original `scheduledDate`; group-step metadata is cleared but task content and completion state are preserved.
- Week and month calendars, multi-day bands, multi-day creation mode, and range-plan summary/drawer UI must not render.
- Existing `planTaskGroups` and `rangePlans` tables remain physically present but receive no new reads or writes.
- `startMinutes` is valid only for day tasks.
- All four workspaces keep the existing right-swipe completion, undo, keyboard equivalent, reduced-motion behavior, and offline persistence.
- User-visible long-period copy remains “学期计划”; the selector may contain semesters and all supported holiday kinds.
- Every period-navigation and create control has a touch target of at least `44px × 44px`.
- At 200% text zoom, task titles, metadata, and completion state remain readable without overlap or horizontal scrolling.
- Invalid or missing semester IDs block saving with `请选择有效的学期或假期`; a failed save preserves every entered field and the current workspace position.
- Completion and navigation state never rely on color alone; dialogs preserve focus entry/return, Escape close, and inert background behavior.
- All non-essential motion respects `prefers-reduced-motion: reduce`.
- No new runtime dependencies.
- Do not touch or stage unrelated workspace files, especially the root `.firecrawl/` directory.

---

### Task 1: Plan scope and period-key domain

**Files:**
- Modify: `src/db/types.ts`
- Create: `src/features/plans/domain/plan-period-keys.ts`
- Test: `src/features/plans/domain/plan-period-keys.test.ts`

**Interfaces:**
- Produces: `PlanTaskScope = "day" | "week" | "month" | "semester"`.
- Produces: `getPlanPeriodKey(scope, selectedDate, periodId?) => string | null`.
- Produces: `assertValidPlanPeriodKey(scope, periodKey) => void`.
- Produces: `shiftPlanPeriod(scope, selectedDate, amount) => string` for day/week/month navigation.
- Produces: `formatPlanPeriodLabel(scope, selectedDate, period?) => string`.

- [ ] **Step 1: Write failing period-key tests**

```ts
import { describe, expect, it } from "vitest"
import {
  assertValidPlanPeriodKey,
  formatPlanPeriodLabel,
  getPlanPeriodKey,
  shiftPlanPeriod,
} from "./plan-period-keys"

describe("plan period keys", () => {
  it("normalizes every independent task scope", () => {
    expect(getPlanPeriodKey("day", "2026-09-01")).toBe("2026-09-01")
    expect(getPlanPeriodKey("week", "2026-09-03")).toBe("2026-08-31")
    expect(getPlanPeriodKey("month", "2026-09-03")).toBe("2026-09")
    expect(getPlanPeriodKey("semester", "2026-09-03", "fall-2026")).toBe("fall-2026")
    expect(getPlanPeriodKey("semester", "2026-09-03")).toBeNull()
  })

  it("shifts calendar-backed scopes across year boundaries", () => {
    expect(shiftPlanPeriod("day", "2026-12-31", 1)).toBe("2027-01-01")
    expect(shiftPlanPeriod("week", "2026-12-31", 1)).toBe("2027-01-07")
    expect(shiftPlanPeriod("month", "2026-12-15", 1)).toBe("2027-01-15")
  })

  it("validates leap days, Monday week keys, and malformed months", () => {
    expect(() => assertValidPlanPeriodKey("day", "2028-02-29")).not.toThrow()
    expect(() => assertValidPlanPeriodKey("day", "2027-02-29")).toThrow("日计划周期无效")
    expect(() => assertValidPlanPeriodKey("week", "2026-09-01")).toThrow("周计划周期无效")
    expect(() => assertValidPlanPeriodKey("month", "2026-13")).toThrow("月计划周期无效")
  })

  it("formats visible labels", () => {
    expect(formatPlanPeriodLabel("week", "2026-09-01")).toBe("8月31日—9月6日")
    expect(formatPlanPeriodLabel("month", "2026-09-01")).toBe("2026年9月")
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test:run src/features/plans/domain/plan-period-keys.test.ts`

Expected: FAIL because `plan-period-keys.ts` does not exist.

- [ ] **Step 3: Add the scope type and minimal domain implementation**

```ts
// src/db/types.ts
export type PlanTaskScope = "day" | "week" | "month" | "semester"
```

```ts
// src/features/plans/domain/plan-period-keys.ts
import type { LearningPeriod, PlanTaskScope } from "@/db/types"
import { formatLocalDate } from "../../../lib/local-date"
import { addLocalDays, getWeekDates, parseLocalDate } from "./plan-dates"

export function getPlanPeriodKey(scope: PlanTaskScope, selectedDate: string, periodId?: string) {
  if (scope === "day") return selectedDate
  if (scope === "week") return getWeekDates(selectedDate)[0]
  if (scope === "month") return selectedDate.slice(0, 7)
  return periodId ?? null
}

export function assertValidPlanPeriodKey(scope: PlanTaskScope, periodKey: string) {
  if (scope === "day" || scope === "week") {
    try { parseLocalDate(periodKey) } catch { throw new Error(scope === "day" ? "日计划周期无效" : "周计划周期无效") }
    if (scope === "week" && getWeekDates(periodKey)[0] !== periodKey) throw new Error("周计划周期无效")
    return
  }
  if (scope === "month") {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) throw new Error("月计划周期无效")
    return
  }
  if (!periodKey.trim()) throw new Error("请选择学期或假期")
}

export function shiftPlanPeriod(scope: Exclude<PlanTaskScope, "semester">, selectedDate: string, amount: number) {
  if (scope === "day") return addLocalDays(selectedDate, amount)
  if (scope === "week") return addLocalDays(selectedDate, amount * 7)
  const value = parseLocalDate(selectedDate)
  return formatLocalDate(new Date(value.getFullYear(), value.getMonth() + amount, Math.min(value.getDate(), 28), 12))
}

export function formatPlanPeriodLabel(scope: PlanTaskScope, selectedDate: string, period?: LearningPeriod) {
  if (scope === "day") return selectedDate
  if (scope === "week") {
    const dates = getWeekDates(selectedDate).map(parseLocalDate)
    return `${dates[0].getMonth() + 1}月${dates[0].getDate()}日—${dates[6].getMonth() + 1}月${dates[6].getDate()}日`
  }
  if (scope === "month") {
    const value = parseLocalDate(`${selectedDate.slice(0, 7)}-01`)
    return `${value.getFullYear()}年${value.getMonth() + 1}月`
  }
  return period?.name ?? "选择学期或假期"
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test:run src/features/plans/domain/plan-period-keys.test.ts && pnpm typecheck`

Expected: period-key tests PASS; typecheck PASS because `PlanTask` has not changed yet.

- [ ] **Step 5: Commit the domain boundary**

```bash
git add src/db/types.ts src/features/plans/domain/plan-period-keys.ts src/features/plans/domain/plan-period-keys.test.ts
git commit -m "feat: define independent plan period keys"
```

---

### Task 2: IndexedDB v5 migration to isolated task ownership

**Files:**
- Modify: `src/db/types.ts`
- Modify: `src/db/velo-db.ts`
- Modify: `src/db/velo-db.test.ts`
- Modify: `src/db/seed.ts`

**Interfaces:**
- Consumes: `PlanTaskScope`, `assertValidPlanPeriodKey` from Task 1.
- Produces: required `PlanTask.scope` and `PlanTask.periodKey` fields.
- Produces: Dexie v5 index `[scope+periodKey]` and `[scope+periodKey+isCompleted]`.
- Migration guarantee: all v4 rows become day tasks and lose group-step fields without losing user content.

- [ ] **Step 1: Add a failing v4-to-v5 migration test**

Add a `createVersionFourDatabase` helper that installs the exact v4 stores and inserts raw dated rows. Test both a normal row and a grouped step:

```ts
it("upgrades v4 tasks into independent day tasks", async () => {
  const name = `velo-v4-upgrade-${crypto.randomUUID()}`
  await createVersionFourDatabase(name, [
    existingTask,
    { ...existingTask, id: "group-step", groupId: "group", stepIndex: 2, stepTitleMode: "inherit", isCompleted: 1 },
  ])

  const db = new VeloDB(name)
  await db.open()

  expect(await db.planTasks.get("existing-task")).toMatchObject({
    scope: "day",
    periodKey: "2026-08-25",
    title: "已有计划",
  })
  expect(await db.planTasks.get("group-step")).toMatchObject({
    scope: "day",
    periodKey: "2026-08-25",
    isCompleted: 1,
  })
  expect(await db.planTasks.get("group-step")).not.toHaveProperty("groupId")
  expect(await db.planTaskGroups.count()).toBeGreaterThanOrEqual(0)
  await db.delete()
})
```

- [ ] **Step 2: Run the migration test and verify RED**

Run: `pnpm test:run src/db/velo-db.test.ts -t "upgrades v4 tasks"`

Expected: FAIL because v5 fields and migration do not exist.

- [ ] **Step 3: Change `PlanTask` to the new ownership model**

Replace `scheduledDate`, `groupId`, `stepIndex`, and `stepTitleMode` with:

```ts
scope: PlanTaskScope
periodKey: string
```

Keep all common content, completion, order, and timestamp fields. Keep `startMinutes?: number` for day tasks.

- [ ] **Step 4: Add the Dexie v5 schema and atomic migration**

```ts
this.version(5)
  .stores({
    planTasks: "id, [scope+periodKey], scope, periodKey, [scope+periodKey+isCompleted], isCompleted, updatedAt",
    planTaskGroups: "id, startDate, endDate, updatedAt",
    rangePlans: "&id, kind, rangeStart, rangeEnd, updatedAt",
    learningPeriods: "id, kind, startDate, endDate, updatedAt",
    legacyPlanTasks: "id, scope, periodKey, updatedAt",
    knowledgeNodes: "id, parentId, type, order, updatedAt",
    notes: "id, nodeId, title, updatedAt",
    appMeta: "key, updatedAt",
  })
  .upgrade(async (transaction) => {
    const tasks = transaction.table("planTasks")
    for (const row of await tasks.toArray()) {
      const { scheduledDate, groupId: _groupId, stepIndex: _stepIndex, stepTitleMode: _stepTitleMode, ...rest } = row
      if (typeof scheduledDate !== "string") throw new Error("v4 任务日期缺失")
      assertValidPlanPeriodKey("day", scheduledDate)
      await tasks.put({ ...rest, scope: "day", periodKey: scheduledDate, startMinutes: row.startMinutes })
    }
  })
```

Import `assertValidPlanPeriodKey` from the domain module. Use a local raw-row type for the migration so TypeScript does not pretend v4 rows already satisfy v5 `PlanTask`. Add a second migration test whose raw row has `scheduledDate: "2027-02-29"`; opening v5 must reject and reopening the raw v4 database must show that every original row is still present, proving the upgrade transaction rolled back atomically.

- [ ] **Step 5: Update deterministic seed rows and schema assertions**

Every seed task must include `scope: "day"` and `periodKey: formatLocalDate(seedDate)`. Replace assertions using `where("scheduledDate")` with `where("[scope+periodKey]").equals(["day", key])`. Assert the old task-group and range-plan tables still exist.

- [ ] **Step 6: Run database and seed tests**

Run: `pnpm test:run src/db/velo-db.test.ts`

Expected: all migration, seed, and preservation tests PASS.

- [ ] **Step 7: Commit the database upgrade**

```bash
git add src/db/types.ts src/db/velo-db.ts src/db/velo-db.test.ts src/db/seed.ts
git commit -m "feat: migrate tasks to isolated plan scopes"
```

---

### Task 3: Scope-aware task service and ordering

**Files:**
- Modify: `src/features/plans/data/task-order.ts`
- Modify: `src/features/plans/data/plan-task-service.ts`
- Modify: `src/features/plans/data/plan-task-service.test.ts`
- Modify: `src/features/plans/components/TaskBar.tsx`
- Modify: `src/features/plans/components/TaskBar.test.tsx`
- Modify: `src/features/plans/components/TaskDragLayer.test.tsx`
- Modify: `src/features/plans/components/LegacyPlanMigrationPanel.test.tsx`
- Modify: `src/features/plans/domain/plan-dates.ts`
- Modify: `src/features/plans/domain/plan-dates.test.ts`
- Modify: `src/features/plans/domain/task-drop.ts`
- Modify: `src/features/plans/domain/task-drop.test.ts`
- Modify: `src/features/plans/data/legacy-plan-task-service.ts`
- Modify: `src/features/plans/data/legacy-plan-task-service.test.ts`

**Interfaces:**
- Consumes: `PlanTaskScope`, `assertValidPlanPeriodKey`.
- Produces: `PlanTaskLocation = { scope; periodKey; startMinutes?; order }`.
- Produces: `CreatePlanTaskInput` and `UpdatePlanTaskInput` with `scope` and `periodKey`.
- Produces: `MovePlanTaskInput` that permits a new key only within the existing scope.
- Produces: `getNextTaskOrder(db, scope, periodKey, startMinutes)`.

- [ ] **Step 1: Rewrite service tests around isolated ownership**

```ts
const created = await createPlanTask(db, {
  scope: "week",
  periodKey: "2026-08-31",
  title: "完成线代复习",
  estimatedMinutes: 90,
}, 100)

expect(created).toMatchObject({ scope: "week", periodKey: "2026-08-31", startMinutes: undefined })

await expect(updatePlanTask(db, created.id, {
  scope: "month",
  periodKey: "2026-09",
  title: created.title,
}, 101)).rejects.toThrow("不能跨计划层级移动任务")

await expect(createPlanTask(db, {
  scope: "month",
  periodKey: "2026-09",
  title: "不允许时间",
  startMinutes: 540,
}, 102)).rejects.toThrow("只有日计划任务可以设置时间")

await expect(createPlanTask(db, {
  scope: "semester",
  periodKey: "missing-period",
  title: "不存在的学期",
}, 103)).rejects.toThrow("请选择有效的学期或假期")
```

Add ordering tests proving day and week tasks with the same textual date key do not share an order sequence.

- [ ] **Step 2: Run service tests and verify RED**

Run: `pnpm test:run src/features/plans/data/plan-task-service.test.ts`

Expected: compile/test failures because service inputs still require `scheduledDate`.

- [ ] **Step 3: Implement location validation and scoped ordering**

```ts
export interface PlanTaskLocation {
  scope: PlanTaskScope
  periodKey: string
  startMinutes?: number
  order: number
}

export interface CreatePlanTaskInput {
  scope: PlanTaskScope
  periodKey: string
  title: string
  startMinutes?: number
  subject?: string
  estimatedMinutes?: number
  notes?: string
}
```

`assertValidTaskInput` must call `assertValidPlanPeriodKey`, reject `startMinutes` for non-day scopes, and normalize text. Because semester validity depends on IndexedDB, `createPlanTask`, `updatePlanTask`, and `movePlanTask` must verify `await db.learningPeriods.get(periodKey)` inside the same transaction before writing a semester task; a missing row throws `请选择有效的学期或假期`. `updatePlanTask` must compare `input.scope` to the stored task scope before mutation. `getNextTaskOrder` must query `[scope+periodKey]` and preserve timed/untimed lanes only for day tasks.

- [ ] **Step 4: Update move and undo position types**

Replace `TaskPosition.scheduledDate` with `scope` and `periodKey`. Change `TaskDropTarget` to `{ scope: "day"; periodKey: string; startMinutes?: number }`, reading `data-drop-period-key` instead of `data-drop-date`; only `DayPlanView` emits those drop targets. `TaskBar` must emit the new immutable previous position. `movePlanTask` must reject an input whose `scope` differs from the stored scope, while allowing a new `periodKey` for the same scope.

- [ ] **Step 5: Update long-period copy behavior**

`copyTasksToPeriod` and `copyTasksToPeriodAndDismiss` must create new tasks with `scope: "semester"`, `periodKey: targetPeriod.id`, `startMinutes: undefined`, and fresh incomplete state. They must not choose or write a calendar date.

Update legacy day-task conversion to create `{ scope: "day", periodKey: scheduledDate }`; update `LegacyPlanMigrationPanel.test.tsx` to assert that shape. This keeps the explicit legacy-import action valid without restoring cross-level rollups. Change `isOverdue` to accept `Pick<PlanTask, "scope" | "periodKey" | "isCompleted">` and return `false` for non-day tasks. Update the TaskBar and TaskDragLayer fixtures to use `scope + periodKey`.

- [ ] **Step 6: Run service and TaskBar tests**

Run: `pnpm test:run src/features/plans/data/plan-task-service.test.ts src/features/plans/data/legacy-plan-task-service.test.ts src/features/plans/domain/plan-dates.test.ts src/features/plans/domain/task-drop.test.ts src/features/plans/components/TaskBar.test.tsx src/features/plans/components/TaskDragLayer.test.tsx src/features/plans/components/LegacyPlanMigrationPanel.test.tsx`

Expected: all service, move-conflict, completion, copy, and TaskBar tests PASS.

- [ ] **Step 7: Commit the service boundary**

```bash
git add src/features/plans/data/task-order.ts src/features/plans/data/plan-task-service.ts src/features/plans/data/plan-task-service.test.ts src/features/plans/data/legacy-plan-task-service.ts src/features/plans/data/legacy-plan-task-service.test.ts src/features/plans/domain/plan-dates.ts src/features/plans/domain/plan-dates.test.ts src/features/plans/domain/task-drop.ts src/features/plans/domain/task-drop.test.ts src/features/plans/components/TaskBar.tsx src/features/plans/components/TaskBar.test.tsx src/features/plans/components/TaskDragLayer.test.tsx src/features/plans/components/LegacyPlanMigrationPanel.test.tsx
git commit -m "feat: isolate task CRUD by plan scope"
```

---

### Task 4: Query only the active workspace

**Files:**
- Modify: `src/features/plans/usePlanWorkspace.ts`
- Modify: `src/features/plans/usePlanWorkspace.test.tsx`
- Modify: `src/features/home/HomePage.tsx`
- Modify: `src/features/home/HomePage.test.tsx`

**Interfaces:**
- Consumes: `getPlanPeriodKey`, `[scope+periodKey]` index.
- Produces: `PlanWorkspaceSnapshot` containing `scope`, `periodKey`, `tasks`, `periods`, `selectedPeriod`, and current-scope `progress`.
- Removes: implicit `allTasks`; any retained migration screen must request its own explicitly scoped source data rather than consuming the active workspace hook.

- [ ] **Step 1: Add failing isolation tests**

Seed four tasks sharing a visually related September period but different scopes:

```ts
await db.planTasks.bulkAdd([
  task({ id: "day", scope: "day", periodKey: "2026-09-01" }),
  task({ id: "week", scope: "week", periodKey: "2026-08-31" }),
  task({ id: "month", scope: "month", periodKey: "2026-09" }),
  task({ id: "semester", scope: "semester", periodKey: "fall" }),
])
```

Assert day, week, month, and period hook renders each return exactly one different task and `progress.total === 1`.

- [ ] **Step 2: Run the workspace tests and verify RED**

Run: `pnpm test:run src/features/plans/usePlanWorkspace.test.tsx`

Expected: FAIL because current implementation filters all tasks by date range.

- [ ] **Step 3: Replace date-range filtering with composite-key querying**

```ts
const scope = view === "period" ? "semester" : view
const periodKey = getPlanPeriodKey(scope, selectedDate, selectedPeriod?.id)
const tasks = periodKey
  ? await db.planTasks.where("[scope+periodKey]").equals([scope, periodKey]).sortBy("order")
  : []
```

Remove `allTasks`, `taskGroups`, `taskGroupById`, `rangePlan`, range-overlap calculations, and their imports from the snapshot. Sort day tasks by time then order; sort other scopes by order.

- [ ] **Step 4: Make home explicitly day-scoped**

Home queries for today and next task must use `scope === "day"` and the matching day `periodKey`. Update home fixtures so weekly/monthly/semester tasks never affect today’s progress or next-task card.

- [ ] **Step 5: Run workspace and home tests**

Run: `pnpm test:run src/features/plans/usePlanWorkspace.test.tsx src/features/home/HomePage.test.tsx`

Expected: all isolation and home-cockpit tests PASS.

- [ ] **Step 6: Commit isolated reads**

```bash
git add src/features/plans/usePlanWorkspace.ts src/features/plans/usePlanWorkspace.test.tsx src/features/home/HomePage.tsx src/features/home/HomePage.test.tsx
git commit -m "feat: query active plan workspace only"
```

---

### Task 5: Shared period navigator and task-list surface

**Files:**
- Create: `src/features/plans/components/PlanPeriodNavigator.tsx`
- Create: `src/features/plans/components/PlanPeriodNavigator.test.tsx`
- Create: `src/features/plans/components/PlanTaskListView.tsx`
- Create: `src/features/plans/components/PlanTaskListView.test.tsx`
- Modify: `src/features/plans/components/DayPlanView.tsx`
- Modify: `src/features/plans/components/DayPlanView.test.tsx`
- Modify: `src/features/plans/components/WeekPlanView.tsx`
- Modify: `src/features/plans/components/WeekPlanView.test.tsx`
- Modify: `src/features/plans/components/MonthPlanView.tsx`
- Modify: `src/features/plans/components/MonthPlanView.test.tsx`
- Modify: `src/features/plans/components/TaskGroupBand.tsx`
- Modify: `src/features/plans/components/MultiDayTaskForm.tsx`
- Modify: `src/features/plans/components/MultiDayTaskForm.test.tsx`
- Modify: `src/features/plans/components/SchedulePreview.tsx`
- Modify: `src/features/plans/domain/multiday-schedule.ts`
- Modify: `src/features/plans/domain/multiday-schedule.test.ts`
- Modify: `src/features/plans/domain/task-group-status.ts`
- Modify: `src/features/plans/domain/task-group-status.test.ts`
- Modify: `src/features/plans/data/plan-task-group-service.ts`
- Modify: `src/features/plans/data/plan-task-group-service.test.ts`

**Interfaces:**
- Consumes: `PlanTaskScope`, `formatPlanPeriodLabel`, `shiftPlanPeriod`, `TaskBar`.
- Produces: `PlanPeriodNavigator({ scope, selectedDate, period, periods, onDateChange, onPeriodChange })`.
- Produces: `PlanTaskListView({ db, scope, periodKey, tasks, onCreate, onMoved, onOpen })`.

```ts
export interface PlanPeriodNavigatorProps {
  scope: PlanTaskScope
  selectedDate: string
  period?: LearningPeriod | null
  periods?: LearningPeriod[]
  onDateChange?: (date: string) => void
  onPeriodChange?: (periodId: string) => void
  onManagePeriods?: () => void
}

export interface PlanTaskListViewProps {
  db: VeloDB
  scope: Exclude<PlanTaskScope, "day">
  periodKey: string
  tasks: PlanTask[]
  onCreate: () => void
  onMoved?: (task: PlanTask, previous: TaskPosition) => void
  onOpen?: (task: PlanTask, trigger: HTMLButtonElement) => void
}
```

- [ ] **Step 1: Write failing navigator tests**

Test the visible title and callbacks for all supported modes:

```tsx
render(<PlanPeriodNavigator scope="week" selectedDate="2026-09-01" onDateChange={onDateChange} />)
expect(screen.getByRole("heading", { name: "8月31日—9月6日" })).toBeInTheDocument()
await user.click(screen.getByRole("button", { name: "下一周" }))
expect(onDateChange).toHaveBeenCalledWith("2026-09-08")
```

For semester scope, assert the select contains semester and holiday names, calls `onPeriodChange(id)`, and exposes “管理学期与假期”.

- [ ] **Step 2: Write failing list-view tests**

```tsx
render(<PlanTaskListView db={db} scope="month" periodKey="2026-09" tasks={[monthTask]} />)
expect(screen.getByRole("region", { name: "本月任务" })).toHaveTextContent(monthTask.title)
expect(screen.queryByLabelText("月度日历")).not.toBeInTheDocument()
expect(screen.getByRole("button", { name: `打开任务操作：${monthTask.title}` })).toBeInTheDocument()
```

Also assert the empty state copy and “新建任务” action for week, month, and semester.

- [ ] **Step 3: Run component tests and verify RED**

Run: `pnpm test:run src/features/plans/components/PlanPeriodNavigator.test.tsx src/features/plans/components/PlanTaskListView.test.tsx`

Expected: FAIL because both components are missing.

- [ ] **Step 4: Implement the navigator**

Use `ChevronLeft`, `ChevronRight`, and `CalendarDays` from `lucide-react`. Day/week/month render previous/next buttons plus the appropriate date/month input. Semester renders a labeled `<select>` backed by `LearningPeriod[]`; it does not synthesize a period when the list is empty.

Button accessible names must be exactly `上一日/下一日`, `上一周/下一周`, or `上一月/下一月`. The period-management action must be a real button and not a clickable text span.

- [ ] **Step 5: Implement the shared task list**

Map scope to labels:

```ts
const scopeCopy = {
  week: { region: "本周任务", empty: "本周还没有任务。" },
  month: { region: "本月任务", empty: "本月还没有任务。" },
  semester: { region: "本学期任务", empty: "当前学期或假期还没有任务。" },
} as const
```

Render one semantic `<section>` and one `<ul>`, reusing `TaskBar` for every item. The view must not group by date and must not import `WeekPlanView`, `MonthPlanView`, or `TaskGroupBand`.

- [ ] **Step 6: Simplify day labels without changing its two-lane behavior**

Remove task-group labels from `DayPlanView`; continue rendering timed and untimed day tasks, overdue status, and the current-plan drop zone. Update tests to use `scope: "day"` and `periodKey` fixtures.

Keep the old week/month/multi-day source files physically present for rollback, but detach them from active routes. Mechanically change their dated display fixtures and pure helpers from `scheduledDate` to day-scoped `periodKey`. Retire every exported mutation in `plan-task-group-service.ts` with the deterministic error `跨日任务已停用`; its tests must assert the rejection and prove both `planTaskGroups` and `planTasks` remain unchanged. These compatibility modules must never query or write `rangePlans` or `planTaskGroups`, and active `PlansPage` code must not import them. Their remaining tests are compile/regression coverage only; add an import-boundary assertion in `PlansPage.test.tsx` that the active page renders none of their landmarks.

- [ ] **Step 7: Run component tests**

Run: `pnpm test:run src/features/plans/components/PlanPeriodNavigator.test.tsx src/features/plans/components/PlanTaskListView.test.tsx src/features/plans/components/DayPlanView.test.tsx src/features/plans/components/WeekPlanView.test.tsx src/features/plans/components/MonthPlanView.test.tsx src/features/plans/components/MultiDayTaskForm.test.tsx src/features/plans/domain/multiday-schedule.test.ts src/features/plans/domain/task-group-status.test.ts src/features/plans/data/plan-task-group-service.test.ts`

Expected: all shared-list, navigator, and day-lane tests PASS.

- [ ] **Step 8: Commit the shared UI units**

```bash
git add src/features/plans/components/PlanPeriodNavigator.tsx src/features/plans/components/PlanPeriodNavigator.test.tsx src/features/plans/components/PlanTaskListView.tsx src/features/plans/components/PlanTaskListView.test.tsx src/features/plans/components/DayPlanView.tsx src/features/plans/components/DayPlanView.test.tsx src/features/plans/components/WeekPlanView.tsx src/features/plans/components/WeekPlanView.test.tsx src/features/plans/components/MonthPlanView.tsx src/features/plans/components/MonthPlanView.test.tsx src/features/plans/components/TaskGroupBand.tsx src/features/plans/components/MultiDayTaskForm.tsx src/features/plans/components/MultiDayTaskForm.test.tsx src/features/plans/components/SchedulePreview.tsx src/features/plans/domain/multiday-schedule.ts src/features/plans/domain/multiday-schedule.test.ts src/features/plans/domain/task-group-status.ts src/features/plans/domain/task-group-status.test.ts src/features/plans/data/plan-task-group-service.ts src/features/plans/data/plan-task-group-service.test.ts
git commit -m "feat: add shared plan list workspaces"
```

---

### Task 6: Scope-locked task editor

**Files:**
- Modify: `src/features/plans/components/TaskEditorDialog.tsx`
- Modify: `src/features/plans/components/TaskEditorDialog.test.tsx`
- Modify: `src/features/plans/components/PlanDialog.module.css`

**Interfaces:**
- Consumes: `CreatePlanTaskInput`, `UpdatePlanTaskInput`, `PlanTaskScope`, `LearningPeriod[]`.
- Produces: `TaskEditorDialog` props `scope`, `periodKey`, `selectedDate`, `periods`, and optional `task`.
- Removes from active editor: `taskGroup`, `initialMode`, and the “单日任务 / 跨日任务” selector.

```ts
export interface TaskEditorDialogProps {
  db: VeloDB
  open: boolean
  scope: PlanTaskScope
  periodKey: string
  selectedDate: string
  periods: LearningPeriod[]
  task?: PlanTask
  returnFocusTo?: HTMLElement | null
  onClose: () => void
}
```

- [ ] **Step 1: Replace editor tests with four scope cases**

```tsx
renderEditor({ scope: "week", periodKey: "2026-08-31" })
expect(screen.getByRole("dialog", { name: "新建学习任务" })).toBeInTheDocument()
expect(screen.getByLabelText("所属周")).toHaveValue("2026-W36")
expect(screen.queryByLabelText("开始时间")).not.toBeInTheDocument()
expect(screen.queryByRole("button", { name: "跨日任务" })).not.toBeInTheDocument()
```

Add month input, semester select, and day date/time tests. Submit each form and assert the service receives the same locked `scope` with the normalized new `periodKey`.

- [ ] **Step 2: Run the editor tests and verify RED**

Run: `pnpm test:run src/features/plans/components/TaskEditorDialog.test.tsx`

Expected: FAIL because the editor still uses `scheduledDate` and multi-day mode.

- [ ] **Step 3: Implement scope-specific form state**

Use one form model:

```ts
interface TaskFormValues {
  title: string
  periodKey: string
  subject: string
  startTime: string
  estimatedMinutes: string
  notes: string
}
```

Render day date/time, week week-input, month month-input, or semester select. Convert week input to its Monday key before saving. When editing, derive scope and key from `task`; never permit a scope change.

- [ ] **Step 4: Remove multi-day editor routing**

Delete imports and branches that mount `MultiDayTaskForm`. Do not delete the old file in this task; it remains unused for rollback until final cleanup review. Focus links remain unchanged because they already encode only task ID and focus minutes.

- [ ] **Step 5: Run editor tests**

Run: `pnpm test:run src/features/plans/components/TaskEditorDialog.test.tsx`

Expected: all four editor modes, validation, save-error preservation, and focus-return tests PASS.

- [ ] **Step 6: Commit the scope-locked editor**

```bash
git add src/features/plans/components/TaskEditorDialog.tsx src/features/plans/components/TaskEditorDialog.test.tsx src/features/plans/components/PlanDialog.module.css
git commit -m "feat: lock task editor to plan scope"
```

---

### Task 7: Integrate four independent workspaces in PlansPage

**Files:**
- Modify: `src/pages/PlansPage.tsx`
- Modify: `src/pages/PlansPage.test.tsx`
- Modify: `src/features/plans/components/PlanHeader.tsx`
- Create: `src/features/plans/components/PlanHeader.test.tsx`
- Modify: `src/features/plans/components/LearningPeriodView.tsx`
- Modify: `src/features/plans/components/LearningPeriodView.test.tsx`
- Modify: `src/features/plans/components/PlanProgress.tsx`
- Modify: `src/features/plans/components/PlanProgress.test.tsx`
- Modify: `src/features/plans/domain/learning-periods.ts`
- Modify: `src/features/plans/domain/learning-periods.test.ts`
- Modify: `src/features/plans/data/learning-period-service.ts`
- Modify: `src/features/plans/data/learning-period-service.test.ts`
- Modify: `src/features/plans/components/PeriodMigrationPanel.tsx`
- Modify: `src/features/plans/components/PeriodMigrationPanel.test.tsx`

**Interfaces:**
- Consumes: `PlanPeriodNavigator`, `PlanTaskListView`, scope-aware `TaskEditorDialog`, isolated `PlanWorkspaceSnapshot`.
- Produces: route behavior where `view=day|week|month|period`, `date`, and optional `period` select exactly one workspace.
- Preserves: learning-period create/edit/delete and period migration entry, adapted to semester-scoped tasks.

- [ ] **Step 1: Write the page-level isolation and header tests**

Seed one task per scope, render each route, and assert only the matching title appears in the active workspace. Add these absence assertions:

```ts
expect(screen.queryByLabelText("本周排程")).not.toBeInTheDocument()
expect(screen.queryByLabelText("月度日历")).not.toBeInTheDocument()
expect(screen.queryByText("制定本周计划")).not.toBeInTheDocument()
expect(screen.queryByText("制定本月计划")).not.toBeInTheDocument()
expect(screen.queryByRole("button", { name: "跨日任务" })).not.toBeInTheDocument()
```

Test that clicking “新建任务” in month view opens an editor locked to `scope="month"` and current month key.

Create `PlanHeader.test.tsx` before changing the component:

```tsx
render(<MemoryRouter><PlanHeader createHref="/plans/new" /></MemoryRouter>)
expect(screen.getByRole("heading", { name: "学习计划" })).toBeInTheDocument()
expect(screen.getByText("分层安排任务，保持清晰节奏。")).toBeInTheDocument()
expect(screen.getByRole("link", { name: "新建任务" })).toHaveAttribute("href", "/plans/new")
expect(screen.queryByLabelText("计划日期")).not.toBeInTheDocument()
```

- [ ] **Step 2: Run the PlansPage tests and verify RED**

Run: `pnpm test:run src/pages/PlansPage.test.tsx src/features/plans/components/PlanHeader.test.tsx`

Expected: failures from calendar views, range-plan UI, task groups, and dated editor assumptions.

- [ ] **Step 3: Simplify PlanHeader**

Keep product heading and primary create button. Remove its global date control because `PlanPeriodNavigator` owns scope-specific navigation. Update subtitle to `分层安排任务，保持清晰节奏。`.

- [ ] **Step 4: Replace view branches**

In `PlansPage`, compute active scope as:

```ts
const scope: PlanTaskScope = view === "period" ? "semester" : view
```

Render `DayPlanView` for day and `PlanTaskListView` for week/month/semester. Render `PlanPeriodNavigator` above the current list. Pass the active `scope` and `snapshot.periodKey` to every create/edit dialog.

- [ ] **Step 5: Remove active calendar and range-plan state**

Remove state, imports, and JSX for `RangePlanSummary`, `RangePlanDrawer`, `WeekPlanView`, `MonthPlanView`, task-group editing, and cross-day editor mode. Keep old tables and files untouched. Remove the auxiliary “当前学期” card from day/week/month workspaces because it duplicates the dedicated semester selector.

- [ ] **Step 6: Adapt learning-period management**

`LearningPeriodView` becomes a compact management surface opened from the semester navigator, not a task-by-date aggregator. It lists periods, manages create/edit/delete, and delegates selected-period task rendering to `PlanTaskListView`. Replace `countTasksInPeriod(tasks, period)` with `countTasksForPeriod(tasks, periodId)`, filtering `task.scope === "semester" && task.periodKey === periodId`. `learning-period-service.ts` uses that count when guarding deletion, so day tasks inside a period's calendar bounds no longer block period deletion.

Adapt `PeriodMigrationPanel` to copy selected tasks into the chosen target as semester tasks (`scope: "semester"`, `periodKey: targetPeriod.id`) and then dismiss the migration prompt. Its tests must assert target period IDs, not target calendar dates. This is the only explicit cross-level copy flow retained; it creates new task identities and never links completion state.

- [ ] **Step 7: Keep progress local and semantic**

Use existing `PlanProgress` copy for `day`, `week`, `month`, and `period`, but feed it only `snapshot.tasks`. Add tests proving a completed day task does not change week/month/semester progress.

- [ ] **Step 8: Run page and period tests**

Run: `pnpm test:run src/pages/PlansPage.test.tsx src/features/plans/components/PlanHeader.test.tsx src/features/plans/components/LearningPeriodView.test.tsx src/features/plans/components/PlanProgress.test.tsx src/features/plans/domain/learning-periods.test.ts src/features/plans/data/learning-period-service.test.ts src/features/plans/components/PeriodMigrationPanel.test.tsx`

Expected: all page navigation, independent progress, period management, task actions, editor entry, delete, and migration tests PASS.

- [ ] **Step 9: Commit the integrated product flow**

```bash
git add src/pages/PlansPage.tsx src/pages/PlansPage.test.tsx src/features/plans/components/PlanHeader.tsx src/features/plans/components/PlanHeader.test.tsx src/features/plans/components/LearningPeriodView.tsx src/features/plans/components/LearningPeriodView.test.tsx src/features/plans/components/PlanProgress.tsx src/features/plans/components/PlanProgress.test.tsx src/features/plans/domain/learning-periods.ts src/features/plans/domain/learning-periods.test.ts src/features/plans/data/learning-period-service.ts src/features/plans/data/learning-period-service.test.ts src/features/plans/components/PeriodMigrationPanel.tsx src/features/plans/components/PeriodMigrationPanel.test.tsx
git commit -m "feat: integrate independent plan workspaces"
```

---

### Task 8: Responsive polish, end-to-end coverage, and delivery verification

**Files:**
- Modify: `src/features/plans/PlansPage.module.css`
- Modify: `src/features/plans/PlansPage.responsive.test.ts`
- Modify: `e2e/plans.spec.ts`
- Modify: `README.md`
- Modify: `design-qa.md`
- Modify: `D:/workplace/GLOBAL-CONSOLE.md`

**Interfaces:**
- Consumes: final four-workspace DOM and accessible names from Tasks 5–7.
- Produces: verified responsive single-list layout at all milestone widths and durable product documentation.

- [ ] **Step 1: Replace calendar-oriented responsive contracts**

Update `PlansPage.responsive.test.ts` to assert:

- task surfaces use `min-width: 0` and `box-sizing: border-box`;
- week/month/semester lists have no seven-column grids;
- period navigation controls can wrap without reducing task-card width;
- tablet landscape uses a readable centered content width rather than stretching text across the full screen;
- task bars retain `width: 100%`, `min-width: 0`, and content-box overflow protection.
- previous/next, period-picker, management, and create controls expose at least `44px` in both dimensions;
- a 200% text-zoom fixture permits task-bar height growth and keeps title, metadata, and status from overlapping;
- `@media (prefers-reduced-motion: reduce)` removes decorative transitions while preserving visible completion text.

Run: `pnpm test:run src/features/plans/PlansPage.responsive.test.ts`

Expected: FAIL until obsolete grid rules are removed and the new list rules are added.

- [ ] **Step 2: Implement responsive CSS cleanup**

Delete active rules for `.weekGrid`, `.weekDateStrip`, `.weekGroupBands`, `.monthGrid`, `.monthWeekDays`, `.monthTaskPanel`, and range-plan drawers once their components are no longer rendered. Add focused classes for navigator, shared task list, semester selector, and empty states. Keep these measurable constraints:

```css
.planListSurface {
  min-width: 0;
  width: 100%;
}

.planListSurface > ul {
  display: grid;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
}

@media (min-width: 1024px) {
  .workspaceGrid {
    margin-inline: auto;
    max-width: 1040px;
  }
}
```

- [ ] **Step 3: Replace calendar E2E flows with independent-plan flows**

Create one task in each scope through the UI, then verify:

1. each title appears only in its own view;
2. week/month pages contain no calendar roles or seven-date grids;
3. semester task uses the selected period ID;
4. right-swiping each scope’s task completes only that task and updates only that scope’s progress;
5. undo restores the same task;
6. reload and offline reload preserve tasks and completion.
7. an invalid semester route shows the recoverable period-selection state and does not save a task;
8. a forced IndexedDB write failure keeps all editor values and returns focus to the same task/create trigger after recovery;
9. keyboard completion and task-menu completion provide equivalents to the swipe gesture.

Use milestone viewports `375×900`, `390×844`, `768×1024`, `834×1112`, `1024×820`, `1366×900`, and `1440×900`. At each size call `expectNoHorizontalOverflow(page)` and assert task-card bounding boxes remain inside the list surface.

- [ ] **Step 4: Run the new browser test and verify RED/GREEN**

Before CSS/page fixes are complete, run the new focused test and record its failure from calendar presence or scope leakage. After implementation, run:

`pnpm build && pnpm exec playwright test e2e/plans.spec.ts --grep "independent plan workspaces"`

Expected: focused test PASS on Chromium.

- [ ] **Step 5: Update durable product documentation**

README must describe four independent plan levels and remove calendar-rollup and cross-day claims. `design-qa.md` must record the unified task-list visual, scope-isolation rule, responsive widths, and right-swipe equivalence. Update `GLOBAL-CONSOLE.md` to mark the implementation “待验收” and name the next manual review as the four independent workspaces.

- [ ] **Step 6: Run full verification**

Run, in order:

```bash
pnpm verify
pnpm exec playwright test
pnpm test:pwa-lifecycle
git diff --check
git status --short
```

Expected:

- TypeScript and ESLint exit 0.
- All Vitest files pass with zero failures.
- All Playwright tests pass with zero failures.
- PWA lifecycle reports success.
- `git diff --check` prints no whitespace errors.
- `git status --short` lists only intended project/documentation changes before commit; root `.firecrawl/` remains untracked and untouched.

- [ ] **Step 7: Commit the responsive and acceptance slice**

```bash
git add src/features/plans/PlansPage.module.css src/features/plans/PlansPage.responsive.test.ts e2e/plans.spec.ts README.md design-qa.md
git commit -m "feat: finish independent plan workspaces"
```

Commit the root console separately from `D:/workplace`:

```bash
git add GLOBAL-CONSOLE.md
git commit -m "docs: update velo independent plan status"
```

- [ ] **Step 8: Review and publish**

Use `superpowers:requesting-code-review` to review the complete branch against the spec. Fix any P1/P2 findings with focused tests, rerun the full verification commands, then push `feat/multiday-plan-task` to `origin` and verify local `HEAD` equals `origin/feat/multiday-plan-task`.
