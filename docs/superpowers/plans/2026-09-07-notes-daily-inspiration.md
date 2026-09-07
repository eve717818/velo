# Notes Daily Inspiration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved fixed “每日灵感” workspace with a compact perpetual calendar and a blank, auto-growing paper card, while making the empty knowledge tree understandable on phones.

**Architecture:** Add a v8 `dailyInspirations` Dexie table keyed by the user's local calendar date and a revision-checked service that never creates empty dates. Build the calendar and paper editor as focused components, then integrate them as a fixed notes-area route without coupling them to user folders or note documents. This is the first remaining sub-project from the approved notes redesign; WYSIWYG notes, search and PDF export remain separate plans so each can be reviewed independently.

**Tech Stack:** Existing React 19, TypeScript, Dexie, CSS modules, Vitest/Testing Library and Playwright; no new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-09-05-velow-notes-workspace-design.md`

## Global Constraints

- “每日灵感” is a fixed system entry and never a `KnowledgeNode` or a folder child.
- Use `YYYY-MM-DD` from the user's local calendar fields; never derive the storage key with `toISOString()`.
- Empty dates do not create rows. Clearing an existing card removes the row after a revision-safe save so its calendar dot disappears.
- The card has no title, date, placeholder, save label, action row or paperclip. Only failures appear outside the card.
- The card uses a restrained light-beige paper surface, fine low-contrast texture, soft shadow and minimum height; it grows with content and has no internal scrollbar.
- The compact calendar supports arbitrary year/month selection, previous/next month, “今天”, content dots, selected/today states and horizontal phone swipe.
- At widths below 768px, the existing left drawer remains the approved directory pattern; choosing “每日灵感” closes it and moves focus to the writing card.
- Every create/rename row shows the full parent path. On phones, successful folder/note creation and any folder/note selection close the drawer; the right pane then shows the selected folder path/actions or the selected note path/body.
- Touch targets remain at least 44px; keyboard, screen-reader names, reduced motion and 390/402/768/834/1024/1366 layouts are verified.
- Do not add search, PDF, the final WYSIWYG note editor, formulas, recording, AI or synchronization in this sub-project.

---

### Task 1: Daily inspiration persistence and local-date service

**Files:**
- Modify: `src/db/types.ts`
- Modify: `src/db/velo-db.ts`
- Modify: `src/db/velo-db.test.ts`
- Create: `src/features/notes/daily-inspiration-service.ts`
- Create: `src/features/notes/daily-inspiration-service.test.ts`

**Interfaces:**
- Produce `DailyInspiration { dateKey, content, plainText, revision, createdAt, updatedAt }`.
- Produce `localDateKey(date: Date): string`, `parseLocalDateKey(dateKey: string): { year; month; day }`, `loadDailyInspiration(db, dateKey)`, `listDailyInspirationDates(db, startKey, endKey)`, and `saveDailyInspiration(db, dateKey, { content, plainText }, expectedRevision, now)`.
- `saveDailyInspiration` returns `DailyInspiration | null`; `null` means an empty existing card was deleted or an untouched empty date remained absent.

- [ ] **Step 1: Write failing data and service tests**

```ts
it("uses local calendar fields instead of UTC conversion", () => {
  const localLateNight = new Date(2026, 8, 7, 23, 45)
  expect(localDateKey(localLateNight)).toBe("2026-09-07")
})

it("does not create an empty day and deletes a cleared existing day", async () => {
  expect(await saveDailyInspiration(db, "2026-09-07", emptyBody, 0, 1)).toBeNull()
  expect(await db.dailyInspirations.count()).toBe(0)
  const saved = await saveDailyInspiration(db, "2026-09-07", body("一条灵感"), 0, 2)
  expect(saved?.revision).toBe(1)
  expect(await saveDailyInspiration(db, "2026-09-07", emptyBody, 1, 3)).toBeNull()
  expect(await db.dailyInspirations.count()).toBe(0)
})
```

Also cover invalid real dates, leap day, month-range listing, structured-content/plain-text consistency, first revision, stale revision rejection, and v7-to-v8 preservation of all existing tables.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm exec vitest run src/features/notes/daily-inspiration-service.test.ts src/db/velo-db.test.ts`

Expected: FAIL because `dailyInspirations` and the service do not exist.

- [ ] **Step 3: Add v8 and the transaction service**

Append v8 without changing v1-v7. Re-declare every existing store unchanged and add:

```ts
dailyInspirations: "&dateKey, updatedAt"
```

Build structured plain-text content as:

```ts
{ type: "doc", version: 1, blocks: plainText.split("\n").map((text) => ({ type: "paragraph", text })) }
```

Validate `YYYY-MM-DD` by reconstructing a local noon `Date` and comparing year/month/day. Save/delete inside one Dexie transaction and reject a mismatched `expectedRevision` with a user-readable Chinese conflict message.

- [ ] **Step 4: Run focused verification**

Run: `pnpm exec vitest run src/features/notes/daily-inspiration-service.test.ts src/db/velo-db.test.ts src/features/notes/note-service.test.ts`

Run: `pnpm typecheck`

Run: `pnpm lint`

- [ ] **Step 5: Commit the independently usable service**

```powershell
git add -- src/db/types.ts src/db/velo-db.ts src/db/velo-db.test.ts src/features/notes/daily-inspiration-service.ts src/features/notes/daily-inspiration-service.test.ts
git commit -m "feat: 建立每日灵感本地数据服务"
```

---

### Task 2: Compact perpetual calendar and paper writing card

**Files:**
- Create: `src/features/notes/DailyInspirationCalendar.tsx`
- Create: `src/features/notes/DailyInspirationCalendar.test.tsx`
- Create: `src/features/notes/DailyInspirationEditor.tsx`
- Create: `src/features/notes/DailyInspirationEditor.test.tsx`
- Create: `src/features/notes/daily-inspiration-state.ts`
- Modify: `src/features/notes/NotesWorkspace.module.css`

**Interfaces:**
- `DailyInspirationCalendar` consumes `selectedDateKey`, `visibleMonth`, `contentDateKeys`, `onSelectDate`, and `onVisibleMonthChange`.
- `DailyInspirationEditor` consumes `db`, `dateKey`, `saveDailyInspiration`, and exposes `focus()` / `flush()` through a ref.
- `calendarGrid(year, monthIndex)` always returns 42 local-date cells; adjacent-month cells are selectable but visually quiet.

- [ ] **Step 1: Write calendar RED tests**

```tsx
it("navigates any month and marks content without UTC conversion", async () => {
  render(<DailyInspirationCalendar selectedDateKey="2028-02-29" visibleMonth={{year: 2028, monthIndex: 1}} contentDateKeys={new Set(["2028-02-29"])} {...handlers} />)
  expect(screen.getByRole("button", { name: "2028年2月29日，有灵感" })).toHaveAttribute("aria-pressed", "true")
  await user.click(screen.getByRole("button", { name: "下个月" }))
  expect(handlers.onVisibleMonthChange).toHaveBeenCalledWith({ year: 2028, monthIndex: 2 })
})
```

Cover previous/next across years, direct year and month controls, today, 42 cells, selected/today/content states, arrow-key date navigation, and a horizontal pointer swipe above the movement threshold while ignoring vertical gestures.

- [ ] **Step 2: Write editor RED tests**

Verify a blank card has no placeholder/title/status/action text, clicking focuses a normal-size textarea, composition input does not save early, 320ms debounce saves, failed saves keep text and show one external alert/retry action, date changes flush first, clearing deletes the row, and textarea height grows without an internal scrollbar.

- [ ] **Step 3: Implement the pure calendar helpers and controlled calendar**

Use local noon dates for arithmetic, ISO-like keys only after reading local fields, a numeric year field, a 12-month select, previous/next arrow buttons and a “今天” button. Calendar day buttons have precise accessible names; the visual dot is `aria-hidden`.

- [ ] **Step 4: Implement the revision-safe auto-growing paper editor**

Use an empty `<textarea aria-label="灵感正文">` with no placeholder. On input, set its height to `auto` and then `scrollHeight`; keep `overflow: hidden`. Mirror the note editor's session/revision/in-flight protection, but show no normal save state. Store a recoverable local draft keyed by date and show controls only after failure or conflict.

- [ ] **Step 5: Implement the approved paper visual**

Define a light-beige base near `#fff8e7`, a subtle 1px warm border, two low-opacity repeating gradients for fine fibre noise, and a soft low-spread shadow. Keep body text contrast at least 4.5:1, caret width/browser default, `font-size: 1rem`, `line-height: 1.75`, and a responsive minimum height that leaves the calendar near one-third of the phone's first screen.

- [ ] **Step 6: Run component verification and commit**

Run: `pnpm exec vitest run src/features/notes/DailyInspirationCalendar.test.tsx src/features/notes/DailyInspirationEditor.test.tsx src/features/notes/daily-inspiration-service.test.ts`

Run: `pnpm typecheck && pnpm lint`

```powershell
git add -- src/features/notes/DailyInspirationCalendar.tsx src/features/notes/DailyInspirationCalendar.test.tsx src/features/notes/DailyInspirationEditor.tsx src/features/notes/DailyInspirationEditor.test.tsx src/features/notes/daily-inspiration-state.ts src/features/notes/NotesWorkspace.module.css
git commit -m "feat: 构建每日灵感日历与书写卡片"
```

---

### Task 3: Notes workspace navigation and mobile directory clarity

**Files:**
- Modify: `src/features/notes/NotesWorkspace.tsx`
- Modify: `src/features/notes/NotesWorkspace.test.tsx`
- Modify: `src/features/notes/NoteTree.tsx`
- Modify: `src/features/notes/NotesWorkspace.module.css`

**Interfaces:**
- Extend the workspace area to `"all" | "daily" | "trash"`; persist Daily Inspiration in the URL as `area=daily&date=YYYY-MM-DD`.
- A Daily Inspiration area never sets `?note=` or `selectedFolderId`.
- The existing mobile “目录” drawer remains the home for the tree and fixed entries.

- [ ] **Step 1: Write workspace RED tests**

Cover fixed entry order (“全部笔记”, “每日灵感”, knowledge tree, “回收站”), choosing daily closes the phone drawer, the selected day survives reload/history navigation, a pending daily save blocks leaving, a pending note save blocks entering, and the daily editor receives focus after drawer close. Also assert that each inline create/rename row announces and displays its full parent path; successful phone folder creation closes the drawer and shows the folder path/actions on the right, while successful phone note creation closes the drawer and opens the matching path/body.

Add an empty-tree assertion: inside the directory, render “目录还是空的” plus a 44px “新建文件夹” action instead of a visually blank tree region. Once nodes exist, remove that empty prompt and render the actual connector tree unchanged.

- [ ] **Step 2: Implement the fixed entry and route state**

Load month content dates with `useLiveQuery`, render calendar + editor only for `area=daily`, and flush the active note/daily editor before every area or node transition. When entering daily without a valid date, use `localDateKey(new Date())` and replace the URL rather than creating a database row.

- [ ] **Step 3: Keep mobile and desktop behavior distinct but equivalent**

On phone, “目录” opens the left drawer; “每日灵感” closes it before focusing the card. Selecting or successfully creating any folder/note also closes the drawer and renders that node's full breadcrumb path and folder actions or note body in the right pane. On desktop/tablet landscape, the sidebar stays visible. The empty-tree action starts inline folder creation in the visible tree instance. Do not seed demonstration folders or copy IndexedDB data between preview ports.

- [ ] **Step 4: Run workspace verification and commit**

Run: `pnpm exec vitest run src/features/notes/NotesWorkspace.test.tsx src/features/notes/DailyInspirationCalendar.test.tsx src/features/notes/DailyInspirationEditor.test.tsx`

Run: `pnpm verify`

Run: `git diff --check`

```powershell
git add -- src/features/notes/NotesWorkspace.tsx src/features/notes/NotesWorkspace.test.tsx src/features/notes/NoteTree.tsx src/features/notes/NotesWorkspace.module.css
git commit -m "feat: 接入每日灵感笔记工作区"
```

---

### Task 4: Browser acceptance, documentation and fresh preview

**Files:**
- Modify: `e2e/notes.spec.ts`
- Create: `docs/qa/2026-09-07-notes-daily-inspiration.md`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-07-notes-daily-inspiration.md`

**Interfaces:**
- Exercises the production route `/notes?area=daily&date=2026-09-07` without writing to the user's browser profile.
- Records actual results only; physical Android use remains user-observed evidence.

- [ ] **Step 1: Add a browser journey before product fixes**

Create a daily entry at 23:30 local time, type through IME-safe input, wait for autosave, reload and verify content/date. Navigate previous/next/direct month, confirm content dot, swipe one month on 390px, clear content and confirm the dot disappears. Assert no card title, placeholder, save text, action row, paperclip or internal scrollbar.

- [ ] **Step 2: Verify responsive layout and accessibility**

At 390/402/768/834/1024/1366, assert no global horizontal overflow, calendar is compact, card occupies the larger share of the first screen and grows with long content, fixed entry ordering is stable, all interactive controls are at least 44px, reduced motion is respected, and axe reports no serious/critical violations in the daily area.

- [ ] **Step 3: Run full verification**

Run: `pnpm verify`

Run: `pnpm exec playwright test e2e/notes.spec.ts`

Run: `git diff --check`

- [ ] **Step 4: Document observed evidence and current phase boundary**

Record v8 migration evidence, local-date cases, tested viewports, failure recovery, screenshots, and the current LAN URL. State that the knowledge tree and Daily Inspiration are implemented, while final WYSIWYG notes, search and PDF remain the next approved sub-projects.

- [ ] **Step 5: Commit and publish a cache-isolated preview**

```powershell
git add -- e2e/notes.spec.ts docs/qa/2026-09-07-notes-daily-inspiration.md README.md docs/superpowers/plans/2026-09-07-notes-daily-inspiration.md
git commit -m "docs: 记录每日灵感验收结果"
```

Build and serve on a fresh LAN port so an older PWA service worker cannot mask the new UI. Verify HTTP 200 before sending the link.

---

## Plan self-review

- Spec coverage in this sub-project: fixed Daily Inspiration entry, arbitrary-month compact calendar, local-date storage, content dots, today/selected states, phone swipe, blank beige paper card, natural growth, autosave failure handling, phone drawer behavior and responsive/accessibility matrix.
- Deliberately separate approved follow-up plans: direct WYSIWYG note editor, search, PDF export and permanent-delete recycle-bin controls. This separation prevents an editor-engine decision or PDF font work from delaying the Daily Inspiration preview.
- Interface consistency: Task 1 produces the row/service consumed by Task 2; Task 2 produces controlled components consumed by Task 3; Task 4 validates only the integrated route from Tasks 1-3.
- Placeholder scan: no TBD/TODO or unspecified implementation step remains.
