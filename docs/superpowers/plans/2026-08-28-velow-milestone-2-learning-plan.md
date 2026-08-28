# Velow Notebook Milestone 2 Learning Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first, responsive learning-plan workspace with one dated task source, day/week/month/learning-period views, holiday periods, swipe completion, drag scheduling, migration, and accessible recovery paths.

**Architecture:** Dexie remains the single persistent source of truth and upgrades the existing `velo` database in place. Focused domain modules own date math, learning-period validation, task mutations, and migration; React components consume live queries and keep gesture previews transient until a database transaction succeeds. CSS Modules and semantic color tokens implement the approved full-width 54px task bars, restrained Velow purple, cool blue/teal accents, and responsive phone/tablet editors.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, Dexie 4, dexie-react-hooks, Motion for React, Lucide React, CSS Modules, Vitest, Testing Library, Playwright, axe-core.

**Spec:** `docs/superpowers/specs/2026-08-28-velow-milestone-2-learning-plan-design.md`

## Global Constraints

- Product name is `Velow Notebook`; keep the existing IndexedDB name `velo` so upgrades preserve local data.
- Every new task has a non-empty `title` and local `scheduledDate` in `YYYY-MM-DD`; start time, subject, estimate, and notes are optional.
- Day, week, month, and learning-period views query one `planTasks` table; holiday tasks never use a parallel task table.
- Progress is `completed task count / total task count`; `0 / 0` is not 100%.
- Learning periods include semester, winter break, summer break, and custom break; date ranges may not overlap.
- Task bars fill the content column, are 54px high at normal text size, truncate long titles, and may grow at 200% text zoom.
- Direct right swipe completes; 350ms long press begins drag; click opens edit; keyboard and action-menu equivalents are mandatory.
- Completion uses high-saturation Velow purple only during the gesture, then low-saturation purple-gray glass; there is no checkbox and no separate thin progress bar.
- Visual balance is approximately 60% warm white/light gray, 30% neutral information hierarchy, and 10% accents. Purple is not the only accent: cool gray-blue and low-saturation teal are used semantically, never randomly.
- All fixed mobile actions respect safe-area insets; touch targets are at least 44×44 CSS px; normal text meets WCAG 2.2 AA.
- Motion uses `transform` and `opacity`, interaction feedback is at most 200ms, and `prefers-reduced-motion` receives an immediate path.
- Core planning remains fully usable offline; no account, cloud sync, AI scheduling, reminder service, recurring task, or subtask is added.

## File Map

```text
src/db/types.ts                                      v2 task, learning-period and legacy types
src/db/velo-db.ts                                    Dexie v2 schema and non-destructive upgrade
src/db/seed.ts                                       v2-compatible deterministic home seed
src/features/plans/domain/plan-dates.ts              local date/range/progress calculations
src/features/plans/domain/learning-periods.ts         period validation and derived membership
src/features/plans/data/plan-task-service.ts          task CRUD, completion, move and copy transactions
src/features/plans/data/learning-period-service.ts    period CRUD and overlap protection
src/features/plans/usePlanWorkspace.ts                live queries for the selected view
src/features/plans/components/                        plan controls, views, task bars and dialogs
src/features/plans/PlansPage.module.css               responsive layout and semantic color application
src/pages/PlansPage.tsx                               feature composition and URL state
src/styles/tokens.css                                 approved purple, cool-blue and teal tokens
e2e/plans.spec.ts                                     responsive, gesture, period and offline acceptance
README.md                                             milestone-2 commands and behavior
```

---

### Task 1: Upgrade local planning data without losing milestone-1 records

**Files:**
- Modify: `src/db/types.ts`
- Modify: `src/db/velo-db.ts`
- Modify: `src/db/velo-db.test.ts`
- Modify: `src/db/seed.ts`
- Modify: `src/features/home/home-query.ts`
- Modify: `src/features/home/home-query.test.ts`

**Interfaces:**
- Produces: `PlanTask`, `LearningPeriod`, `LearningPeriodKind`, `LegacyPlanTask`, `VeloDB.learningPeriods`, and `VeloDB.legacyPlanTasks`.
- Preserves: `veloDb = new VeloDB("velo")` and `loadHomeSnapshot(db, now)`.

- [ ] **Step 1: Write failing database-upgrade tests**

Add a helper that creates a real version-1 database, writes one valid day task and one week task, closes it, then opens it through `VeloDB`:

```ts
function legacyTask(overrides: Partial<LegacyPlanTask> & Pick<LegacyPlanTask, "id" | "scope" | "periodKey">): LegacyPlanTask {
  return {
    title: "旧计划",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

async function createVersionOneDatabase(name: string, tasks: LegacyPlanTask[]) {
  const oldDb = new Dexie(name)
  oldDb.version(1).stores({
    planTasks: "id, [scope+periodKey], periodKey, isCompleted, order, updatedAt",
    knowledgeNodes: "id, parentId, type, order, updatedAt",
    notes: "id, nodeId, title, updatedAt",
    appMeta: "key, updatedAt",
  })
  await oldDb.table("planTasks").bulkAdd(tasks)
  oldDb.close()
}

it("upgrades dated day tasks and quarantines ambiguous legacy tasks", async () => {
  const name = `velo-upgrade-${crypto.randomUUID()}`
  await createVersionOneDatabase(name, [
    legacyTask({ id: "day", scope: "day", periodKey: "2026-08-28" }),
    legacyTask({ id: "week", scope: "week", periodKey: "2026-W35" }),
  ])

  const db = new VeloDB(name)
  await db.open()
  expect(await db.planTasks.get("day")).toMatchObject({ scheduledDate: "2026-08-28", isCompleted: 0 })
  expect(await db.planTasks.get("week")).toBeUndefined()
  expect(await db.legacyPlanTasks.get("week")).toMatchObject({ scope: "week", periodKey: "2026-W35" })
  await db.delete()
})
```

Update the seed and home-query expectations to use `scheduledDate` instead of `[scope+periodKey]`.

- [ ] **Step 2: Run the focused tests and verify the red state**

Run: `pnpm test:run src/db/velo-db.test.ts src/features/home/home-query.test.ts`

Expected: FAIL because version 2, `scheduledDate`, `learningPeriods`, and `legacyPlanTasks` do not exist.

- [ ] **Step 3: Replace the planning types with the v2 contracts**

Use these exact public contracts in `src/db/types.ts`:

```ts
export type LearningPeriodKind = "semester" | "winter-break" | "summer-break" | "custom-break"

export interface PlanTask {
  id: string
  title: string
  scheduledDate: string
  startMinutes?: number
  subject?: string
  estimatedMinutes?: number
  notes?: string
  isCompleted: 0 | 1
  completedAt?: number
  order: number
  createdAt: number
  updatedAt: number
}

export interface LearningPeriod {
  id: string
  kind: LearningPeriodKind
  name: string
  startDate: string
  endDate: string
  goal?: string
  createdAt: number
  updatedAt: number
}

export interface LegacyPlanTask {
  id: string
  scope: "day" | "week" | "month" | "semester"
  periodKey: string
  title: string
  subject?: string
  estimatedMinutes?: number
  isCompleted: 0 | 1
  order: number
  createdAt: number
  updatedAt: number
}
```

- [ ] **Step 4: Implement Dexie version 2 and its upgrade transaction**

Keep version 1 unchanged and add:

```ts
this.version(2)
  .stores({
    planTasks: "id, scheduledDate, [scheduledDate+isCompleted], [scheduledDate+startMinutes], isCompleted, updatedAt",
    learningPeriods: "id, kind, startDate, endDate, updatedAt",
    legacyPlanTasks: "id, scope, periodKey, updatedAt",
    knowledgeNodes: "id, parentId, type, order, updatedAt",
    notes: "id, nodeId, title, updatedAt",
    appMeta: "key, updatedAt",
  })
  .upgrade(async (transaction) => {
    const table = transaction.table<LegacyPlanTask, string>("planTasks")
    const legacyTable = transaction.table<LegacyPlanTask, string>("legacyPlanTasks")
    const rows = await table.toArray()
    for (const row of rows) {
      if (row.scope === "day" && isValidLegacyDayKey(row.periodKey)) {
        await table.put({
          id: row.id,
          title: row.title,
          scheduledDate: row.periodKey,
          subject: row.subject,
          estimatedMinutes: row.estimatedMinutes,
          isCompleted: row.isCompleted,
          completedAt: row.isCompleted === 1 ? row.updatedAt : undefined,
          order: row.order,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        } as unknown as LegacyPlanTask)
      } else {
        await legacyTable.put(row)
        await table.delete(row.id)
      }
    }
  })
```

Type the post-upgrade table as `Table<PlanTask, string>` on `VeloDB`; the cast is confined to the upgrade callback because Dexie exposes the old store shape there. Define this validator in `velo-db.ts`; values such as `2026-02-31` return false and enter `legacyPlanTasks`:

```ts
function isValidLegacyDayKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day, 12)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}
```

- [ ] **Step 5: Make seed and home queries v2-native**

Seed each demo task with `scheduledDate: formatLocalDate(now)` and remove `scope`/`periodKey`. Query home tasks with:

```ts
const scheduledDate = formatLocalDate(now)
const tasks = await db.planTasks.where("scheduledDate").equals(scheduledDate).sortBy("order")
```

- [ ] **Step 6: Verify migration and milestone-1 compatibility**

Run:

```powershell
pnpm test:run src/db/velo-db.test.ts src/features/home/home-query.test.ts src/features/home/HomePage.test.tsx
pnpm typecheck
```

Expected: all tests pass; opening a v1 database preserves the day task and quarantines the ambiguous week task.

- [ ] **Step 7: Commit the data upgrade**

```powershell
git add src/db src/features/home
git commit -m "feat: upgrade local planning data"
```

---

### Task 2: Add local date ranges, progress and overdue rules

**Files:**
- Create: `src/features/plans/domain/plan-dates.ts`
- Create: `src/features/plans/domain/plan-dates.test.ts`

**Interfaces:**
- Produces: `parseLocalDate`, `addLocalDays`, `getWeekDates`, `getMonthRange`, `getMonthGridDates`, `getProgress`, `isOverdue`, and `clampDateToRange`.

- [ ] **Step 1: Write exact failing boundary tests**

```ts
expect(getWeekDates("2026-12-31")).toEqual([
  "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
])
expect(getMonthRange("2028-02-10")).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" })
expect(getProgress([])).toEqual({ completed: 0, total: 0, ratio: 0 })
expect(isOverdue({ scheduledDate: "2026-08-27", isCompleted: 0 }, "2026-08-28")).toBe(true)
expect(isOverdue({ scheduledDate: "2026-08-27", isCompleted: 1 }, "2026-08-28")).toBe(false)
expect(clampDateToRange("2026-08-28", "2026-09-01", "2027-01-16")).toBe("2026-09-01")
```

- [ ] **Step 2: Run and verify the red state**

Run: `pnpm test:run src/features/plans/domain/plan-dates.test.ts`

Expected: FAIL because the date module does not exist.

- [ ] **Step 3: Implement local-noon date math**

Parse date-only strings with numeric parts and local noon to avoid UTC and daylight-saving boundary drift:

```ts
export function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error("Invalid local date")
  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0)
}

export function getProgress(tasks: Array<Pick<PlanTask, "isCompleted">>) {
  const completed = tasks.filter((task) => task.isCompleted === 1).length
  return { completed, total: tasks.length, ratio: tasks.length === 0 ? 0 : completed / tasks.length }
}
```

Weeks begin Monday. `getMonthGridDates` returns complete Monday-through-Sunday weeks covering the visible month.

- [ ] **Step 4: Run date tests and typecheck**

Run:

```powershell
pnpm test:run src/features/plans/domain/plan-dates.test.ts
pnpm typecheck
```

Expected: all boundary tests pass.

- [ ] **Step 5: Commit date rules**

```powershell
git add src/features/plans/domain
git commit -m "feat: add planning date rules"
```

---

### Task 3: Implement learning periods for semesters and holidays

**Files:**
- Create: `src/features/plans/domain/learning-periods.ts`
- Create: `src/features/plans/domain/learning-periods.test.ts`
- Create: `src/features/plans/data/learning-period-service.ts`
- Create: `src/features/plans/data/learning-period-service.test.ts`

**Interfaces:**
- Produces: `LearningPeriodInput`, `validateLearningPeriod`, `findPeriodForDate`, `createLearningPeriod`, `updateLearningPeriod`, `deleteLearningPeriod`, and `countTasksInPeriod`.

- [ ] **Step 1: Write failing validation and membership tests**

```ts
function period(overrides: Partial<LearningPeriod> = {}): LearningPeriod {
  return {
    id: "period",
    kind: "semester",
    name: "2026 秋季学期",
    startDate: "2026-09-01",
    endDate: "2027-01-16",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

const winterBreak = period({ id: "winter", kind: "winter-break", startDate: "2027-01-17", endDate: "2027-02-21" })
expect(findPeriodForDate([winterBreak], "2027-02-01")?.id).toBe("winter")
expect(validateLearningPeriod(winterBreak, [period({ id: "semester", startDate: "2026-09-01", endDate: "2027-01-16" })])).toEqual({ ok: true })
expect(validateLearningPeriod(period({ id: "overlap", startDate: "2027-01-10", endDate: "2027-01-20" }), [winterBreak])).toMatchObject({ ok: false, field: "startDate" })
expect(validateLearningPeriod(period({ name: "   " }), [])).toMatchObject({ ok: false, field: "name" })
```

Service tests must prove overlap is checked again inside the write transaction and deletion reports the number of tasks that become unassigned.

- [ ] **Step 2: Run and verify the red state**

Run: `pnpm test:run src/features/plans/domain/learning-periods.test.ts src/features/plans/data/learning-period-service.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the period domain contract**

```ts
export interface LearningPeriodInput {
  kind: LearningPeriodKind
  name: string
  startDate: string
  endDate: string
  goal?: string
}

export type PeriodValidation =
  | { ok: true }
  | { ok: false; field: "name" | "startDate" | "endDate"; message: string }
```

Inclusive ranges overlap when `candidate.startDate <= existing.endDate && candidate.endDate >= existing.startDate`. Ignore the edited period's own ID.

- [ ] **Step 4: Implement transactional period CRUD**

`createLearningPeriod(db, input, now)` and `updateLearningPeriod(db, id, input, now)` trim text, validate date order and overlap, then write inside a Dexie transaction. `deleteLearningPeriod` returns `{ affectedTaskCount }`; the UI must confirm before calling it because tasks remain and become unassigned.

- [ ] **Step 5: Verify period services**

Run:

```powershell
pnpm test:run src/features/plans/domain/learning-periods.test.ts src/features/plans/data/learning-period-service.test.ts
pnpm typecheck
```

Expected: semester, winter break, summer break, custom break, boundary, overlap, and deletion-impact tests pass.

- [ ] **Step 6: Commit learning-period support**

```powershell
git add src/features/plans/domain src/features/plans/data
git commit -m "feat: add semester and holiday periods"
```

---

### Task 4: Implement task CRUD, movement, completion and period copying

**Files:**
- Create: `src/features/plans/data/plan-task-service.ts`
- Create: `src/features/plans/data/plan-task-service.test.ts`

**Interfaces:**
- Produces: `CreatePlanTaskInput`, `UpdatePlanTaskInput`, `createPlanTask`, `updatePlanTask`, `deletePlanTask`, `setTaskCompletion`, `movePlanTask`, `copyTasksToPeriod`.
- Consumes: `clampDateToRange`, `PlanTask`, `LearningPeriod`, and `VeloDB`.

- [ ] **Step 1: Write failing mutation tests**

```ts
await expect(createPlanTask(db, { title: "  ", scheduledDate: "2026-08-28" }, now)).rejects.toThrow("任务名称不能为空")
const created = await createPlanTask(db, { title: " 复习导数 ", scheduledDate: "2026-08-28", estimatedMinutes: 45 }, now)
expect(created).toMatchObject({ title: "复习导数", scheduledDate: "2026-08-28", isCompleted: 0 })
await setTaskCompletion(db, created.id, true, now + 1)
expect(await db.planTasks.get(created.id)).toMatchObject({ isCompleted: 1, completedAt: now + 1 })
await movePlanTask(db, created.id, { scheduledDate: "2026-08-29", startMinutes: undefined }, now + 2)
expect(await db.planTasks.get(created.id)).toMatchObject({ scheduledDate: "2026-08-29" })
```

Copy tests use today `2027-01-10` and target winter break `2027-01-17..2027-02-21`; copied tasks must use `2027-01-17`, clear completion/start time, preserve title/subject/estimate/notes, and leave sources unchanged. A forced write error must leave zero copied rows.

- [ ] **Step 2: Run and verify the red state**

Run: `pnpm test:run src/features/plans/data/plan-task-service.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement exact mutation inputs and validation**

```ts
export interface CreatePlanTaskInput {
  title: string
  scheduledDate: string
  startMinutes?: number
  subject?: string
  estimatedMinutes?: number
  notes?: string
}

export type UpdatePlanTaskInput = CreatePlanTaskInput

export interface MovePlanTaskInput {
  scheduledDate: string
  startMinutes?: number
  order?: number
}
```

Reject blank titles, invalid dates, start minutes outside `0..1439`, and non-positive estimates. Use `crypto.randomUUID()` and assign `order` as the current maximum plus one within the target date and timed/untimed lane.

- [ ] **Step 4: Implement atomic copying**

`copyTasksToPeriod(db, sourceIds, targetPeriod, today, now)` uses `clampDateToRange(today, targetPeriod.startDate, targetPeriod.endDate)` and a single transaction. It returns the new IDs only after all inserts succeed.

- [ ] **Step 5: Verify task mutations**

Run:

```powershell
pnpm test:run src/features/plans/data/plan-task-service.test.ts
pnpm typecheck
```

Expected: CRUD, completion, movement, copy, rollback, and validation tests pass.

- [ ] **Step 6: Commit task services**

```powershell
git add src/features/plans/data
git commit -m "feat: add planning task services"
```

---

### Task 5: Build the responsive plan workspace shell and balanced color system

**Files:**
- Create: `src/features/plans/usePlanWorkspace.ts`
- Create: `src/features/plans/usePlanWorkspace.test.tsx`
- Create: `src/features/plans/components/PlanViewSwitcher.tsx`
- Create: `src/features/plans/components/PlanProgress.tsx`
- Create: `src/features/plans/components/PlanHeader.tsx`
- Create: `src/features/plans/PlansPage.module.css`
- Create: `src/pages/PlansPage.test.tsx`
- Modify: `src/pages/PlansPage.tsx`
- Modify: `src/styles/tokens.css`

**Interfaces:**
- Produces: `PlanView = "day" | "week" | "month" | "period"`, `usePlanWorkspace({ db, view, selectedDate, periodId })`, and URL-backed plan page state.

- [ ] **Step 1: Write the failing live-query and view-switcher tests**

Seed tasks on three dates and assert day returns one date, week returns seven days, month returns the month range, and period returns the selected period range. Render the page at `/plans?view=day&date=2026-08-28`, click `月`, and assert the location becomes `/plans?view=month&date=2026-08-28`.

- [ ] **Step 2: Run and verify the red state**

Run: `pnpm test:run src/features/plans/usePlanWorkspace.test.tsx src/pages/PlansPage.test.tsx`

Expected: FAIL because the hook, page test, and controls do not exist.

- [ ] **Step 3: Implement URL-backed page state and live queries**

Use query parameters `view`, `date`, and optional `period`. Invalid values fall back to `view=day` and today's local date. `usePlanWorkspace` returns:

```ts
interface PlanWorkspaceSnapshot {
  tasks: PlanTask[]
  periods: LearningPeriod[]
  selectedPeriod: LearningPeriod | null
  progress: { completed: number; total: number; ratio: number }
}
```

Do not mirror database rows into a second state store.

- [ ] **Step 4: Add semantic color tokens and shell layout**

Add these exact tokens without removing existing brand tokens:

```css
:root {
  --color-cool-blue: #6176c7;
  --color-cool-blue-soft: #dce5f6;
  --color-teal: #2d8f83;
  --color-teal-soft: #ddf1ec;
  --color-period-surface: #edf1f8;
  --color-complete-glass: rgb(235 222 232 / 78%);
}
```

Use purple only for the active view, primary CTA, and completion gesture. Use cool blue for date/time context and teal for focus/positive metadata; neutral surfaces remain dominant. Do not assign random colors per task.

- [ ] **Step 5: Verify the shell**

Run:

```powershell
pnpm test:run src/features/plans/usePlanWorkspace.test.tsx src/pages/PlansPage.test.tsx
pnpm typecheck
pnpm lint
```

Expected: the four view controls, URL state, live progress, and empty `0 / 0` state pass.

- [ ] **Step 6: Commit the plan shell**

```powershell
git add src/features/plans src/pages/PlansPage.tsx src/styles/tokens.css
git commit -m "feat: add responsive plan workspace"
```

---

### Task 6: Add accessible task creation, editing and deletion

**Files:**
- Create: `src/features/plans/components/TaskEditorDialog.tsx`
- Create: `src/features/plans/components/TaskEditorDialog.test.tsx`
- Create: `src/features/plans/components/TaskActionsDialog.tsx`
- Create: `src/features/plans/components/DeleteTaskDialog.tsx`
- Create: `src/features/plans/components/PlanDialog.module.css`
- Modify: `src/pages/PlansPage.tsx`
- Modify: `src/test/setup.ts`

**Interfaces:**
- Produces: `TaskEditorDialog({ open, task, initialDate, onClose, db })`, `TaskActionsDialog`, and `DeleteTaskDialog`.
- Consumes: task services from Task 4.

- [ ] **Step 1: Add native-dialog test support and failing editor tests**

In `src/test/setup.ts`, polyfill only missing JSDOM methods:

```ts
HTMLDialogElement.prototype.showModal ??= function showModal() { this.open = true }
HTMLDialogElement.prototype.close ??= function close() { this.open = false }
```

Test that the dialog has name `新建学习任务`, requires title/date, creates a task, retains inputs after a rejected save, and edits an existing task without generating a new ID. Test delete cancellation and confirmation with the task title in the confirmation copy.

- [ ] **Step 2: Run and verify the red state**

Run: `pnpm test:run src/features/plans/components/TaskEditorDialog.test.tsx`

Expected: FAIL because the dialogs do not exist.

- [ ] **Step 3: Implement the native dialog primitive once**

Use `<dialog>` for focus containment and Escape handling. Mobile CSS positions it as a bottom sheet with `padding-bottom: calc(20px + env(safe-area-inset-bottom))`; at 768px and above it becomes a fixed 360px right drawer. The form exposes title, date, subject, start time, estimate, and notes, with errors adjacent to their fields.

- [ ] **Step 4: Implement task actions and destructive confirmation**

The action dialog exposes `编辑`, `开始专注`, `移动到日期/时间`, and `删除`. `DeleteTaskDialog` is a separate modal confirmation; no left-swipe deletion is added. Restore focus to the invoking task after close.

- [ ] **Step 5: Verify dialogs and responsive semantics**

Run:

```powershell
pnpm test:run src/features/plans/components/TaskEditorDialog.test.tsx
pnpm typecheck
pnpm lint
```

Expected: create, edit, validation, save-failure retention, Escape, focus restoration, and delete confirmation tests pass.

- [ ] **Step 6: Commit task editing**

```powershell
git add src/features/plans/components src/pages/PlansPage.tsx src/test/setup.ts
git commit -m "feat: add accessible task editing"
```

---

### Task 7: Implement the full-width task bar and swipe completion

**Files:**
- Create: `src/features/plans/domain/task-gesture.ts`
- Create: `src/features/plans/domain/task-gesture.test.ts`
- Create: `src/features/plans/components/FlowArrowIcon.tsx`
- Create: `src/features/plans/components/TaskBar.tsx`
- Create: `src/features/plans/components/TaskBar.test.tsx`
- Create: `src/features/plans/components/TaskBar.module.css`
- Create: `src/features/plans/components/UndoNotice.tsx`

**Interfaces:**
- Produces: `getSwipeProgress(distance, width)`, `shouldCompleteSwipe(distance, width)`, `TaskBar`, and a 5-second undo callback.
- Consumes: `setTaskCompletion` and Motion for React.

- [ ] **Step 1: Write failing gesture-policy tests**

```ts
expect(getSwipeProgress(70, 100)).toBe(0.7)
expect(getSwipeProgress(-10, 100)).toBe(0)
expect(getSwipeProgress(130, 100)).toBe(1)
expect(shouldCompleteSwipe(69, 100)).toBe(false)
expect(shouldCompleteSwipe(70, 100)).toBe(true)
```

Component tests assert no checkbox, Enter and Space complete a focused task, a successful completion shows `已完成`, and clicking `撤销` within 5 seconds restores the task.

- [ ] **Step 2: Run and verify the red state**

Run: `pnpm test:run src/features/plans/domain/task-gesture.test.ts src/features/plans/components/TaskBar.test.tsx`

Expected: FAIL because the gesture policy and task bar do not exist.

- [ ] **Step 3: Implement the 70% completion policy**

```ts
export function getSwipeProgress(distance: number, width: number) {
  if (width <= 0) return 0
  return Math.min(1, Math.max(0, distance / width))
}

export function shouldCompleteSwipe(distance: number, width: number) {
  return getSwipeProgress(distance, width) >= 0.7
}
```

Use pointer capture for the preview and write to Dexie only on pointer release after the threshold. Animate fill with `transform: scaleX(var(--swipe-progress))` and `transform-origin: left`; set `--swipe-progress` from `getSwipeProgress`. Do not animate width.

- [ ] **Step 4: Implement the approved task-bar states**

The outer task bar is `width:100%; min-height:54px`. The title truncates at normal zoom. During swipe the Velow-purple layer fills and `FlowArrowIcon` appears; after success the final surface uses `--color-complete-glass` with `backdrop-filter`, label `已完成`, and no thin progress track. Reduced motion skips translation and immediately commits the visual state.

- [ ] **Step 5: Verify swipe, keyboard and undo behavior**

Run:

```powershell
pnpm test:run src/features/plans/domain/task-gesture.test.ts src/features/plans/components/TaskBar.test.tsx
pnpm typecheck
pnpm lint
```

Expected: threshold, cancellation, completion, 5-second undo, keyboard, and no-checkbox assertions pass.

- [ ] **Step 6: Commit task completion**

```powershell
git add src/features/plans/domain src/features/plans/components
git commit -m "feat: add swipe task completion"
```

---

### Task 8: Add long-press scheduling and reversible movement

**Files:**
- Create: `src/features/plans/domain/task-drop.ts`
- Create: `src/features/plans/domain/task-drop.test.ts`
- Create: `src/features/plans/components/TaskDragLayer.tsx`
- Create: `src/features/plans/components/TaskDragLayer.test.tsx`
- Modify: `src/features/plans/components/TaskBar.tsx`
- Modify: `src/features/plans/components/UndoNotice.tsx`

**Interfaces:**
- Produces: `TaskDropTarget`, `readTaskDropTarget(element: HTMLElement): TaskDropTarget | null`, and long-press drag after 350ms.
- Consumes: `movePlanTask` and task-bar pointer ownership.

- [ ] **Step 1: Write failing drop-target and timer tests**

```ts
const timed = document.createElement("div")
timed.dataset.dropDate = "2026-08-29"
timed.dataset.startMinutes = "840"
const untimed = document.createElement("div")
untimed.dataset.dropDate = "2026-08-29"

expect(readTaskDropTarget(timed)).toEqual({ scheduledDate: "2026-08-29", startMinutes: 840 })
expect(readTaskDropTarget(untimed)).toEqual({ scheduledDate: "2026-08-29", startMinutes: undefined })
```

With fake timers, pointer release at 349ms must not start drag; advancing to 350ms must show the drag layer. A horizontal move before the timer belongs to swipe completion.

- [ ] **Step 2: Run and verify the red state**

Run: `pnpm test:run src/features/plans/domain/task-drop.test.ts src/features/plans/components/TaskDragLayer.test.tsx`

Expected: FAIL because drag targeting does not exist.

- [ ] **Step 3: Implement explicit drop-zone data contracts**

```ts
export interface TaskDropTarget {
  scheduledDate: string
  startMinutes?: number
}

export function readTaskDropTarget(element: HTMLElement): TaskDropTarget | null {
  const scheduledDate = element.dataset.dropDate
  if (!scheduledDate) return null
  const rawMinutes = element.dataset.startMinutes
  return {
    scheduledDate,
    startMinutes: rawMinutes === undefined ? undefined : Number(rawMinutes),
  }
}
```

Day lanes render `data-drop-date` and optional `data-start-minutes`. Week/month day cells render `data-drop-date`. The “待安排” lane omits minutes.

- [ ] **Step 4: Implement gesture arbitration and undo**

Start the 350ms timer on pointer down. Cancel it when direct horizontal movement exceeds 8px, vertical scrolling exceeds 8px, pointer is cancelled, or the component unmounts. After drop, call `movePlanTask`; dropping within the same lane updates `order`, while cross-lane drops update date/time and order. Show `已移动到目标位置` with an undo action that restores the captured previous date, time, and order.

- [ ] **Step 5: Verify movement behavior**

Run:

```powershell
pnpm test:run src/features/plans/domain/task-drop.test.ts src/features/plans/components/TaskDragLayer.test.tsx src/features/plans/components/TaskBar.test.tsx
pnpm typecheck
```

Expected: swipe and long press do not conflict; timed, untimed, cross-date, cancel, and undo cases pass.

- [ ] **Step 6: Commit drag scheduling**

```powershell
git add src/features/plans
git commit -m "feat: add drag task scheduling"
```

---

### Task 9: Build day, week and month plan views

**Files:**
- Create: `src/features/plans/components/DayPlanView.tsx`
- Create: `src/features/plans/components/DayPlanView.test.tsx`
- Create: `src/features/plans/components/WeekPlanView.tsx`
- Create: `src/features/plans/components/WeekPlanView.test.tsx`
- Create: `src/features/plans/components/MonthPlanView.tsx`
- Create: `src/features/plans/components/MonthPlanView.test.tsx`
- Modify: `src/features/plans/PlansPage.module.css`
- Modify: `src/pages/PlansPage.tsx`

**Interfaces:**
- Produces: three view components consuming `PlanTask[]`, selected date, and edit/create callbacks.

- [ ] **Step 1: Write failing view-specific tests**

Day assertions: timed tasks sort by `startMinutes`, untimed tasks appear under `待安排`, overdue tasks display `已逾期`, and an empty day has one `新建任务` action.

Week assertions: mobile markup exposes seven date buttons plus the selected day's task list; tablet markup exposes seven dated drop zones.

Month assertions: a cell displays counts rather than complete task titles; choosing a date opens that day's list; `2028-02-29` is present.

- [ ] **Step 2: Run and verify the red state**

Run: `pnpm test:run src/features/plans/components/DayPlanView.test.tsx src/features/plans/components/WeekPlanView.test.tsx src/features/plans/components/MonthPlanView.test.tsx`

Expected: FAIL because the view components do not exist.

- [ ] **Step 3: Implement day and responsive week composition**

Day uses a full-width task column with time labels outside the bars. Week uses the same task bar component; below 768px it renders a readable date strip and selected-day list, while 768px+ renders the seven-column grid.

- [ ] **Step 4: Implement the month calendar**

Use `getMonthGridDates` and derive `{ total, completed }` per date. Day cells use cool gray-blue only for selected/scheduled context; purple remains reserved for the active date and primary action. Phone opens the day list as a bottom sheet; tablet renders it as a side panel.

- [ ] **Step 5: Verify all calendar views**

Run:

```powershell
pnpm test:run src/features/plans/components/DayPlanView.test.tsx src/features/plans/components/WeekPlanView.test.tsx src/features/plans/components/MonthPlanView.test.tsx
pnpm typecheck
pnpm lint
```

Expected: day, cross-year week, leap-month, empty, overdue, and responsive composition tests pass.

- [ ] **Step 6: Commit calendar views**

```powershell
git add src/features/plans src/pages/PlansPage.tsx
git commit -m "feat: add day week and month plans"
```

---

### Task 10: Build learning-period and holiday workflows

**Files:**
- Create: `src/features/plans/components/LearningPeriodView.tsx`
- Create: `src/features/plans/components/LearningPeriodView.test.tsx`
- Create: `src/features/plans/components/LearningPeriodDialog.tsx`
- Create: `src/features/plans/components/LearningPeriodDialog.test.tsx`
- Create: `src/features/plans/components/PeriodMigrationPanel.tsx`
- Create: `src/features/plans/components/PeriodMigrationPanel.test.tsx`
- Create: `src/features/plans/components/LegacyPlanMigrationPanel.tsx`
- Create: `src/features/plans/components/LegacyPlanMigrationPanel.test.tsx`
- Modify: `src/pages/PlansPage.tsx`
- Modify: `src/features/plans/PlansPage.module.css`

**Interfaces:**
- Produces: period overview, period editor, cross-period task copy, and explicit legacy-task date assignment.
- Consumes: period and task services from Tasks 3–4.

- [ ] **Step 1: Write failing semester and holiday tests**

Create a semester, winter break, summer break, and custom break. Assert type labels, goal copy, inclusive progress, ordering, and overlap errors. Add a holiday task dated inside winter break and assert it appears in day, week, month, and winter-break queries.

- [ ] **Step 2: Write failing migration-panel tests**

Assert the prompt is non-modal, starts with zero selected tasks, can select three tasks, copies exactly those three, keeps sources unchanged, and assigns the target date using the target range rule. `暂不处理` dismisses the prompt while the period menu can reopen it.

For `legacyPlanTasks`, assert the user must choose a real date before conversion and the source legacy row is deleted only in the same successful transaction that creates the v2 task.

- [ ] **Step 3: Run and verify the red state**

Run: `pnpm test:run src/features/plans/components/LearningPeriodView.test.tsx src/features/plans/components/LearningPeriodDialog.test.tsx src/features/plans/components/PeriodMigrationPanel.test.tsx src/features/plans/components/LegacyPlanMigrationPanel.test.tsx`

Expected: FAIL because the period UI does not exist.

- [ ] **Step 4: Implement period creation and overview**

The editor exposes type, name, inclusive start/end, and optional goal. Inline overlap errors name the conflicting period. Deleting a period uses a confirmation dialog that reports how many tasks become unassigned. Empty state has one action: `创建第一个学期或假期`. Historical periods open in read-only overview mode until the user explicitly edits a task. Tasks outside all ranges appear under `未归属周期`. The overview uses cool blue for time structure, teal for positive/focus metadata, neutral surfaces for cards, and purple only for selection/primary CTA.

- [ ] **Step 5: Implement non-blocking migration and legacy recovery**

Show `上一学习周期还有 N 个任务未完成` as a light inline banner. Phone opens a bottom panel; tablet opens a side panel. Preserve originals, default to no selection, and use one transaction for copy. `暂不处理` writes `appMeta` key `periodMigrationDismissed:<sourceId>:<targetId>` so the banner stays dismissed; choosing the period-menu recovery action deletes that key and reopens the panel. Surface ambiguous v1 rows through `LegacyPlanMigrationPanel`; never guess a date.

- [ ] **Step 6: Verify learning-period workflows**

Run:

```powershell
pnpm test:run src/features/plans/components/LearningPeriodView.test.tsx src/features/plans/components/LearningPeriodDialog.test.tsx src/features/plans/components/PeriodMigrationPanel.test.tsx src/features/plans/components/LegacyPlanMigrationPanel.test.tsx
pnpm typecheck
pnpm lint
```

Expected: semester, all holiday types, goals, overlap, copy, dismissal, reopening, and legacy recovery tests pass.

- [ ] **Step 7: Commit learning-period UI**

```powershell
git add src/features/plans src/pages/PlansPage.tsx
git commit -m "feat: add holiday planning workflows"
```

---

### Task 11: Add focus-entry contracts and complete page-level recovery states

**Files:**
- Create: `src/features/plans/focus-link.ts`
- Create: `src/features/plans/focus-link.test.ts`
- Create: `src/features/plans/components/PlanErrorState.tsx`
- Modify: `src/features/plans/components/TaskActionsDialog.tsx`
- Modify: `src/pages/FocusPage.tsx`
- Modify: `src/pages/PlansPage.tsx`
- Modify: `src/features/home/components/NextTaskCard.tsx`

**Interfaces:**
- Produces: `buildFocusHref(task: Pick<PlanTask, "id" | "estimatedMinutes">): string` and visible local-save retry states.

- [ ] **Step 1: Write failing focus-link and recovery tests**

```ts
expect(buildFocusHref({ id: "math", estimatedMinutes: 45 })).toBe("/focus?task=math&minutes=45")
expect(buildFocusHref({ id: "english", estimatedMinutes: undefined })).toBe("/focus?task=english&minutes=25")
```

Render a rejected create/update and assert the editor remains open, retains the title, displays `保存失败，请重试` next to the action, and succeeds when `重试` is pressed after restoring the database method.

- [ ] **Step 2: Run and verify the red state**

Run: `pnpm test:run src/features/plans/focus-link.test.ts src/pages/PlansPage.test.tsx`

Expected: FAIL because focus linking and page recovery are incomplete.

- [ ] **Step 3: Implement the focus navigation contract**

Use `URLSearchParams` and clamp invalid estimates to the 25-minute default. `FocusPage` reads the parameters and displays the linked task context while retaining milestone-later copy for the full timer. Do not mark the task complete from the focus route.

```ts
export function buildFocusHref(task: Pick<PlanTask, "id" | "estimatedMinutes">) {
  const minutes = task.estimatedMinutes && task.estimatedMinutes > 0 ? task.estimatedMinutes : 25
  const params = new URLSearchParams({ task: task.id, minutes: String(minutes) })
  return `/focus?${params.toString()}`
}
```

- [ ] **Step 4: Implement persistent local error recovery**

All failed writes retain the user's input or previous visual state and render an inline retry action. Toasts may reinforce success but never serve as the only error. Ensure home next-task links and plan task actions use the same focus URL builder.

- [ ] **Step 5: Run regression checks**

Run:

```powershell
pnpm test:run src/features/plans src/features/home src/pages/PlansPage.test.tsx
pnpm typecheck
pnpm lint
```

Expected: plan and home tests pass; focus completion remains manual.

- [ ] **Step 6: Commit focus and recovery integration**

```powershell
git add src/features/plans src/features/home src/pages
git commit -m "feat: connect plans to focus workflow"
```

---

### Task 12: Verify responsive, accessible and offline planning end to end

**Files:**
- Create: `e2e/plans.spec.ts`
- Modify: `README.md`
- Modify: `D:\workplace\GLOBAL-CONSOLE.md` after project verification

**Interfaces:**
- Consumes: production preview from `pnpm test:e2e`.
- Produces: repeatable milestone-2 acceptance and workplace status.

- [ ] **Step 1: Write the end-to-end happy path**

At 390×844: create `复习导数` for today, assert it appears in day/week/month, right-swipe past 70%, assert `已完成`, click `撤销`, long-press 350ms and move it to tomorrow, then verify all three views and home update.

Use pointer movement rather than HTML drag events:

```ts
const box = await page.getByTestId("task-bar-math").boundingBox()
if (!box) throw new Error("Task bar bounds missing")
await page.mouse.move(box.x + 18, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width * 0.78, box.y + box.height / 2, { steps: 8 })
await page.mouse.up()
await expect(page.getByText("已完成")).toBeVisible()
```

- [ ] **Step 2: Write learning-period and holiday acceptance**

Create `2026 秋季学期`, reject an overlapping `2027 寒假`, then create a valid winter break. Create a winter-break task and verify it in day/week/month/period views. Copy selected unfinished semester tasks into the winter break and verify originals remain.

- [ ] **Step 3: Add responsive and visual assertions**

Run widths 375, 390, 768, 834, 1024, and 1440. Assert no horizontal page overflow; task bars fill their content lane; normal task-bar height is 52–56px; phone editor is bottom-aligned; tablet editor is a right drawer; every primary target is at least 44px. Set the root font size to 200%, then assert task bars may grow and no title, status, or action is clipped or overlapped.

Read computed semantic colors and assert the view contains the brand purple token plus at least one approved cool-blue or teal semantic element, while task-card backgrounds are not all identical purple.

- [ ] **Step 4: Add accessibility, reduced-motion and offline assertions**

Run axe on day, month, editor, delete confirmation, and period migration states. Verify keyboard Enter completes, menu can move a task, focus returns after dialog close, and status text accompanies color. Under reduced motion, completion is visible within 100ms. After one online load, go offline, reload `/plans`, create and complete a task, reload again, and assert persistence.

- [ ] **Step 5: Run the complete verification matrix**

Run:

```powershell
pnpm verify
pnpm test:e2e
pnpm test:pwa-lifecycle
git diff --check
git status --short
```

Expected: all unit, component, type, lint, build, Playwright, PWA lifecycle, accessibility, responsive, and offline checks pass; status contains only intended documentation changes.

- [ ] **Step 6: Update documentation and project status**

README documents the four views, semester/holiday cycles, right-swipe/long-press gestures, keyboard alternatives, offline behavior, and verification commands. After project acceptance, update `D:\workplace\GLOBAL-CONSOLE.md` to the actual branch/status and next milestone; do not record transient test counts.

- [ ] **Step 7: Commit acceptance artifacts**

```powershell
git add e2e/plans.spec.ts README.md
git commit -m "test: verify learning plan milestone"
```

Commit the root-only `GLOBAL-CONSOLE.md` update separately from `D:\workplace` with message `docs: update Velow project status`.

## Final Acceptance Commands

```powershell
pnpm verify
pnpm test:e2e
pnpm test:pwa-lifecycle
git diff --check
git status --short
```

All commands must complete without failures or unintended files before milestone 2 is reported complete.
