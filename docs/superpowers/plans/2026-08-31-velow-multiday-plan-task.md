# Velow Notebook Multi-day Plan Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-day learning tasks that split one goal into a user-confirmed number of scheduled study steps while preserving the existing single-task source, right-swipe completion, local-first behavior, and responsive plan views.

**Architecture:** Add a `PlanTaskGroup` aggregate to Dexie and keep every actionable study session as an existing `PlanTask` linked by optional group fields. A pure deterministic scheduler proposes dates; transaction services create, reconcile, move, reschedule, and delete groups; live queries derive group progress and range overlap for the existing day/week/month surfaces.

**Tech Stack:** React 19, TypeScript 5.9, Dexie 4, dexie-react-hooks, CSS Modules, Vitest, Testing Library, Playwright, Vite PWA.

**Spec:** `docs/superpowers/specs/2026-08-31-velow-multiday-plan-task-design.md`

## Global Constraints

- Keep one “新建任务” entry; do not add separate “创建周计划” or “创建月计划” entities.
- A multi-day task uses an inclusive local `startDate` / `endDate` and a positive `sessionCount`; v1 allows at most one group session per calendar day.
- Parent groups never count in plan progress; ordinary tasks and concrete group steps keep equal weight.
- Scheduling is deterministic and local: spread sessions, consider existing daily load, and anchor the last proposed session to the deadline.
- Never auto-move overdue or previously confirmed steps; show a proposal and persist only after user confirmation.
- Completing or moving one step must not silently complete or move sibling steps.
- Reuse the existing 70% right-swipe threshold, 5-second undo, keyboard completion, and local-first persistence.
- Use Velow purple `#901D78` for brand and swipe confirmation, cool blue/blue-gray for current or “待调整”, and low-saturation teal only as a supporting status color.
- Support 375, 390, 768, 834, 1024, and 1440px widths, 44×44 CSS px targets, 200% text zoom, and `prefers-reduced-motion`.
- Add no AI, network, notification, recurrence, priority, collaboration, or new runtime dependency in this implementation.

## File Structure

### Data and domain

- Modify `src/db/types.ts`: define `PlanTaskGroup` and optional group-step fields on `PlanTask`.
- Modify `src/db/velo-db.ts`: add Dexie v3 `planTaskGroups` table and group indexes on `planTasks`.
- Modify `src/db/velo-db.test.ts`: prove the v2 → v3 upgrade preserves existing tasks and supports group indexes.
- Create `src/features/plans/domain/multiday-schedule.ts`: pure date enumeration, load scoring, initial scheduling, and overdue rescheduling proposals.
- Create `src/features/plans/domain/multiday-schedule.test.ts`: deterministic algorithm boundary coverage.
- Create `src/features/plans/domain/task-group-status.ts`: group progress, range overlap, and overdue-step derivation.
- Create `src/features/plans/domain/task-group-status.test.ts`: progress and state rules.
- Create `src/features/plans/data/plan-task-group-service.ts`: atomic group CRUD and schedule reconciliation.
- Create `src/features/plans/data/plan-task-group-service.test.ts`: transaction, validation, reconciliation, and rollback coverage.
- Create `src/features/plans/data/task-order.ts`: shared next-order lookup used by ordinary and grouped task creation.
- Modify `src/features/plans/data/plan-task-service.ts`: consume the shared order helper before adding group-aware move validation.
- Modify `src/features/plans/data/plan-task-service.ts`: group-aware move validation and optional range extension.
- Modify `src/features/plans/data/plan-task-service.test.ts`: duplicate-date and range-extension tests.

### UI

- Modify `src/features/plans/usePlanWorkspace.ts` and its test: query task groups overlapping the active range and expose a group lookup.
- Modify `src/features/plans/components/TaskEditorDialog.tsx` and its test: add the single/multi mode entry and route multi-day editing.
- Create `src/features/plans/components/MultiDayTaskForm.tsx` and test: manage range/count fields, preview, retry, and group editing.
- Create `src/features/plans/components/SchedulePreview.tsx`: editable session date/title rows with load summaries.
- Modify `src/features/plans/components/PlanDialog.module.css`: responsive mode switch and preview styles.
- Create `src/features/plans/components/TaskGroupBand.tsx`, CSS module, and test: shared continuous group range presentation.
- Modify `src/features/plans/components/DayPlanView.tsx`, `WeekPlanView.tsx`, `MonthPlanView.tsx` and tests: show group metadata, weekly bands/nodes, and monthly cross-week bands.
- Create `src/features/plans/components/TaskGroupDetailsDialog.tsx` and test: group progress, steps, editing, deletion, and reschedule confirmation.
- Create `src/features/plans/components/ExtendTaskGroupDialog.tsx` and test: confirm moving a step outside its group range.
- Create `src/features/plans/components/SwipeHintProvider.tsx` and test: claim and persist the one-time swipe hint.
- Modify `src/features/plans/components/TaskBar.tsx`, CSS module, and test: group metadata, “待调整”, range-extension callback, and discoverable swipe visuals.
- Modify `src/pages/PlansPage.tsx` and test: own group dialogs and wire all group-aware callbacks.
- Modify `src/features/plans/PlansPage.module.css` and responsive test: final week/month/task-group layout.

### End-to-end and documentation

- Modify `e2e/plans.spec.ts`: cover create, render, complete, reschedule, extend, reload, keyboard, reduced motion, and responsive behavior.
- Modify `README.md`: document multi-day task behavior and verification.

---

### Task 1: Add the Dexie v3 task-group schema

**Files:**
- Modify: `src/db/types.ts`
- Modify: `src/db/velo-db.ts`
- Modify: `src/db/velo-db.test.ts`

**Interfaces:**
- Produces: `PlanTaskGroup`, `PlanTask.groupId`, `PlanTask.stepIndex`, `PlanTask.stepTitleMode`, and `VeloDB.planTaskGroups`.
- Preserves: every v2 `PlanTask` byte-for-byte at the application field level; old rows have no group fields.

- [ ] **Step 1: Write the failing v2 → v3 upgrade test**

```ts
async function createVersionTwoDatabase(name: string, tasks: PlanTask[]) {
  const oldDb = new Dexie(name)
  oldDb.version(2).stores({
    planTasks: "id, scheduledDate, [scheduledDate+isCompleted], [scheduledDate+startMinutes], isCompleted, updatedAt",
    learningPeriods: "id, kind, startDate, endDate, updatedAt",
    legacyPlanTasks: "id, scope, periodKey, updatedAt",
    knowledgeNodes: "id, parentId, type, order, updatedAt",
    notes: "id, nodeId, title, updatedAt",
    appMeta: "key, updatedAt",
  })
  await oldDb.table("planTasks").bulkAdd(tasks)
  oldDb.close()
}

it("upgrades version two tasks without inventing group membership", async () => {
  const name = `velo-v2-upgrade-${crypto.randomUUID()}`
  await createVersionTwoDatabase(name, [existingTask])

  const db = new VeloDB(name)
  await db.open()

  expect(await db.planTasks.get(existingTask.id)).toEqual(existingTask)
  expect(await db.planTaskGroups.count()).toBe(0)
  await db.delete()
})
```

Add a second test that inserts one group and two linked steps, then queries `planTasks.where("groupId").equals(group.id)` and `[groupId+stepIndex]` in order.

```ts
it("indexes groups and their ordered steps", async () => {
  await withDatabase(async (db) => {
    const group: PlanTaskGroup = {
      id: "group",
      title: "高数第三章",
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      sessionCount: 2,
      createdAt: 1,
      updatedAt: 1,
    }
    await db.planTaskGroups.add(group)
    await db.planTasks.bulkAdd([
      { ...existingTask, id: "step-2", groupId: group.id, stepIndex: 2, scheduledDate: "2026-09-07" },
      { ...existingTask, id: "step-1", groupId: group.id, stepIndex: 1, scheduledDate: "2026-09-01" },
    ])

    expect(await db.planTasks.where("groupId").equals(group.id).count()).toBe(2)
    expect((await db.planTasks.where("[groupId+stepIndex]").between([group.id, Dexie.minKey], [group.id, Dexie.maxKey]).toArray()).map(({ id }) => id))
      .toEqual(["step-1", "step-2"])
  })
})
```

- [ ] **Step 2: Run the database test and verify it fails**

Run: `pnpm test:run -- src/db/velo-db.test.ts`

Expected: FAIL because `planTaskGroups` and group indexes do not exist.

- [ ] **Step 3: Add the types and Dexie v3 stores**

```ts
export type PlanTaskStepTitleMode = "inherit" | "custom"

export interface PlanTaskGroup {
  id: string
  title: string
  subject?: string
  notes?: string
  startDate: string
  endDate: string
  sessionCount: number
  estimatedMinutes?: number
  createdAt: number
  updatedAt: number
}

export interface PlanTask {
  // existing fields stay unchanged
  groupId?: string
  stepIndex?: number
  stepTitleMode?: PlanTaskStepTitleMode
}
```

In `VeloDB`, declare `planTaskGroups!: Table<PlanTaskGroup, string>` and add version 3:

```ts
this.version(3).stores({
  planTasks: "id, scheduledDate, [scheduledDate+isCompleted], [scheduledDate+startMinutes], groupId, [groupId+stepIndex], isCompleted, updatedAt",
  planTaskGroups: "id, startDate, endDate, updatedAt",
  learningPeriods: "id, kind, startDate, endDate, updatedAt",
  legacyPlanTasks: "id, scope, periodKey, updatedAt",
  knowledgeNodes: "id, parentId, type, order, updatedAt",
  notes: "id, nodeId, title, updatedAt",
  appMeta: "key, updatedAt",
})
```

- [ ] **Step 4: Run schema tests and type checking**

Run: `pnpm test:run -- src/db/velo-db.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the schema unit**

```bash
git add src/db/types.ts src/db/velo-db.ts src/db/velo-db.test.ts
git commit -m "feat: add multi-day task group schema"
```

### Task 2: Build the deterministic local scheduler

**Files:**
- Create: `src/features/plans/domain/multiday-schedule.ts`
- Create: `src/features/plans/domain/multiday-schedule.test.ts`

**Interfaces:**
- Consumes: `PlanTask`, `PlanTaskGroup`, local `YYYY-MM-DD` strings.
- Produces:

```ts
export interface ScheduleRequest {
  startDate: string
  endDate: string
  sessionCount: number
  estimatedMinutes?: number
}

export interface ScheduledStepDraft {
  scheduledDate: string
  stepIndex: number
}

export interface RescheduleProposal {
  taskId: string
  previousDate: string
  scheduledDate: string
}

export function buildMultiDaySchedule(request: ScheduleRequest, existingTasks: PlanTask[]): ScheduledStepDraft[]
export function buildOverdueRescheduleProposal(group: PlanTaskGroup, groupTasks: PlanTask[], allTasks: PlanTask[], today: string): RescheduleProposal[]
```

- [ ] **Step 1: Write failing scheduler tests**

```ts
function task(id: string, scheduledDate: string, estimatedMinutes?: number): PlanTask {
  return { id, title: id, scheduledDate, estimatedMinutes, isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 }
}

it("spreads three sessions and anchors the deadline", () => {
  expect(buildMultiDaySchedule({
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    sessionCount: 3,
  }, [])).toEqual([
    { scheduledDate: "2026-09-01", stepIndex: 1 },
    { scheduledDate: "2026-09-04", stepIndex: 2 },
    { scheduledDate: "2026-09-07", stepIndex: 3 },
  ])
})

it("chooses the lighter date inside an even scheduling window", () => {
  const busy = [task("busy-1", "2026-09-04", 120), task("busy-2", "2026-09-04", 60)]
  const result = buildMultiDaySchedule({ startDate: "2026-09-01", endDate: "2026-09-07", sessionCount: 3 }, busy)
  expect(result.map((step) => step.scheduledDate)).toEqual(["2026-09-01", "2026-09-03", "2026-09-07"])
})
```

Cover the remaining boundaries with table-driven cases:

```ts
it.each([
  [{ startDate: "2026-09-01", endDate: "2026-09-07", sessionCount: 1 }, ["2026-09-07"]],
  [{ startDate: "2028-02-28", endDate: "2028-03-01", sessionCount: 3 }, ["2028-02-28", "2028-02-29", "2028-03-01"]],
  [{ startDate: "2026-12-31", endDate: "2027-01-02", sessionCount: 3 }, ["2026-12-31", "2027-01-01", "2027-01-02"]],
])("schedules inclusive local-date boundaries", (request, dates) => {
  expect(buildMultiDaySchedule(request, []).map(({ scheduledDate }) => scheduledDate)).toEqual(dates)
})

it.each([
  { startDate: "2026-09-07", endDate: "2026-09-01", sessionCount: 1 },
  { startDate: "2026-09-01", endDate: "2026-09-02", sessionCount: 3 },
  { startDate: "2026-02-31", endDate: "2026-03-02", sessionCount: 1 },
])("rejects invalid schedule request %#", (request) => {
  expect(() => buildMultiDaySchedule(request, [])).toThrow()
})
```

Add one explicit reschedule test in which a completed step remains on its original date, an overdue incomplete step moves to the lightest available date, and a fully occupied range throws `截止日前没有足够日期重新安排剩余学习`.

- [ ] **Step 2: Run scheduler tests and verify they fail**

Run: `pnpm test:run -- src/features/plans/domain/multiday-schedule.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement date enumeration, load scoring, and stable selection**

```ts
function taskLoadMinutes(task: Pick<PlanTask, "estimatedMinutes">) {
  return task.estimatedMinutes ?? 30
}

function dailyLoad(tasks: PlanTask[]) {
  const result = new Map<string, { minutes: number; count: number }>()
  for (const task of tasks) {
    const current = result.get(task.scheduledDate) ?? { minutes: 0, count: 0 }
    result.set(task.scheduledDate, {
      minutes: current.minutes + taskLoadMinutes(task),
      count: current.count + 1,
    })
  }
  return result
}
```

Enumerate inclusive local dates with `parseLocalDate` plus `formatLocalDate`. Compute evenly spaced target indices, split non-final targets into non-overlapping midpoint windows, choose the lowest `(minutes, count, distanceFromTarget, date)` tuple inside each window, and force the final step to `endDate`.

- [ ] **Step 4: Implement overdue proposal generation**

Keep completed tasks and non-overdue incomplete tasks fixed. Schedule only incomplete tasks whose date is before `today`, using dates from `today` through `group.endDate` that are not already occupied by another step in the group. Throw the explicit message `截止日前没有足够日期重新安排剩余学习` when capacity is insufficient.

- [ ] **Step 5: Run scheduler tests and lint the module**

Run: `pnpm test:run -- src/features/plans/domain/multiday-schedule.test.ts && pnpm lint`

Expected: PASS.

- [ ] **Step 6: Commit the scheduler unit**

```bash
git add src/features/plans/domain/multiday-schedule.ts src/features/plans/domain/multiday-schedule.test.ts
git commit -m "feat: add deterministic multi-day scheduling"
```

### Task 3: Add atomic task-group services

**Files:**
- Create: `src/features/plans/data/plan-task-group-service.ts`
- Create: `src/features/plans/data/plan-task-group-service.test.ts`
- Create: `src/features/plans/data/task-order.ts`
- Modify: `src/features/plans/data/plan-task-service.ts`

**Interfaces:**
- Consumes: schema from Task 1 and schedule drafts from Task 2.
- Produces:

```ts
export interface PlanTaskStepInput {
  scheduledDate: string
  title: string
  stepIndex: number
  stepTitleMode: "inherit" | "custom"
}

export interface CreatePlanTaskGroupInput {
  title: string
  subject?: string
  notes?: string
  startDate: string
  endDate: string
  sessionCount: number
  estimatedMinutes?: number
  steps: PlanTaskStepInput[]
}

export async function createPlanTaskGroup(db: VeloDB, input: CreatePlanTaskGroupInput, now: number): Promise<{ group: PlanTaskGroup; tasks: PlanTask[] }>
export async function updatePlanTaskGroup(db: VeloDB, id: string, input: CreatePlanTaskGroupInput, now: number): Promise<{ group: PlanTaskGroup; tasks: PlanTask[] }>
export async function applyTaskGroupSchedule(db: VeloDB, groupId: string, proposals: RescheduleProposal[], now: number): Promise<PlanTask[]>
export async function deletePlanTaskGroup(db: VeloDB, groupId: string): Promise<{ deletedTaskCount: number }>
export async function getNextTaskOrder(db: VeloDB, scheduledDate: string, startMinutes: number | undefined): Promise<number>
```

- [ ] **Step 1: Write failing create and rollback tests**

```ts
function validInput(): CreatePlanTaskGroupInput {
  return {
    title: "完成高数第三章",
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    sessionCount: 3,
    estimatedMinutes: 45,
    steps: [
      { scheduledDate: "2026-09-01", title: "完成高数第三章", stepIndex: 1, stepTitleMode: "inherit" },
      { scheduledDate: "2026-09-04", title: "极限与连续", stepIndex: 2, stepTitleMode: "custom" },
      { scheduledDate: "2026-09-07", title: "完成高数第三章", stepIndex: 3, stepTitleMode: "inherit" },
    ],
  }
}

it("creates the group and all steps in one transaction", async () => {
  const result = await createPlanTaskGroup(db, validInput(), 100)
  expect(result.tasks.map(({ groupId, stepIndex }) => ({ groupId, stepIndex }))).toEqual([
    { groupId: result.group.id, stepIndex: 1 },
    { groupId: result.group.id, stepIndex: 2 },
    { groupId: result.group.id, stepIndex: 3 },
  ])
  expect(await db.planTaskGroups.count()).toBe(1)
})

it("rolls back the group when one step write fails", async () => {
  db.planTasks.hook("creating", () => { throw new Error("step write failed") })
  await expect(createPlanTaskGroup(db, validInput(), 100)).rejects.toThrow("step write failed")
  expect(await db.planTaskGroups.count()).toBe(0)
  expect(await db.planTasks.count()).toBe(0)
})
```

- [ ] **Step 2: Run the service tests and verify they fail**

Run: `pnpm test:run -- src/features/plans/data/plan-task-group-service.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement validation and atomic creation**

Validate trimmed title, local dates, count, exact step count, unique in-range step dates, sequential indices, and positive integer estimate. Create the group and tasks inside:

```ts
return db.transaction("rw", db.planTaskGroups, db.planTasks, async () => {
  await db.planTaskGroups.add(group)
  await db.planTasks.bulkAdd(tasks)
  return { group, tasks }
})
```

Extract the existing private order query from `plan-task-service.ts` into `task-order.ts` as `getNextTaskOrder`, then import it in both task services. Each created task uses `stepTitleMode`, inherits subject/notes/estimate, starts incomplete and untimed, and receives the next order for its scheduled date. Existing ordinary-task ordering tests must remain green through the extraction.

- [ ] **Step 4: Write failing reconciliation, reschedule, and deletion tests**

Cover title inheritance versus custom titles, completed-step preservation, count increase, rejection when the requested count is below the completed-step count, count decrease confirmation input, schedule proposal identity checks, delete-all behavior, missing groups, and injected bulk-update failure rollback.

- [ ] **Step 5: Implement update, schedule application, and deletion**

Reconcile by `stepIndex`: preserve completed rows, update only inherited titles, create missing future indices, and delete only the uncompleted rows explicitly omitted by the confirmed input. `applyTaskGroupSchedule` must reject any proposal for a completed or foreign task and update all accepted dates atomically.

- [ ] **Step 6: Run service and database tests**

Run: `pnpm test:run -- src/features/plans/data/plan-task-group-service.test.ts src/db/velo-db.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the service unit**

```bash
git add src/features/plans/data/plan-task-group-service.ts src/features/plans/data/plan-task-group-service.test.ts src/features/plans/data/task-order.ts src/features/plans/data/plan-task-service.ts
git commit -m "feat: add atomic multi-day task services"
```

### Task 4: Derive group status and query overlapping groups

**Files:**
- Create: `src/features/plans/domain/task-group-status.ts`
- Create: `src/features/plans/domain/task-group-status.test.ts`
- Modify: `src/features/plans/usePlanWorkspace.ts`
- Modify: `src/features/plans/usePlanWorkspace.test.tsx`

**Interfaces:**
- Consumes: `PlanTaskGroup[]` and `PlanTask[]`.
- Produces:

```ts
export interface TaskGroupProgress { completed: number; total: number; ratio: number }
export type TaskGroupStepState = "upcoming" | "current" | "completed" | "needs-reschedule"

export function getTaskGroupProgress(groupId: string, tasks: PlanTask[]): TaskGroupProgress
export function getTaskGroupStepState(task: PlanTask, today: string): TaskGroupStepState
export function groupOverlapsRange(group: PlanTaskGroup, startDate: string, endDate: string): boolean

export interface PlanWorkspaceSnapshot {
  allTasks: PlanTask[]
  tasks: PlanTask[]
  allTaskGroups: PlanTaskGroup[]
  taskGroups: PlanTaskGroup[]
  taskGroupById: Record<string, PlanTaskGroup>
  periods: LearningPeriod[]
  selectedPeriod: LearningPeriod | null
  progress: { completed: number; total: number; ratio: number }
}
```

- [ ] **Step 1: Write failing pure status tests**

```ts
function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: "step",
    title: "高数第三章",
    scheduledDate: "2026-08-30",
    groupId: "group",
    stepIndex: 1,
    stepTitleMode: "inherit",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

it("does not count the parent group in progress", () => {
  const tasks = [
    makeTask({ id: "one", stepIndex: 1, isCompleted: 1 }),
    makeTask({ id: "two", stepIndex: 2, isCompleted: 0 }),
    makeTask({ id: "ordinary", groupId: undefined, stepIndex: undefined }),
  ]
  expect(getTaskGroupProgress("group", tasks)).toEqual({
    completed: 1,
    total: 2,
    ratio: 1 / 2,
  })
})

it("marks only overdue incomplete group steps for rescheduling", () => {
  expect(getTaskGroupStepState(makeTask(), "2026-08-31")).toBe("needs-reschedule")
  expect(getTaskGroupStepState(makeTask({ isCompleted: 1 }), "2026-08-31")).toBe("completed")
})
```

- [ ] **Step 2: Write the failing live-query overlap test**

Insert a group starting before the selected week and ending inside it, plus a group outside it. Expect only the intersecting group in `snapshot.taskGroups`, while `snapshot.progress` still equals the ordinary task and step count for the range.

- [ ] **Step 3: Run focused tests and verify they fail**

Run: `pnpm test:run -- src/features/plans/domain/task-group-status.test.ts src/features/plans/usePlanWorkspace.test.tsx`

Expected: FAIL because group status and snapshot fields do not exist.

- [ ] **Step 4: Implement status helpers and live queries**

Load `allTaskGroups` in the same `useLiveQuery`, filter by inclusive interval overlap, and build `taskGroupById` with `Object.fromEntries`. Keep `getProgress(tasks)` unchanged so parents cannot enter the denominator.

- [ ] **Step 5: Run focused tests and the existing homepage query tests**

Run: `pnpm test:run -- src/features/plans/domain/task-group-status.test.ts src/features/plans/usePlanWorkspace.test.tsx src/features/home/home-query.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the query unit**

```bash
git add src/features/plans/domain/task-group-status.ts src/features/plans/domain/task-group-status.test.ts src/features/plans/usePlanWorkspace.ts src/features/plans/usePlanWorkspace.test.tsx
git commit -m "feat: expose multi-day task progress"
```

### Task 5: Add multi-day creation and editing

**Files:**
- Modify: `src/features/plans/components/TaskEditorDialog.tsx`
- Modify: `src/features/plans/components/TaskEditorDialog.test.tsx`
- Create: `src/features/plans/components/MultiDayTaskForm.tsx`
- Create: `src/features/plans/components/MultiDayTaskForm.test.tsx`
- Create: `src/features/plans/components/SchedulePreview.tsx`
- Modify: `src/features/plans/components/PlanDialog.module.css`

**Interfaces:**
- Consumes: `buildMultiDaySchedule`, group service functions, and `VeloDB`.
- Produces: a single editor entry that supports `initialMode?: "single" | "multi"` and `taskGroup?: PlanTaskGroup` without changing existing single-task behavior.

- [ ] **Step 1: Write the failing mode and validation tests**

```tsx
it("creates a multi-day task from the unified task editor", async () => {
  render(<TaskEditorDialog db={db} initialDate="2026-09-01" onClose={onClose} open />)
  await user.click(screen.getByRole("button", { name: "跨日任务" }))
  await user.type(screen.getByLabelText("任务名称"), "完成高数第三章")
  await user.clear(screen.getByLabelText("截止日期"))
  await user.type(screen.getByLabelText("截止日期"), "2026-09-07")
  await user.clear(screen.getByLabelText("学习次数"))
  await user.type(screen.getByLabelText("学习次数"), "3")
  await user.click(screen.getByRole("button", { name: "保存跨日任务" }))

  const savedGroup = await db.planTaskGroups.toCollection().first()
  expect(savedGroup).toBeDefined()
  expect(await db.planTasks.where("groupId").equals(savedGroup!.id).count()).toBe(3)
})
```

Add tests for count exceeding range days, invalid range, editable preview dates/titles, busy-day recommendation, retry preserving fields, and editing a group with completed and custom-title steps.

- [ ] **Step 2: Run editor tests and verify they fail**

Run: `pnpm test:run -- src/features/plans/components/TaskEditorDialog.test.tsx src/features/plans/components/MultiDayTaskForm.test.tsx`

Expected: FAIL because multi-day controls do not exist.

- [ ] **Step 3: Add the mode switch without regressing single-day editing**

```tsx
type EditorMode = "single" | "multi"

const [mode, setMode] = useState<EditorMode>(() => taskGroup ? "multi" : "single")

{!task && !taskGroup ? (
  <div aria-label="任务类型" className={styles.modeSwitch} role="group">
    <button aria-pressed={mode === "single"} onClick={() => setMode("single")} type="button">单日任务</button>
    <button aria-pressed={mode === "multi"} onClick={() => setMode("multi")} type="button">跨日任务</button>
  </div>
) : null}
```

Keep the existing single-day form and request-session behavior unchanged.

- [ ] **Step 4: Implement `MultiDayTaskForm` and `SchedulePreview`**

Use controlled strings for title, dates, count, estimate, subject, and notes. Recompute draft dates from `buildMultiDaySchedule` after valid range/count changes, but preserve user-edited preview rows until a range/count field changes. When editing, exclude the current group's own steps from daily-load input so they do not make their existing dates look artificially busy. Submit the exact visible rows to `createPlanTaskGroup` or `updatePlanTaskGroup`.

`SchedulePreview` renders rows with labels `第 1 次`, editable date/title inputs, and a load summary such as `当天已有 2 项 · 预计 90 分钟`. Field errors remain adjacent to their input.

- [ ] **Step 5: Add responsive editor styles**

Use the current bottom sheet below 768px and side drawer from 768px. Make the mode switch two equal 44px controls, keep schedule rows single-column on phone, and use a compact date/title grid in the drawer. Add visible focus, 200% zoom wrapping, and no purple background on every preview row.

- [ ] **Step 6: Run editor, dialog, accessibility, and type tests**

Run: `pnpm test:run -- src/features/plans/components/TaskEditorDialog.test.tsx src/features/plans/components/MultiDayTaskForm.test.tsx src/features/plans/components/PlanDialog.test.tsx && pnpm typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the editor unit**

```bash
git add src/features/plans/components/TaskEditorDialog.tsx src/features/plans/components/TaskEditorDialog.test.tsx src/features/plans/components/MultiDayTaskForm.tsx src/features/plans/components/MultiDayTaskForm.test.tsx src/features/plans/components/SchedulePreview.tsx src/features/plans/components/PlanDialog.module.css
git commit -m "feat: create and edit multi-day tasks"
```

### Task 6: Render multi-day context in day, week, and month views

**Files:**
- Create: `src/features/plans/components/TaskGroupBand.tsx`
- Create: `src/features/plans/components/TaskGroupBand.module.css`
- Create: `src/features/plans/components/TaskGroupBand.test.tsx`
- Modify: `src/features/plans/components/DayPlanView.tsx`
- Modify: `src/features/plans/components/DayPlanView.test.tsx`
- Modify: `src/features/plans/components/WeekPlanView.tsx`
- Modify: `src/features/plans/components/WeekPlanView.test.tsx`
- Modify: `src/features/plans/components/MonthPlanView.tsx`
- Modify: `src/features/plans/components/MonthPlanView.test.tsx`
- Modify: `src/features/plans/PlansPage.module.css`
- Modify: `src/features/plans/PlansPage.responsive.test.ts`
- Modify: `src/pages/PlansPage.tsx`
- Modify: `src/pages/PlansPage.test.tsx`

**Interfaces:**
- Consumes: `snapshot.taskGroups`, `snapshot.taskGroupById`, `getTaskGroupProgress`, and existing tasks.
- Produces:

```ts
interface TaskGroupBandProps {
  group: PlanTaskGroup
  tasks: PlanTask[]
  rangeStart: string
  rangeEnd: string
  variant: "week" | "month"
  onOpen: (group: PlanTaskGroup, trigger: HTMLButtonElement) => void
}
```

- [ ] **Step 1: Write failing band and view tests**

```tsx
function groupStep(overrides: Partial<PlanTask>): PlanTask {
  return {
    id: "step",
    title: "高数第三章",
    scheduledDate: "2026-09-01",
    groupId: "group",
    stepIndex: 1,
    stepTitleMode: "inherit",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

const group: PlanTaskGroup = {
  id: "group",
  title: "高数第三章",
  startDate: "2026-09-01",
  endDate: "2026-09-07",
  sessionCount: 3,
  createdAt: 1,
  updatedAt: 1,
}
const steps = [
  groupStep({ id: "step-1", scheduledDate: "2026-09-01", stepIndex: 1, isCompleted: 1 }),
  groupStep({ id: "step-2", scheduledDate: "2026-09-04", stepIndex: 2, isCompleted: 1 }),
  groupStep({ id: "step-3", scheduledDate: "2026-09-07", stepIndex: 3, isCompleted: 0 }),
]
const crossWeekGroup: PlanTaskGroup = {
  ...group,
  id: "cross-week",
  title: "课程论文",
  startDate: "2026-09-17",
  endDate: "2026-09-24",
  sessionCount: 4,
}
const crossWeekSteps = [
  groupStep({ id: "paper-1", groupId: crossWeekGroup.id, scheduledDate: "2026-09-17", stepIndex: 1, isCompleted: 1 }),
  groupStep({ id: "paper-2", groupId: crossWeekGroup.id, scheduledDate: "2026-09-20", stepIndex: 2 }),
  groupStep({ id: "paper-3", groupId: crossWeekGroup.id, scheduledDate: "2026-09-22", stepIndex: 3 }),
  groupStep({ id: "paper-4", groupId: crossWeekGroup.id, scheduledDate: "2026-09-24", stepIndex: 4 }),
]

it("shows one weekly range band and only the scheduled step nodes", () => {
  render(<WeekPlanView db={db} selectedDate="2026-09-03" taskGroups={[group]} tasks={steps} />)
  expect(screen.getByRole("button", { name: /高数第三章.*9月1日至9月7日.*2\/3/ })).toBeVisible()
  expect(screen.getAllByLabelText(/第 \d 次学习/)).toHaveLength(3)
})

it("splits a monthly band at week boundaries without duplicating progress", () => {
  render(<MonthPlanView db={db} selectedDate="2026-09-20" taskGroups={[crossWeekGroup]} tasks={crossWeekSteps} />)
  expect(screen.getAllByTestId("month-task-group-segment")).toHaveLength(2)
  expect(screen.getByText("1/4")).toBeVisible()
})
```

Add a day-view assertion for `第 2/3 次` metadata and a query integration assertion that parents do not change `PlanProgress` totals.

- [ ] **Step 2: Run view tests and verify they fail**

Run: `pnpm test:run -- src/features/plans/components/TaskGroupBand.test.tsx src/features/plans/components/DayPlanView.test.tsx src/features/plans/components/WeekPlanView.test.tsx src/features/plans/components/MonthPlanView.test.tsx src/pages/PlansPage.test.tsx`

Expected: FAIL because views do not accept or render groups.

- [ ] **Step 3: Implement the shared range band**

Clamp the visible band to `[rangeStart, rangeEnd]`, expose a full accessible label, derive progress from associated tasks, and render scheduled nodes only for tasks inside the visible interval. Use CSS variables for start column, span, continuation-at-start, and continuation-at-end rather than component-specific absolute pixel positions.

- [ ] **Step 4: Integrate day and week views**

Day view reads `task.groupId` from `taskGroupById` and passes `groupProgress` to `TaskBar`. Week mobile adds a horizontally scrollable group-overview section above the selected day list; tablet/desktop adds bands above the seven day columns while concrete steps remain draggable in their date columns.

- [ ] **Step 5: Integrate the month view**

Partition the 42 calendar dates into six week rows. For each row, render only groups intersecting that seven-day range and create one clamped segment. Keep date buttons and the selected-date task panel unchanged; cap visible bands per week and show `还有 N 项` for overflow.

- [ ] **Step 6: Add responsive and semantic styles**

Use purple only for the range identity and completed nodes, cool blue for the current node, white/low-saturation purple-gray for future nodes, and text labels in every state. Verify the mobile group overview scrolls inside its own container without causing page-level horizontal scrolling.

- [ ] **Step 7: Run view, responsive, and page tests**

Run: `pnpm test:run -- src/features/plans/components/TaskGroupBand.test.tsx src/features/plans/components/DayPlanView.test.tsx src/features/plans/components/WeekPlanView.test.tsx src/features/plans/components/MonthPlanView.test.tsx src/features/plans/PlansPage.responsive.test.ts src/pages/PlansPage.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit the view unit**

```bash
git add src/features/plans/components/TaskGroupBand.tsx src/features/plans/components/TaskGroupBand.module.css src/features/plans/components/TaskGroupBand.test.tsx src/features/plans/components/DayPlanView.tsx src/features/plans/components/DayPlanView.test.tsx src/features/plans/components/WeekPlanView.tsx src/features/plans/components/WeekPlanView.test.tsx src/features/plans/components/MonthPlanView.tsx src/features/plans/components/MonthPlanView.test.tsx src/features/plans/PlansPage.module.css src/features/plans/PlansPage.responsive.test.ts src/pages/PlansPage.tsx src/pages/PlansPage.test.tsx
git commit -m "feat: show multi-day tasks across plan views"
```

### Task 7: Add task-group details and confirmed overdue rescheduling

**Files:**
- Create: `src/features/plans/components/TaskGroupDetailsDialog.tsx`
- Create: `src/features/plans/components/TaskGroupDetailsDialog.test.tsx`
- Modify: `src/features/plans/components/TaskActionsDialog.tsx`
- Modify: `src/features/plans/components/TaskEditorDialog.test.tsx`
- Modify: `src/pages/PlansPage.tsx`
- Modify: `src/pages/PlansPage.test.tsx`
- Modify: `src/features/plans/components/PlanDialog.module.css`
- Modify: `src/features/plans/PlansPage.module.css`

**Interfaces:**
- Consumes: `buildOverdueRescheduleProposal`, `applyTaskGroupSchedule`, `deletePlanTaskGroup`, and `PlanTaskGroup` lookup.
- Produces: `onOpenGroup(group, trigger)` from bands and group-linked task actions.

- [ ] **Step 1: Write failing detail and reschedule tests**

```tsx
function groupStep(overrides: Partial<PlanTask>): PlanTask {
  return {
    id: "step",
    title: "高数第三章",
    scheduledDate: "2026-09-01",
    groupId: "group",
    stepIndex: 1,
    stepTitleMode: "inherit",
    isCompleted: 0,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

const group: PlanTaskGroup = {
  id: "group",
  title: "高数第三章",
  startDate: "2026-09-01",
  endDate: "2026-09-07",
  sessionCount: 3,
  createdAt: 1,
  updatedAt: 1,
}
const steps = [
  groupStep({ id: "overdue", scheduledDate: "2026-09-03", stepIndex: 1 }),
  groupStep({ id: "completed", scheduledDate: "2026-09-01", stepIndex: 2, isCompleted: 1 }),
  groupStep({ id: "future", scheduledDate: "2026-09-07", stepIndex: 3 }),
]

it("does not persist an overdue proposal before confirmation", async () => {
  render(<TaskGroupDetailsDialog db={db} group={group} open tasks={steps} today="2026-09-05" onClose={vi.fn()} />)
  expect(screen.getByText("待调整")).toBeVisible()
  expect(screen.getByText(/建议调整至/)).toBeVisible()
  expect((await db.planTasks.get("overdue"))?.scheduledDate).toBe("2026-09-03")

  await user.click(screen.getByRole("button", { name: "确认调整" }))
  expect((await db.planTasks.get("overdue"))?.scheduledDate).toBe("2026-09-05")
})
```

Add tests for “保持原计划”, no-capacity copy, focus return, retry after write failure, edit-group handoff, and delete confirmation showing the exact linked-step count.

- [ ] **Step 2: Run detail tests and verify they fail**

Run: `pnpm test:run -- src/features/plans/components/TaskGroupDetailsDialog.test.tsx src/pages/PlansPage.test.tsx`

Expected: FAIL because the dialog does not exist.

- [ ] **Step 3: Implement group details and proposal state**

Render the group title, inclusive range, `completed / total`, step list, and actions. Compute proposals into component state without writing. “确认调整” calls `applyTaskGroupSchedule`; “保持原计划” dismisses the proposal for the current dialog session only and leaves IndexedDB untouched.

For no capacity, render two explicit actions: edit the deadline through `TaskEditorDialog` or edit the remaining session count. Do not choose either automatically.

- [ ] **Step 4: Wire group entry points and deletion**

Clicking `TaskGroupBand` opens group details. `TaskActionsDialog` for a linked step adds “查看跨日任务” while retaining per-step completion/edit/delete actions. PlansPage owns the active group, editor handoff, delete confirmation, and focus restoration.

- [ ] **Step 5: Style the calm “待调整” state**

Use a cool blue-gray surface, text label, and restrained border; reserve red for actual persistence errors. Keep buttons at least 44px and provide `aria-live="polite"` for successful reschedule feedback.

- [ ] **Step 6: Run detail, page, and accessibility tests**

Run: `pnpm test:run -- src/features/plans/components/TaskGroupDetailsDialog.test.tsx src/features/plans/components/TaskEditorDialog.test.tsx src/pages/PlansPage.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the details unit**

```bash
git add src/features/plans/components/TaskGroupDetailsDialog.tsx src/features/plans/components/TaskGroupDetailsDialog.test.tsx src/features/plans/components/TaskActionsDialog.tsx src/features/plans/components/TaskEditorDialog.test.tsx src/pages/PlansPage.tsx src/pages/PlansPage.test.tsx src/features/plans/components/PlanDialog.module.css src/features/plans/PlansPage.module.css
git commit -m "feat: confirm overdue task rescheduling"
```

### Task 8: Enforce group boundaries during drag moves

**Files:**
- Modify: `src/features/plans/data/plan-task-service.ts`
- Modify: `src/features/plans/data/plan-task-service.test.ts`
- Create: `src/features/plans/components/ExtendTaskGroupDialog.tsx`
- Create: `src/features/plans/components/ExtendTaskGroupDialog.test.tsx`
- Modify: `src/features/plans/components/TaskBar.tsx`
- Modify: `src/features/plans/components/TaskBar.test.tsx`
- Modify: `src/pages/PlansPage.tsx`
- Modify: `src/pages/PlansPage.test.tsx`

**Interfaces:**
- Extends:

```ts
export interface MovePlanTaskInput {
  scheduledDate: string
  startMinutes?: number
  order?: number
  expectedPosition?: {
    scheduledDate: string
    startMinutes: number | undefined
    order: number
  }
  extendGroupRange?: boolean
}

export class TaskGroupRangeExtensionRequiredError extends Error {
  constructor(
    readonly groupId: string,
    readonly targetDate: string,
    readonly proposedStartDate: string,
    readonly proposedEndDate: string,
  ) { super("移动日期超出跨日任务周期") }
}
```

- [ ] **Step 1: Write failing move-service tests**

Cover an in-range move, a duplicate same-group date, an out-of-range move without consent, an accepted extension that updates both group and step, and rollback when either table write fails.

```ts
await expect(movePlanTask(db, "step-2", { scheduledDate: "2026-09-09" }, 200))
  .rejects.toMatchObject({
    groupId: "group",
    targetDate: "2026-09-09",
    proposedEndDate: "2026-09-09",
  })
```

- [ ] **Step 2: Run service tests and verify they fail**

Run: `pnpm test:run -- src/features/plans/data/plan-task-service.test.ts`

Expected: FAIL because moves ignore group boundaries.

- [ ] **Step 3: Implement group-aware move transactions**

For ordinary tasks, preserve the existing transaction. For group steps, include `db.planTaskGroups`, reject another same-group task on the target date, throw `TaskGroupRangeExtensionRequiredError` outside the range unless `extendGroupRange === true`, and update the relevant range boundary plus task position atomically when confirmed.

- [ ] **Step 4: Write failing confirmation-dialog integration tests**

Simulate a long-press drag outside the group range. Assert the task is unchanged before clicking `同时延长任务周期`, then assert both the task date and group end date change. Also assert cancel restores focus and leaves both rows unchanged.

- [ ] **Step 5: Implement the confirmation handoff**

`TaskBar` catches only `TaskGroupRangeExtensionRequiredError` and calls a PlansPage callback with the error plus a retry that sets `extendGroupRange: true`. Other errors continue through `PlanErrorState`. `ExtendTaskGroupDialog` displays the exact old and proposed range.

- [ ] **Step 6: Run move and page tests**

Run: `pnpm test:run -- src/features/plans/data/plan-task-service.test.ts src/features/plans/components/ExtendTaskGroupDialog.test.tsx src/features/plans/components/TaskBar.test.tsx src/pages/PlansPage.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the drag-boundary unit**

```bash
git add src/features/plans/data/plan-task-service.ts src/features/plans/data/plan-task-service.test.ts src/features/plans/components/ExtendTaskGroupDialog.tsx src/features/plans/components/ExtendTaskGroupDialog.test.tsx src/features/plans/components/TaskBar.tsx src/features/plans/components/TaskBar.test.tsx src/pages/PlansPage.tsx src/pages/PlansPage.test.tsx
git commit -m "feat: confirm multi-day range extensions"
```

### Task 9: Make right-swipe completion discoverable once

**Files:**
- Create: `src/features/plans/components/SwipeHintProvider.tsx`
- Create: `src/features/plans/components/SwipeHintProvider.test.tsx`
- Modify: `src/features/plans/components/TaskBar.tsx`
- Modify: `src/features/plans/components/TaskBar.module.css`
- Modify: `src/features/plans/components/TaskBar.test.tsx`
- Modify: `src/pages/PlansPage.tsx`

**Interfaces:**
- Consumes: `VeloDB.appMeta` key `planSwipeHint:v1`.
- Produces:

```ts
interface SwipeHintContextValue {
  claim(taskId: string): boolean
  dismiss(): Promise<void>
}

export function SwipeHintProvider({ db, children }: { db: VeloDB; children: ReactNode }): JSX.Element
export function useSwipeHint(taskId: string): { showHint: boolean; dismissHint: () => void }
```

- [ ] **Step 1: Write failing one-time hint tests**

```tsx
function hintTask(id: string): PlanTask {
  return { id, title: id, scheduledDate: "2026-09-01", isCompleted: 0, order: 1, createdAt: 1, updatedAt: 1 }
}

const first = hintTask("first")
const second = hintTask("second")

function TaskList({ tasks }: { tasks: PlanTask[] }) {
  return <>{tasks.map((task) => <TaskBar db={db} key={task.id} task={task} />)}</>
}

it("allows only one visible task to claim the swipe hint", async () => {
  render(<SwipeHintProvider db={db}><TaskList tasks={[first, second]} /></SwipeHintProvider>)
  expect(screen.getAllByText("右滑完成")).toHaveLength(1)
})

it("does not animate after the hint marker is persisted", async () => {
  await db.appMeta.put({ key: "planSwipeHint:v1", value: "dismissed", updatedAt: 1 })
  render(<SwipeHintProvider db={db}><TaskBar db={db} task={first} /></SwipeHintProvider>)
  expect(screen.queryByText("右滑完成")).not.toBeInTheDocument()
})
```

Add reduced-motion and pointer-start dismissal tests.

- [ ] **Step 2: Run hint tests and verify they fail**

Run: `pnpm test:run -- src/features/plans/components/SwipeHintProvider.test.tsx src/features/plans/components/TaskBar.test.tsx`

Expected: FAIL because no hint coordinator exists.

- [ ] **Step 3: Implement the provider and persistence**

Load `planSwipeHint:v1` once, allow the first eligible incomplete task to claim it, and persist `{ value: "dismissed" }` after the hint finishes or the user begins a horizontal swipe. Keep the visible hint state in React so concurrent TaskBars cannot all claim it.

- [ ] **Step 4: Add the visual hint and arrow progression**

Apply a single short translate-and-return animation to the claimed task, render static text `右滑完成`, and keep the existing `FlowArrowIcon` visible as the drag exposes the purple completion fill. Use `--swipe-progress` to increase arrow opacity; do not add a looping animation.

Under `prefers-reduced-motion`, skip translation and show only the static hint until dismissal.

- [ ] **Step 5: Run task gesture, task bar, and hint tests**

Run: `pnpm test:run -- src/features/plans/domain/task-gesture.test.ts src/features/plans/components/SwipeHintProvider.test.tsx src/features/plans/components/TaskBar.test.tsx`

Expected: PASS, including the unchanged 70% threshold.

- [ ] **Step 6: Commit the discoverability unit**

```bash
git add src/features/plans/components/SwipeHintProvider.tsx src/features/plans/components/SwipeHintProvider.test.tsx src/features/plans/components/TaskBar.tsx src/features/plans/components/TaskBar.module.css src/features/plans/components/TaskBar.test.tsx src/pages/PlansPage.tsx
git commit -m "feat: guide first right-swipe completion"
```

### Task 10: Complete end-to-end, offline, responsive, and documentation acceptance

**Files:**
- Modify: `e2e/plans.spec.ts`
- Modify: `src/features/plans/PlansPage.responsive.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: all production behavior from Tasks 1–9.
- Produces: repeatable acceptance coverage and user-facing usage documentation.

- [ ] **Step 1: Add the failing multi-day happy-path E2E test**

```ts
test("creates and completes a multi-day task across day week and month views", async ({ page }) => {
  await page.goto("/plans?view=day&date=2026-09-01")
  await page.getByRole("button", { name: "新建任务" }).click()
  await page.getByRole("button", { name: "跨日任务" }).click()
  await page.getByLabel("任务名称").fill("完成高数第三章")
  await page.getByLabel("截止日期").fill("2026-09-07")
  await page.getByLabel("学习次数").fill("3")
  await page.getByRole("button", { name: "保存跨日任务" }).click()

  await expect(page.getByText("第 1/3 次")).toBeVisible()
  await page.getByRole("button", { name: "周计划" }).click()
  await expect(page.getByRole("button", { name: /完成高数第三章.*0\/3/ })).toBeVisible()
  await page.getByRole("button", { name: "月计划" }).click()
  await expect(page.getByTestId("month-task-group-segment").first()).toBeVisible()
})
```

- [ ] **Step 2: Add E2E cases for completion, overdue, extension, and reload**

Use real pointer events to verify the purple fill follows a right swipe, crossing 70% completes only one step, undo restores it, an overdue proposal writes only after confirmation, dragging outside the range opens the extension dialog, and offline reload preserves the group and progress.

- [ ] **Step 3: Add accessibility and responsive assertions**

At 390×844 and 834×1112, assert no document-level horizontal overflow, 44px targets, readable selected-day panels, and visible group continuation. Run axe on the editor, group details, reschedule proposal, and extension dialog. Emulate reduced motion and assert the swipe hint has no transform animation.

- [ ] **Step 4: Run the new E2E file and fix only feature-scoped failures**

Run: `pnpm test:e2e -- e2e/plans.spec.ts`

Expected: PASS.

- [ ] **Step 5: Update README usage and verification**

Add these points under “已实现” and “学习计划使用方式”:

```markdown
- 跨日学习任务：设置开始日期、截止日期与学习次数，本地生成均匀排期并允许调整
- 周/月连续任务带、分次右滑完成、整体数量进度与逾期确认重排
```

Document that parents do not double-count progress and that reordering stays local/offline.

- [ ] **Step 6: Run the complete verification suite**

Run: `pnpm verify`

Expected: typecheck, lint, all Vitest tests, and production build PASS.

Run: `pnpm test:e2e`

Expected: all Playwright tests PASS across existing and multi-day plan flows.

Run: `pnpm test:pwa-lifecycle`

Expected: PWA update lifecycle PASS.

- [ ] **Step 7: Inspect the production UI**

Run: `pnpm preview`

Inspect 390×844, 834×1112 landscape/portrait as applicable, 1024×768, and 1440×900. Verify right-swipe visibility, week band alignment, month cross-week continuation, scroll containment, focus order, text zoom, reduced motion, and the calm blue-gray overdue state.

- [ ] **Step 8: Run final repository checks**

Run: `git status --short`

Expected: only the E2E, responsive test, and README changes for this task are present.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 9: Commit acceptance and documentation**

```bash
git add e2e/plans.spec.ts src/features/plans/PlansPage.responsive.test.ts README.md
git commit -m "test: cover multi-day plan acceptance"
```
