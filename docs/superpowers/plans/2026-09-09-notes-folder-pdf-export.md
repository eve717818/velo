# Notes Folder PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Generate a real, printable PDF for any selected knowledge-tree folder, note, or the whole notebook, and save or share it from Android.

**Architecture:** Freeze the selected live subtree and its note documents into an ordered export snapshot before rendering. Generate the PDF entirely in the browser with `pdf-lib`, `@pdf-lib/fontkit`, and a bundled static Noto Sans SC font; then prefer the Android Web Share file sheet and fall back to a normal Blob download. Keep selection and export controls in the knowledge-tree header so the command always reflects the visible tree context.

**Tech Stack:** React 19, TypeScript, Dexie, pdf-lib, @pdf-lib/fontkit, Noto Sans SC, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-velow-notes-workspace-design.md`

## Global Constraints

- Export selected notes, selected folders and all descendants, or all live roots when “笔记库” is selected.
- Preserve the same stable order shown by the knowledge tree and exclude soft-deleted nodes.
- Generate a real A4 PDF locally; never upload note content.
- Wait for the current note to save before freezing the export snapshot.
- Prefer Android system save/share and fall back to browser download.
- Keep every icon-only control keyboard accessible with an explicit accessible name.

---

### Task 1: Ordered export snapshot

**Files:**
- Create: `src/features/notes/pdf-export-model.ts`
- Create: `src/features/notes/pdf-export-model.test.ts`

**Interfaces:**
- Produces: `buildPdfExportSnapshot(db: VeloDB, selectedNodeId: string | null): Promise<PdfExportSnapshot>`.
- Produces: `PdfExportSnapshot` with `title`, `filename`, and ordered folder/note entries carrying their relative level and Markdown.

- [x] **Step 1: Write failing snapshot tests**

```ts
expect(await buildPdfExportSnapshot(db, folder.id)).toMatchObject({
  title: "数学",
  entries: [
    { kind: "folder", title: "数学", level: 0 },
    { kind: "folder", title: "第一章", level: 1 },
    { kind: "note", title: "导数", level: 2, markdown: "变化率" },
  ],
})
```

Add separate cases for whole-library export, a selected note, deleted descendants, and a folder with no notes.

- [x] **Step 2: Verify RED**

Run: `pnpm test:run src/features/notes/pdf-export-model.test.ts`

Expected: FAIL because `pdf-export-model.ts` does not exist.

- [x] **Step 3: Implement the minimal snapshot builder**

Read nodes and documents in one Dexie read transaction. Sort siblings with `order` then `title`, traverse depth-first, reject missing selected nodes, and return `hasNotes` so the UI can explain a disabled button.

- [x] **Step 4: Verify GREEN**

Run: `pnpm test:run src/features/notes/pdf-export-model.test.ts`

Expected: all snapshot cases PASS.

### Task 2: Real PDF bytes and mobile delivery

**Files:**
- Create: `src/features/notes/pdf-document.ts`
- Create: `src/features/notes/pdf-document.test.ts`
- Add: `public/fonts/NotoSansSC-Regular.ttf`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `PdfExportSnapshot` from Task 1.
- Produces: `createNotesPdf(snapshot, fontBytes): Promise<Uint8Array>`.
- Produces: `deliverPdfFile(filename, bytes): Promise<"shared" | "downloaded" | "cancelled">`.

- [x] **Step 1: Write failing PDF tests**

```ts
const bytes = await createNotesPdf(snapshot, fontBytes)
const document = await PDFDocument.load(bytes)
expect(document.getPageCount()).toBeGreaterThan(0)
expect(bytes.slice(0, 5)).toEqual(new TextEncoder().encode("%PDF-"))
```

Test filename sanitation, multi-page output, page numbers, share-first delivery, rejected-share download fallback, and unsupported-share download fallback.

- [x] **Step 2: Verify RED**

Run: `pnpm test:run src/features/notes/pdf-document.test.ts`

Expected: FAIL because the PDF functions do not exist.

- [x] **Step 3: Implement PDF generation and delivery**

Embed the static Noto Sans SC font in full for broad Android and print-reader compatibility, lay out an A4 cover, hierarchical headings, Markdown-derived paragraphs/lists/code blocks, automatic page breaks, and `第 n / N 页` footers. Create a `File` with MIME `application/pdf`; call `navigator.share({ files: [file] })` only when `navigator.canShare` accepts it, otherwise click a Blob-backed download anchor. A user-cancelled share must not trigger a duplicate download; a real share error must.

- [x] **Step 4: Verify GREEN**

Run: `pnpm test:run src/features/notes/pdf-document.test.ts`

Expected: all generation and delivery cases PASS.

### Task 3: Knowledge-tree export control

**Files:**
- Modify: `src/features/notes/NotesWorkspace.tsx`
- Modify: `src/features/notes/NotesWorkspace.module.css`
- Modify: `src/features/notes/NotesWorkspace.test.tsx`
- Modify: `e2e/notes.spec.ts`

**Interfaces:**
- Consumes: snapshot, generation, and delivery functions from Tasks 1-2.
- Produces: a “导出 PDF” button beside the knowledge-tree close/collapse control and progress/error status in the existing workspace message.

- [x] **Step 1: Write failing workspace tests**

Assert that the mobile drawer header order is “知识树”, “导出 PDF”, “关闭知识树”; the button exports the selected folder ID; root selection exports `null`; it is disabled for an empty scope; current unsaved note failure blocks export; and the old “导出 Markdown” content-toolbar button is absent.

- [x] **Step 2: Verify RED**

Run: `pnpm test:run src/features/notes/NotesWorkspace.test.tsx`

Expected: new tests FAIL against the Markdown-only toolbar implementation.

- [x] **Step 3: Implement the export interaction and title strip**

Inject `buildPdfExportSnapshot`, `createNotesPdf`, and `deliverPdfFile` through service overrides for deterministic tests. Add a labelled progress state, disable repeat activation while generating, and keep the mobile drawer open when export starts. Style the header as a full-width pale-gray strip with a thin border, 14px radius, title on the left, PDF and close controls on the right, and spacing before the tree.

- [x] **Step 4: Verify component GREEN and mobile layout**

Run: `pnpm test:run src/features/notes/NotesWorkspace.test.tsx`

Run: `pnpm build && pnpm playwright test e2e/notes.spec.ts`

Expected: component tests PASS; 368px, 402px, 834px and 1366px views show unclipped controls and preserve 44px touch targets.

### Task 4: Documentation, PDF rendering QA, and delivery

**Files:**
- Modify: `README.md`
- Modify: `docs/qa/2026-09-07-notes-daily-inspiration.md`
- Modify: `D:/workplace/GLOBAL-CONSOLE.md`
- Create: `output/pdf/notes-folder-export-qa.pdf`
- Create: `docs/qa/assets/notes-pdf-export-mobile.png`

**Interfaces:**
- Consumes: the finished UI and export functions.
- Produces: reproducible QA evidence and a new LAN preview URL.

- [x] **Step 1: Generate a representative Chinese PDF**

Use a three-level folder fixture containing Chinese headings, lists, long paragraphs, and enough content for multiple pages. Save it as `output/pdf/notes-folder-export-qa.pdf`.

- [x] **Step 2: Render and inspect every PDF page**

Run `pdfinfo` and `pdftoppm -png`, then inspect the PNGs for missing glyphs, clipped text, broken hierarchy, footer collisions, and page-transition defects.

- [x] **Step 3: Run complete verification**

Run: `pnpm verify`

Run: `pnpm playwright test e2e/notes.spec.ts e2e/home.spec.ts`

Run: `git diff --check`

Expected: all commands PASS; build may retain only the previously documented large-chunk warning.

- [x] **Step 4: Update delivery documentation and preview**

Document the PDF scope, Android share/download behavior, bundled font license, test counts, and current LAN preview URL. Build and start a fresh preview on the next port so service-worker caches cannot show an older notes UI.

- [x] **Step 5: Commit recoverable units**

Commit project changes with `feat: export knowledge tree as pdf`, then update and commit the root console separately without adding user-owned screenshot files or `.firecrawl/`.
