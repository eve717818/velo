# Notes Knowledge Tree Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first-phase “every node is a note” hierarchy with a stable folder/note knowledge tree that supports infinite nesting, compact connectors, persistent folding, safe moves and lossless migration of existing notes.

**Architecture:** Add a version 7 Dexie migration that separates folder nodes from note documents while preserving existing IDs and content. A focused knowledge-tree service owns hierarchy invariants and mutations; React tree components consume that service and keep expansion state in `AppMeta`. The current Markdown editor remains a temporary note-only content surface until the separately planned WYSIWYG editor phase.

**Tech Stack:** React 19, TypeScript 5.9, Dexie 4, CSS Modules, Lucide React, Vitest, Testing Library and Playwright. No new runtime dependency is required.

**Spec:** `docs/superpowers/specs/2026-09-05-velow-notes-workspace-design.md`

## Global Constraints

- Folders contain folders and notes but never own `NoteDocument`; notes own exactly one document and never have children.
- Professional, subject, chapter and section are examples only; nesting depth is unlimited and titles may repeat because all relationships use stable IDs.
- Existing note IDs, document IDs, Markdown, JSON compatibility content, timestamps and relative subtree order must survive migration.
- A legacy node with children and non-empty body becomes a folder with a child note titled “概览”; a legacy node with children and empty body becomes a folder; a leaf remains a note.
- Remove the inbox flag and navigation without deleting former inbox content; former inbox roots become ordinary root notes.
- Moving a node into itself, a descendant, a note, a missing node or a deleted folder must fail with a user-readable Chinese error.
- Deleting a folder soft-deletes the full live subtree as one group; restoring uses the original parent when it still exists and otherwise restores the root to the knowledge-library root.
- Tree rows show a disclosure control, folder/note icon and single-line title. Sibling branches use compact vertical connectors with 12px visual indentation, while interactive targets remain at least 44px.
- Desktop and tablet landscape keep the directory visible; phone and narrow tablet use the existing left drawer and close it after opening a note.
- Search, Daily Inspiration, PDF export, WYSIWYG replacement, formulas, classroom recording, AI and cloud sync are outside this plan.
- Do not edit released migrations 1–6. Do not push or merge. Keep the existing preview port available.

---

### Task 1: Version 7 folder/note migration and invariant validation

**Files:**
- Modify: `src/db/types.ts`
- Modify: `src/db/velo-db.ts`
- Modify: `src/db/velo-db.test.ts`
- Create: `src/features/notes/knowledge-tree-model.ts`
- Test: `src/features/notes/knowledge-tree-model.test.ts`

**Interfaces:**
- Produces: `KnowledgeNodeType = "folder" | "note"`.
- Produces: `LegacyKnowledgeNode = KnowledgeNode & { inbox?: boolean }` for migration input only.
- Produces: `isDocumentEmpty(document: NoteDocument | undefined): boolean`.
- Produces: `validateKnowledgeTree(nodes: KnowledgeNode[], documents: NoteDocument[]): void`.
- Produces: `migrateLegacyKnowledgeTree(nodes: LegacyKnowledgeNode[], documents: NoteDocument[]): { nodes: KnowledgeNode[]; documents: NoteDocument[] }`.
- The migration helpers are pure; `VeloDB` version 7 reads rows, calls the helper, then replaces the two table contents inside the Dexie upgrade transaction.

- [ ] **Step 1: Write pure migration tests that describe every conversion rule**

Create `src/features/notes/knowledge-tree-model.test.ts` with focused fixtures and assertions:

```ts
import { describe, expect, it } from "vitest"
import type { KnowledgeNode, LegacyKnowledgeNode, NoteDocument } from "@/db/types"
import { migrateLegacyKnowledgeTree, validateKnowledgeTree } from "./knowledge-tree-model"

const node = (id: string, parentId: string | null, title: string, order: number): LegacyKnowledgeNode => ({
  id, parentId, type: "note", title, order, inbox: id === "inbox", createdAt: order + 1, updatedAt: order + 1,
})
const document = (id: string, nodeId: string, markdown: string): NoteDocument => ({
  id, nodeId, title: nodeId, content: { type: "doc" }, plainText: markdown, markdown,
  revision: 0, createdAt: 1, updatedAt: 1,
})

describe("migrateLegacyKnowledgeTree", () => {
  it("keeps a leaf as a note and removes its inbox marker", () => {
    const result = migrateLegacyKnowledgeTree([node("inbox", null, "速记", 0)], [document("doc", "inbox", "正文")])
    expect(result.nodes).toEqual([expect.objectContaining({ id: "inbox", parentId: null, type: "note" })])
    expect(result.nodes[0]).not.toHaveProperty("inbox")
    expect(result.documents[0]).toMatchObject({ id: "doc", nodeId: "inbox", markdown: "正文" })
  })

  it("turns an empty parent into a folder and removes its empty document", () => {
    const result = migrateLegacyKnowledgeTree(
      [node("parent", null, "数学", 0), node("child", "parent", "导数", 0)],
      [document("parent-doc", "parent", ""), document("child-doc", "child", "定义")],
    )
    expect(result.nodes.find((item) => item.id === "parent")).toMatchObject({ type: "folder" })
    expect(result.documents.find((item) => item.id === "parent-doc")).toBeUndefined()
  })

  it("moves a non-empty parent document to a deterministic overview note", () => {
    const result = migrateLegacyKnowledgeTree(
      [node("parent", null, "物理", 0), node("child", "parent", "力学", 0)],
      [document("parent-doc", "parent", "课程概览"), document("child-doc", "child", "牛顿定律")],
    )
    const overview = result.nodes.find((item) => item.parentId === "parent" && item.title === "概览")
    expect(overview).toMatchObject({ type: "note", order: 0 })
    expect(result.documents.find((item) => item.id === "parent-doc")).toMatchObject({ nodeId: overview?.id, markdown: "课程概览" })
    expect(result.nodes.find((item) => item.id === "child")?.order).toBe(1)
  })

  it("rejects folders with documents, notes with children, or cyclic parents", () => {
    expect(() => validateKnowledgeTree(
      [{ ...node("folder", null, "目录", 0), type: "folder" }],
      [document("bad", "folder", "不应存在")],
    )).toThrow("文件夹不能包含正文")
  })
})
```

- [ ] **Step 2: Run the pure tests and verify RED**

Run: `pnpm exec vitest run src/features/notes/knowledge-tree-model.test.ts`

Expected: FAIL because `knowledge-tree-model.ts`, `migrateLegacyKnowledgeTree` and `validateKnowledgeTree` do not exist.

- [ ] **Step 3: Implement the pure migration and validator**

Create `src/features/notes/knowledge-tree-model.ts`. Use cloned objects, a child-count map and a document-by-node map. A non-empty body is any non-whitespace `markdown` or `plainText`, any structured text node with non-whitespace text, or an unknown structured payload containing a meaningful scalar value; `{}`, `{ type: "doc" }` and `{ type: "doc", content: [] }` are empty. Generate overview IDs from `<folder-id>--overview`, adding `-2`, `-3` only when the candidate already exists. Shift existing child orders by one so “概览” is first. Strip `inbox` by destructuring instead of assigning `undefined`.

If a legacy leaf has no document, create one empty document with deterministic ID `<node-id>--document`, adding a numeric suffix only on collision. If a node has multiple documents, a document references a missing node, or a parent reference is missing, abort the migration; never choose or discard ambiguous content silently.

The validator must throw these exact messages at the first invalid row:

```ts
if (folderDocument) throw new Error("文件夹不能包含正文")
if (noteChildren.length) throw new Error("笔记不能包含子节点")
if (noteDocumentCount !== 1) throw new Error("笔记正文关联异常")
if (parent?.type !== "folder") throw new Error("父节点必须是文件夹")
if (visited.has(cursor.id)) throw new Error("目录结构存在循环")
```

Call `validateKnowledgeTree()` on the migrated result before returning it.

- [ ] **Step 4: Run the pure tests and verify GREEN**

Run: `pnpm exec vitest run src/features/notes/knowledge-tree-model.test.ts`

Expected: PASS for leaf, empty parent, overview creation and corrupt-tree rejection.

- [ ] **Step 5: Add a real v6-to-v7 Dexie migration test**

Extend `src/db/velo-db.test.ts` with a `createVersionSixNotesDatabase()` helper using the exact v6 stores, seed one leaf, one empty parent with a child, and one non-empty parent with a child, then assert after `new VeloDB(name).open()`:

```ts
expect(await db.knowledgeNodes.get("empty-parent")).toMatchObject({ type: "folder" })
expect(await db.notes.where("nodeId").equals("empty-parent").count()).toBe(0)
const overview = await db.knowledgeNodes.where("parentId").equals("written-parent").filter((item) => item.title === "概览").first()
expect(overview).toMatchObject({ type: "note", order: 0 })
expect(await db.notes.get("written-parent-document")).toMatchObject({ nodeId: overview?.id, markdown: "原父节点正文" })
expect(await db.knowledgeNodes.get("legacy-inbox")).not.toHaveProperty("inbox")
```

Also open the database with raw Dexie after a deliberately invalid orphan migration and assert the v6 rows remain unchanged, proving transaction rollback.

- [ ] **Step 6: Run the database test and verify RED**

Run: `pnpm exec vitest run src/db/velo-db.test.ts`

Expected: FAIL because the database stops at version 6 and does not perform the folder/note conversion.

- [ ] **Step 7: Add schema version 7 without modifying versions 1–6**

In `src/db/velo-db.ts`, append:

```ts
this.version(7)
  .stores({
    planTasks: "id, [scope+periodKey], scope, periodKey, [scope+periodKey+isCompleted], isCompleted, updatedAt",
    planTaskGroups: "id, startDate, endDate, updatedAt",
    rangePlans: "&id, kind, rangeStart, rangeEnd, updatedAt",
    learningPeriods: "id, kind, startDate, endDate, updatedAt",
    legacyPlanTasks: "id, scope, periodKey, updatedAt",
    knowledgeNodes: "id, parentId, type, order, deletedAt, trashRootId, updatedAt",
    notes: "id, nodeId, title, updatedAt",
    appMeta: "key, updatedAt",
  })
  .upgrade(async (transaction) => {
    const nodeTable = transaction.table<LegacyKnowledgeNode, string>("knowledgeNodes")
    const documentTable = transaction.table<NoteDocument, string>("notes")
    const migrated = migrateLegacyKnowledgeTree(await nodeTable.toArray(), await documentTable.toArray())
    await nodeTable.clear()
    await documentTable.clear()
    await nodeTable.bulkAdd(migrated.nodes)
    await documentTable.bulkAdd(migrated.documents)
  })
```

Import the pure migration helper and `LegacyKnowledgeNode`. In `src/db/types.ts`, keep `inbox?: boolean` only on the exported `LegacyKnowledgeNode` compatibility type and remove it from the current `KnowledgeNode` interface so new code cannot recreate inbox state.

- [ ] **Step 8: Run migration, type and formatting verification**

Run: `pnpm exec vitest run src/features/notes/knowledge-tree-model.test.ts src/db/velo-db.test.ts`

Run: `pnpm typecheck`

Run: `git diff --check`

Expected: all commands PASS; no released migration block changes.

- [ ] **Step 9: Commit the migration unit**

```powershell
git add -- src/db/types.ts src/db/velo-db.ts src/db/velo-db.test.ts src/features/notes/knowledge-tree-model.ts src/features/notes/knowledge-tree-model.test.ts
git commit -m "feat: 迁移文件夹与笔记数据模型"
```

---

### Task 2: Knowledge-tree mutation service

**Files:**
- Modify: `src/features/notes/note-service.ts`
- Modify: `src/features/notes/note-service.test.ts`
- Modify: `src/features/home/home-query.ts`
- Test: `src/features/home/home-query.test.ts`

**Interfaces:**
- Produces: `createFolder(db, { title, parentId }, now): Promise<KnowledgeNode>`.
- Produces: `createNote(db, { title, parentId }, now): Promise<KnowledgeNode>`.
- Produces: `renameNode(db, nodeId, title, now): Promise<KnowledgeNode>`.
- Produces: `moveNode(db, nodeId, parentId, now): Promise<void>`.
- Produces: `trashNode(db, nodeId, now): Promise<void>`.
- Produces: `restoreNode(db, nodeId, now): Promise<void>`.
- Retains: `loadNote`, `saveNote` and temporary `exportMarkdown`, but each now rejects folder IDs.
- Consumes: Task 1 folder/note invariants and v7 schema.

- [ ] **Step 1: Replace old inbox-oriented tests with node-type contracts**

Update `src/features/notes/note-service.test.ts` to start with these behaviors:

```ts
test("creates folders without documents and notes with one document", async () => {
  const folder = await createFolder(db, { title: "数学", parentId: null }, 1)
  const note = await createNote(db, { title: "导数", parentId: folder.id }, 2)
  expect(folder).toMatchObject({ type: "folder", parentId: null })
  expect(await db.notes.where("nodeId").equals(folder.id).count()).toBe(0)
  expect(note).toMatchObject({ type: "note", parentId: folder.id })
  expect(await db.notes.where("nodeId").equals(note.id).count()).toBe(1)
})

test("rejects children or moves under a note", async () => {
  const note = await createNote(db, { title: "孤立笔记", parentId: null }, 1)
  await expect(createFolder(db, { title: "错误目录", parentId: note.id }, 2)).rejects.toThrow("父节点必须是文件夹")
  const other = await createNote(db, { title: "另一篇", parentId: null }, 3)
  await expect(moveNode(db, other.id, note.id, 4)).rejects.toThrow("父节点必须是文件夹")
})

test("restores a subtree to root when its former folder is gone", async () => {
  const outer = await createFolder(db, { title: "外层", parentId: null }, 1)
  const inner = await createFolder(db, { title: "内层", parentId: outer.id }, 2)
  const note = await createNote(db, { title: "正文", parentId: inner.id }, 3)
  await trashNode(db, inner.id, 4)
  await db.knowledgeNodes.delete(outer.id)
  await restoreNode(db, note.id, 5)
  expect(await db.knowledgeNodes.get(inner.id)).toMatchObject({ parentId: null, deletedAt: undefined })
  expect(await db.knowledgeNodes.get(note.id)).toMatchObject({ parentId: inner.id, deletedAt: undefined })
})
```

Keep tests for stable IDs, revisions, IME-independent saves, ordered export and exact trash-group restoration; update their setup to use folders as parents.

- [ ] **Step 2: Run the service tests and verify RED**

Run: `pnpm exec vitest run src/features/notes/note-service.test.ts`

Expected: FAIL because `createFolder`, `moveNode`, `renameNode`, `trashNode` and `restoreNode` are missing and `createNote` still accepts inbox state.

- [ ] **Step 3: Implement a node-type-aware transaction service**

In `note-service.ts`:

```ts
type CreateNodeInput = { title: string; parentId: string | null }

async function requireLiveFolder(db: VeloDB, parentId: string | null) {
  if (parentId === null) return null
  const parent = await db.knowledgeNodes.get(parentId)
  if (!parent || parent.deletedAt !== undefined) throw new Error("目标文件夹不存在或已删除")
  if (parent.type !== "folder") throw new Error("父节点必须是文件夹")
  return parent
}
```

Use one internal `createNode(db, type, input, now)` transaction. Create a document only when `type === "note"`. `loadNote`, `saveNote` and `exportMarkdown` call `requireLiveNote()` and throw `"请选择一篇笔记"` for folders. `moveNode()` validates the target folder before cycle traversal. `renameNode()` updates the matching document title only for notes. `restoreNode()` restores the trash root, not just the clicked descendant; if the former parent is missing, deleted or not a folder, assign `parentId: null` and a new root order.

- [ ] **Step 4: Verify service and home-query behavior**

Run: `pnpm exec vitest run src/features/notes/note-service.test.ts src/features/home/home-query.test.ts`

Expected: PASS; recent-notes queries include only live note nodes with documents and never folders or deleted nodes.

- [ ] **Step 5: Run typecheck and lint, then commit**

Run: `pnpm typecheck`

Run: `pnpm lint`

Run: `git diff --check`

```powershell
git add -- src/features/notes/note-service.ts src/features/notes/note-service.test.ts src/features/home/home-query.ts src/features/home/home-query.test.ts
git commit -m "feat: 建立知识目录事务服务"
```

---

### Task 3: Persistent collapsible tree with compact connectors

**Files:**
- Modify: `src/features/notes/NoteTree.tsx`
- Create: `src/features/notes/tree-expansion.ts`
- Test: `src/features/notes/tree-expansion.test.ts`
- Modify: `src/features/notes/NotesWorkspace.module.css`
- Modify: `src/features/notes/NotesWorkspace.test.tsx`

**Interfaces:**
- Produces: `loadExpandedFolderIds(db): Promise<Set<string>>`.
- Produces: `saveExpandedFolderIds(db, ids, now): Promise<void>` using `AppMeta.key === "notes.expanded-folders"`.
- `NoteTree` consumes `expandedIds`, `onToggle`, `onSelect` and renders node types without owning hidden local expansion state.
- Consumes: Task 2 live folder/note rows.

- [ ] **Step 1: Write expansion persistence tests**

Create `tree-expansion.test.ts`:

```ts
it("stores only unique folder IDs and recovers from invalid metadata", async () => {
  await saveExpandedFolderIds(db, new Set(["math", "math", "physics"]), 10)
  await expect(loadExpandedFolderIds(db)).resolves.toEqual(new Set(["math", "physics"]))
  await db.appMeta.put({ key: "notes.expanded-folders", value: "not-json", updatedAt: 11 })
  await expect(loadExpandedFolderIds(db)).resolves.toEqual(new Set())
})
```

Add component tests asserting that clicking a folder chevron hides descendants without selecting the folder, reopening restores descendants, opening a deep note exposes its ancestor chain, folder rows use a folder icon and note rows use a note icon, and a 100-character title remains in the accessible name while the visible label has the ellipsis class.

- [ ] **Step 2: Run the tree tests and verify RED**

Run: `pnpm exec vitest run src/features/notes/tree-expansion.test.ts src/features/notes/NotesWorkspace.test.tsx`

Expected: FAIL because expansion metadata helpers and controlled tree props do not exist, all nodes use a note icon, and the current indentation is capped at depth four.

- [ ] **Step 3: Implement persistence and controlled expansion**

Store sorted JSON in `AppMeta`:

```ts
const EXPANSION_KEY = "notes.expanded-folders"
export async function saveExpandedFolderIds(db: VeloDB, ids: Set<string>, now: number) {
  const value = JSON.stringify([...ids].sort())
  await db.appMeta.put({ key: EXPANSION_KEY, value, updatedAt: now })
}
```

Refactor `NoteTree` so only folders expose a chevron. Clicking the chevron calls `onToggle(node.id)` and clicking the title calls `onSelect(node)`. Use `Folder`, `FolderOpen` and `FileText` icons with `aria-hidden="true"`. Preserve native list/button semantics instead of adding partial ARIA tree roles.

- [ ] **Step 4: Implement compact visual connectors and unlimited logical depth**

Replace capped `--tree-depth` padding with nested branch markup:

```css
.treeChildren {
  border-left: 1px solid rgb(117 20 96 / 18%);
  list-style: none;
  margin: 0 0 0 12px;
  padding: 0;
}
.treeChildren > li { position: relative; }
.treeChildren > li::before {
  border-top: 1px solid rgb(117 20 96 / 18%);
  content: "";
  left: 0;
  position: absolute;
  top: 22px;
  width: 8px;
}
.treeLabel {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Keep row height 44px and each chevron/action hit area at least 44px even though the visible connector spacing is compact.

- [ ] **Step 5: Verify tree behavior and commit**

Run: `pnpm exec vitest run src/features/notes/tree-expansion.test.ts src/features/notes/NotesWorkspace.test.tsx`

Run: `pnpm typecheck`

Run: `pnpm lint`

Run: `git diff --check`

```powershell
git add -- src/features/notes/NoteTree.tsx src/features/notes/tree-expansion.ts src/features/notes/tree-expansion.test.ts src/features/notes/NotesWorkspace.module.css src/features/notes/NotesWorkspace.test.tsx
git commit -m "feat: 构建可折叠知识目录树"
```

---

### Task 4: Folder/note creation, rename, move and responsive selection flow

**Files:**
- Modify: `src/features/notes/NotesWorkspace.tsx`
- Modify: `src/features/notes/NoteActionsDialog.tsx`
- Create: `src/features/notes/NewKnowledgeNodeMenu.tsx`
- Create: `src/features/notes/TreeNodeEditor.tsx`
- Modify: `src/features/notes/NotesWorkspace.module.css`
- Modify: `src/features/notes/NotesWorkspace.test.tsx`
- Modify: `e2e/notes.spec.ts`

**Interfaces:**
- Consumes Task 2 service functions and Task 3 controlled `NoteTree`.
- `NewKnowledgeNodeMenu` produces `{ type: "folder" | "note"; parentId: string | null }` selections.
- `TreeNodeEditor` accepts `initialValue`, `ariaLabel`, `onCommit(title)` and `onCancel()`; Enter commits a trimmed title and Escape cancels.
- URL selection remains `?note=<noteId>` for note documents; selected folders are held as `selectedNodeId` without pretending they are editable notes.

- [ ] **Step 1: Write the user-flow tests before changing components**

Replace inbox-specific component tests with this end-to-end component flow:

```ts
it("creates a folder, a child note, renames the folder and blocks a note as a parent", async () => {
  const user = userEvent.setup()
  renderWorkspace()
  await user.click(screen.getByRole("button", { name: "新建" }))
  await user.click(screen.getByRole("menuitem", { name: "新建文件夹" }))
  await user.type(screen.getByRole("textbox", { name: "文件夹名称" }), "数学{Enter}")
  await user.click(screen.getByRole("button", { name: "数学" }))
  await user.click(screen.getByRole("button", { name: "节点操作：数学" }))
  await user.click(screen.getByRole("button", { name: "新建笔记" }))
  await user.type(screen.getByRole("textbox", { name: "笔记名称" }), "导数{Enter}")
  expect(await screen.findByRole("button", { name: "打开笔记：导数" })).toBeVisible()
  expect(await db.notes.count()).toBe(1)
})
```

Add tests for inline rename Enter/Escape, duplicate sibling titles, moving a folder under another folder, excluding self/descendants/notes from move destinations, deleting a folder with subtree confirmation, restoring the full group, opening a note from the phone drawer and closing the drawer, and selecting a folder without mounting `NoteEditor`.

- [ ] **Step 2: Run component tests and verify RED**

Run: `pnpm exec vitest run src/features/notes/NotesWorkspace.test.tsx`

Expected: FAIL because the current header only creates notes, the action dialog assumes note parents, the inbox still exists, and folders are opened as editors.

- [ ] **Step 3: Implement the new-node and inline-editor controls**

`NewKnowledgeNodeMenu` uses a native popover-like menu with two 44px items: “新建文件夹” and “新建笔记”. It must close on Escape and restore focus to the trigger. `TreeNodeEditor` uses a single-line input, selects the initial value on rename, keeps user text after a service failure, and shows the returned Chinese error beside the input.

Do not add permanent search, Daily Inspiration or PDF buttons in this task. Do not reintroduce the inbox as a placeholder.

- [ ] **Step 4: Refactor workspace state around node types**

Change `Area` to `"all" | "trash"`. Remove every `inbox` branch, label and URL value. Keep `selectedNodeId` for both types; only sync `?note=` when the selected node is a note. When a folder is selected, render a quiet folder panel with its full path, child count, “新建子文件夹” and “新建笔记”; do not mount `NoteEditor` or create a document. Automatically expand all folder ancestors before selecting a deep note and close the mobile drawer after successful selection.

The move dialog lists only live folders outside the selected node’s subtree. Its root option is “笔记库根目录”. Folder action copy is “文件夹操作”; note action copy is “笔记操作”. Delete confirmation for a folder says “文件夹内的子文件夹和笔记会一起进入回收站，可随时恢复。”

- [ ] **Step 5: Update browser acceptance for the knowledge tree**

In `e2e/notes.spec.ts`, replace the inbox journey with:

```ts
await page.getByRole("button", { name: "新建" }).click()
await page.getByRole("menuitem", { name: "新建文件夹" }).click()
await page.getByRole("textbox", { name: "文件夹名称" }).fill("数学")
await page.getByRole("textbox", { name: "文件夹名称" }).press("Enter")
await page.getByRole("button", { name: "数学" }).click()
await page.getByRole("button", { name: "节点操作：数学" }).click()
await page.getByRole("button", { name: "新建笔记" }).click()
await page.getByRole("textbox", { name: "笔记名称" }).fill("极限与连续")
await page.getByRole("textbox", { name: "笔记名称" }).press("Enter")
await expect(page.getByRole("button", { name: "打开笔记：极限与连续" })).toBeVisible()
```

Exercise collapse/reopen, reload persistence, long-title ellipsis, six nested folders, subtree trash/restore, 390/402/768/834/1024/1366 widths, 200% text and keyboard Escape/Enter. Assert there is no “笔记收件箱” and no horizontal overflow.

- [ ] **Step 6: Run focused tests, full verification and commit**

Run: `pnpm exec vitest run src/features/notes src/db/velo-db.test.ts src/features/home/home-query.test.ts`

Run: `pnpm verify`

Run: `pnpm exec playwright test e2e/notes.spec.ts`

Run: `git diff --check`

```powershell
git add -- src/features/notes/NotesWorkspace.tsx src/features/notes/NoteActionsDialog.tsx src/features/notes/NewKnowledgeNodeMenu.tsx src/features/notes/TreeNodeEditor.tsx src/features/notes/NotesWorkspace.module.css src/features/notes/NotesWorkspace.test.tsx e2e/notes.spec.ts
git commit -m "feat: 完成文件夹与笔记目录流程"
```

---

### Task 5: Documentation, migration evidence and preview handoff

**Files:**
- Modify: `README.md`
- Create: `docs/qa/2026-09-05-notes-knowledge-tree-foundation.md`
- Modify: `docs/superpowers/plans/2026-09-05-notes-knowledge-tree-foundation.md`

**Interfaces:**
- Records the delivered v7 migration behavior, current temporary Markdown editor limitation and the next separate phase boundary.
- Does not claim Daily Inspiration, search, PDF, WYSIWYG, formulas or recording are implemented.

- [ ] **Step 1: Write an acceptance record from actual evidence**

Create the QA file with exact command results, tested viewports, screenshot paths, database migration fixtures and any known limitation. State explicitly that the old Markdown editor remains temporary and that the next implementation plan replaces it with the approved direct-writing editor.

- [ ] **Step 2: Update README behavior and remove inbox instructions**

Document folder/note creation, stable IDs, expand/collapse, long-title ellipsis, move restrictions, subtree trash/restore and migration behavior. Keep future features in the future-features paragraph.

- [ ] **Step 3: Run final verification before marking checkboxes complete**

Run: `pnpm verify`

Run: `pnpm exec playwright test e2e/notes.spec.ts`

Run: `git status --short`

Run: `git diff --check`

Expected: verification passes; only the QA, README and plan-checkbox edits remain before the documentation commit.

- [ ] **Step 4: Commit the handoff documentation**

```powershell
git add -- README.md docs/qa/2026-09-05-notes-knowledge-tree-foundation.md docs/superpowers/plans/2026-09-05-notes-knowledge-tree-foundation.md
git commit -m "docs: 记录知识目录验收结果"
```

- [ ] **Step 5: Serve and inspect the actual build**

Run `pnpm build`, keep the existing LAN preview process if it is healthy, otherwise start `pnpm preview --host 0.0.0.0` on the agreed preview port. Inspect `/notes` at 402px, 834px and 1366px. Do not claim physical Android verification unless the user opens that build on their device.
