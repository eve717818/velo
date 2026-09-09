# Notes Contextual Creation Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global notes creation action with two clear top-level entries and show creation only beside the selected knowledge-tree container.

**Architecture:** `NotesWorkspace` owns the active top-level area and creation state. `NoteTree` renders a synthetic root row plus folder and note rows; it receives one contextual creation callback and exposes the plus trigger only for the selected root or folder. Existing inline `TreeNodeEditor` creation remains the single data-writing path, so parent-path confirmation, mobile drawer closing, and persistence behavior stay intact.

**Tech Stack:** React 19, TypeScript, React Router, Dexie, CSS Modules, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-velow-notes-workspace-design.md`

## Global Constraints

- The top bar contains only `知识树` and `每日灵感`; no global plus is rendered.
- Only the selected root or live folder may show a plus; note and Daily Inspiration states never show one.
- Creating a node must show the full parent path and reuse the current inline editor.
- On a phone, selecting or creating a node closes the left drawer and opens the matching right-side content.
- Touch targets remain at least 44 CSS pixels where space permits, with WCAG 2.2 AA semantics and keyboard access.

---

### Task 1: Lock the navigation and contextual-creation contract

**Files:**
- Modify: `src/features/notes/NotesWorkspace.test.tsx`
- Modify: `src/features/notes/NoteTree.test.tsx`

**Interfaces:**
- Consumes: existing `NotesWorkspace`, `NoteTree`, `createFolder`, and `createNote` behavior.
- Produces: regression coverage for top-level entry state, root creation, folder creation, note exclusion, and phone drawer behavior.

- [ ] **Step 1: Write failing workspace tests**

```tsx
expect(screen.getByRole("button", { name: "知识树" })).toHaveAttribute("aria-pressed", "true")
expect(screen.getByRole("button", { name: "每日灵感" })).toHaveAttribute("aria-pressed", "false")
expect(screen.queryByRole("button", { name: "新建" })).not.toBeInTheDocument()
```

- [ ] **Step 2: Write failing tree tests**

```tsx
expect(screen.getByRole("button", { name: "在笔记库中新建" })).toBeInTheDocument()
expect(screen.queryByRole("button", { name: "在示例笔记中新建" })).not.toBeInTheDocument()
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `pnpm vitest run src/features/notes/NotesWorkspace.test.tsx src/features/notes/NoteTree.test.tsx`

Expected: FAIL because the top bar still contains the global `新建` action and `NoteTree` has no selected-container plus.

- [ ] **Step 4: Commit the failing contract tests with the implementation task**

The red tests remain uncommitted until Task 2 makes them green, keeping the branch buildable at each commit.

### Task 2: Implement root-aware contextual creation

**Files:**
- Modify: `src/features/notes/NotesWorkspace.tsx`
- Modify: `src/features/notes/NoteTree.tsx`
- Modify: `src/features/notes/NewKnowledgeNodeMenu.tsx`
- Modify: `src/features/notes/NotesWorkspace.module.css`
- Test: `src/features/notes/NotesWorkspace.test.tsx`
- Test: `src/features/notes/NoteTree.test.tsx`

**Interfaces:**
- Consumes: `startCreation(selection, returnFocusTo)` and `TreeEditState` from the existing workspace.
- Produces: `NoteTree.onCreate(selection, returnFocusTo)`, selected-root state, and an icon-only `NewKnowledgeNodeMenu` trigger with a contextual accessible name.

- [ ] **Step 1: Add an explicit root row and creation callback to `NoteTree`**

```ts
onCreate?: (
  selection: { type: "folder" | "note"; parentId: string | null },
  returnFocusTo: HTMLButtonElement | null,
) => void | Promise<boolean>
```

The root row is selected when `selectedId === null` in the live knowledge-tree area. Its title button selects the root, and its plus opens creation at `parentId: null`.

- [ ] **Step 2: Add the selected-folder plus**

Render `NewKnowledgeNodeMenu` after a selected folder row. Do not render it for notes, deleted rows, unselected folders, or Daily Inspiration.

- [ ] **Step 3: Replace the global header action with two top-level entry buttons**

```tsx
<button aria-pressed={area !== "daily"}>知识树</button>
<button aria-pressed={area === "daily"}>每日灵感</button>
```

On narrow layouts, `知识树` opens the left drawer. On wide layouts it selects the knowledge-tree area and restores the sidebar if it was collapsed. `每日灵感` flushes the current editor before navigation.

- [ ] **Step 4: Preserve full-path inline creation**

Route root and folder plus selections through `startCreation`. Keep `nodePath` as the source of `parentPath`, expand the chosen folder, focus the inline editor, and close the phone drawer only after commit.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `pnpm vitest run src/features/notes/NotesWorkspace.test.tsx src/features/notes/NoteTree.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```text
feat: refine knowledge tree creation navigation
```

### Task 3: Verify responsive behavior and document the result

**Files:**
- Modify: `e2e/notes.spec.ts`
- Modify: `docs/qa/2026-09-07-notes-daily-inspiration.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the rendered `/notes` route and current local-first database fixtures.
- Produces: browser-level evidence for the 402px phone flow and the desktop/tablet navigation state.

- [ ] **Step 1: Add a failing browser assertion for the revised top bar**

```ts
await expect(page.getByRole("button", { name: "知识树" })).toHaveAttribute("aria-pressed", "true")
await expect(page.getByRole("button", { name: "每日灵感" })).toHaveAttribute("aria-pressed", "false")
await expect(page.getByRole("button", { name: "新建" })).toHaveCount(0)
```

- [ ] **Step 2: Add the phone root-to-note journey**

At 402px, open `知识树`, select the root, use its contextual plus, create a folder, confirm the drawer closes, reopen the tree, select the folder plus, create a note, and confirm the note opens on the right.

- [ ] **Step 3: Run the Notes browser suite**

Run: `pnpm playwright test e2e/notes.spec.ts`

Expected: PASS with the phone and wide-layout cases.

- [ ] **Step 4: Run project verification**

Run: `pnpm verify`

Expected: typecheck, unit/component tests, lint, and production build all PASS.

- [ ] **Step 5: Record rendered evidence**

Update the QA note with the tested routes, widths, keyboard flow, touch targets, and any limitation that remains. Update the README usage copy from `目录` to `知识树` and describe contextual creation.

- [ ] **Step 6: Commit**

```text
test: verify contextual knowledge tree creation
```

