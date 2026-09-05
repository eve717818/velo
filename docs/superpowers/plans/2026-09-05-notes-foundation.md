# Notes Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first usable local Markdown notes workspace with writable nested nodes, inbox, safe autosave, trash recovery and Markdown export.

**Architecture:** Extend existing Dexie tables without destroying legacy JSON. A transaction service owns node hierarchy, revision-checked Markdown saves, trash groups and exports. A responsive React workspace consumes these services, with an isolated editor session per node and native dialog controls reused from the app.

**Tech Stack:** Existing React/TypeScript/Dexie/CSS modules; a maintained Markdown React renderer may be added for safe read mode, no raw HTML execution. No server, AI, PDF engine or native runtime in this phase.

**Spec:** docs/superpowers/specs/2026-09-05-velow-notes-workspace-design.md

## Global Constraints

- Every node can contain Markdown and children; stable IDs, no fixed business depth, no self/descendant moves.
- Preserve all existing user data and migrations; add a new version, retain legacy JSON content, never overwrite original unknown formats.
- Local-first editing; explicit saving/saved/error states, recoverable drafts, IME composition respected and stale writes rejected.
- First phase includes soft delete/restore and basic Markdown export. Do not add permanent deletion UI, AI, recording, search, inspiration or PDF before their phases.
- Phone drawer / tablet collapsible left directory and right content; white/gray, brand #901D78 with restrained cool accents; at least 44px touch controls.
- No git push/merge, no edits to unrelated plan features, no clearing browser data, keep user preview port 4176 available.

### Task 1: Persistent notes and hierarchy service

**Files:** modify src/db/types.ts, src/db/velo-db.ts, src/db/velo-db.test.ts and src/features/home/home-query.ts; create src/features/notes/note-service.ts and src/features/notes/note-service.test.ts.

**Interfaces:** optional additions for compatibility: KnowledgeNode.inbox?: boolean, deletedAt?: number, trashRootId?: string; NoteDocument.markdown?: string, revision?: number. Export `createNote(db, {title,parentId,inbox}, now): Promise<KnowledgeNode>`, `saveNote(db,nodeId,{title,markdown},expectedRevision,now): Promise<NoteDocument>`, `moveNote(db,nodeId,parentId,inbox,now): Promise<void>`, `trashNote(db,nodeId,now): Promise<void>`, `restoreNote(db,nodeId,now): Promise<void>`, `loadNote(db,nodeId): Promise<NoteDocument>`, `exportMarkdown(db,nodeId): Promise<{filename:string,text:string}>`. Error messages must be user-readable Chinese.

- [ ] Write tests against actual Dexie transactions. Example:
```ts
const a = await createNote(db, {title:"数学", parentId:null, inbox:false}, 1)
const b = await createNote(db, {title:"导数", parentId:a.id, inbox:false}, 2)
await expect(moveNote(db,a.id,b.id,false,3)).rejects.toThrow()
const doc = await loadNote(db,b.id)
await saveNote(db,b.id,{title:"导数",markdown:"# 定义\n变化率"},doc.revision ?? 0,4)
await expect(saveNote(db,b.id,{title:"旧稿",markdown:"旧"},doc.revision ?? 0,5)).rejects.toThrow()
```
Also test root/inbox creation, moving retains ID and body, recursive trash and restoring only its own trash group, earlier-trashed descendants remain trashed, restore under deleted parent goes to inbox, legacy JSON preserved, missing-node errors, exports ordered subtree including parent text, live home recent notes exclude trash.
- [ ] Run `pnpm exec vitest run src/features/notes/note-service.test.ts` and record the failing assertions.
- [ ] Implement new migration with deterministic backfill from existing plainText (keep content unchanged; make fallback readable, do not claim rich JSON conversion). New folder nodes can lazily get a document. Transactions validate live parents and revisions and keep node/document titles synchronized. Derive next sibling order inside the transaction. Hierarchy traversal must guard corruption/cycles. Inbox is node location, not a duplicate document. Trash propagates exact group IDs, does not collect previously deleted subtrees. Export an ordered single .md with headings and ancestor structure, sanitized filename; never mutate data while exporting.
- [ ] Run service/migration/home tests plus typecheck and lint. Check no old plan migrations changed.
- [ ] Commit this independently testable service unit and report the exact public API and tests.

### Task 2: Responsive notes workspace and autosaving editor

**Files:** replace src/pages/NotesPage.tsx; create src/features/notes/NotesWorkspace.tsx, NotesWorkspace.module.css, NoteEditor.tsx, NoteTree.tsx, NoteActionsDialog.tsx, MarkdownView.tsx, editor-state.ts and associated tests; modify package.json/pnpm-lock.yaml only for the Markdown renderer and src/features/home/components/RecentNoteCard.tsx only if its link needs stable note selection.

**Interfaces:** consume Task 1 service API unchanged; NotesPage uses veloDb and URL `?note=<nodeId>` with optional `area=inbox|trash`. `NoteEditor` consumes db,nodeId and flush/save protection callbacks; keep unsaved draft state keyed per node. Markdown read mode never enables raw HTML and blocks remote images by default. Reuse PlanDialog for modal behavior; don't fork its lifecycle implementation.

- [ ] Write component tests for empty state→create→edit→saved; read view, switch node during pending save, injected rejection retaining draft, stale revision conflict not overwriting DB, IME composition, create-child, move to inbox/directory, trash/restore and export. Start with real page and DB, e.g.:
```tsx
render(<MemoryRouter><NotesWorkspace db={db} /></MemoryRouter>)
await user.click(screen.getByRole("button",{name:"新建笔记",exact:true}))
// Name the visible editor fields 笔记标题 and Markdown 正文.
await user.type(await screen.findByLabelText("Markdown 正文"), "# 我的课堂笔记")
await screen.findByText("已保存")
expect((await db.notes.toArray()).some(n=>n.markdown?.includes("我的课堂笔记"))).toBe(true)
```
- [ ] Run tests RED before production changes. Check dependency official documentation/version if adding renderer; default safe rendering, disallow scripts and unsafe URL schemes, keep text selectable.
- [ ] Implement utility-first content workspace: slim header with 新建笔记 and 目录 controls; no large marketing hero. Left nav contains 全部笔记/笔记收件箱/回收站 and an expandable list using native buttons/lists (avoid incomplete ARIA tree roles). Recursive display must cap visual indent but retain hierarchy via breadcrumbs. Every node can open body/add child. Collapsible/resizable tablet pane with keyboard-equivalent width adjustment. Mobile directory uses native modal drawer and restores focus.
- [ ] Editor has title, visible save status, Markdown textarea and 编辑/阅读/分栏 modes (split only on sufficiently wide container). Basic heading/list/bold/quote/code insertion respects selection and IME. Debounce saves, flush on intentional node/area switch and export; block navigation when failure unresolved, preserve draft in memory plus recoverable local storage if possible, never show saved for stale completion. Multi-tab conflict offers explicit reload-current or copy/export local draft, never blind retry with new revision. Loading/errors/empty/trash states visible with useful action.
- [ ] Node actions support add sibling/child, rename via title editor, move to eligible destination, move to inbox, soft delete confirmed with subtree explanation, restore. Native download uses Blob+download and revokes URLs; export waits for successful save. No permanent delete button. Breadcrumbs and links do not discard pending text. Mobile controls reflow without clipping and retain 44px targets. Update recent home note navigation and deleted-note exclusion if necessary.
- [ ] Run component/service tests, typecheck/lint/build. Capture and inspect 402px and 1024px screens and keyboard modal close. Commit and report interfaces, dependencies, test evidence and remaining limitations.

### Task 3: Browser acceptance and handoff

**Files:** create e2e/notes.spec.ts and docs/qa/2026-09-05-notes-foundation.md; update README.md. Product fixes must be limited to failures demonstrated by this acceptance flow.

**Interfaces:** route /notes, editor labels from Task 2, Task 1 persistence APIs. Use installed Chrome and existing Playwright configuration; avoid overwriting user's origin data by using isolated contexts.

- [ ] Add native browser tests: onboarding→inbox note→Markdown title/body→save→reload→child→move→trash parent→restore subtree→Markdown download, preserving IDs/content. Assert download text, no missing subtree entries. Verify unsafe Markdown does not execute JS and remote image isn't fetched.
```ts
const downloadPromise = page.waitForEvent("download")
await page.getByRole("button",{name:"导出 Markdown",exact:true}).click()
const download = await downloadPromise
expect(download.suggestedFilename()).toMatch(/\.md$/)
```
- [ ] Validate 390/402/768/834/1024/1366 widths, large text, reduced motion, keyboard focus, no global horizontal overflow. Record node/tree/editor bounds, use axe for primary states. Exercise failed saves and reload recovery, two browser pages conflict, and HTTP LAN-compatible ID creation. Do not claim physical Android validation from emulation.
- [ ] Run `pnpm verify`, the notes Playwright test and existing home/plans/PWA tests if changes touch shared startup/DB behavior. Build and verify user preview is serving latest dist. Capture stable screenshots under project staging, not unique user data.
- [ ] Document actual features, limitations and test evidence in QA/README. Update plan checkboxes to reflect delivered work. Commit the acceptance unit; no push or merge.
