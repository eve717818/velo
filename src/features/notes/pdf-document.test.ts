import { readFile } from "node:fs/promises"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { PDFDocument } from "pdf-lib"
import { afterEach, describe, expect, test, vi } from "vitest"
import { VeloDB } from "@/db/velo-db"
import { createFolder, createNote } from "./note-service"
import type { PdfExportSnapshot } from "./pdf-export-model"
import { createNotesPdf, deliverPdfFile, exportNotesPdf } from "./pdf-document"

const snapshot: PdfExportSnapshot = {
  title: "数学复习",
  filename: "数学复习.pdf",
  hasNotes: true,
  entries: [
    { id: "folder", kind: "folder", title: "第一章", level: 0 },
    { id: "note", kind: "note", title: "导数", level: 1, markdown: "# 定义\n\n变化率描述函数的变化。\n\n- 平均变化率\n- 瞬时变化率" },
  ],
}

async function bundledFont() {
  return new Uint8Array(await readFile(resolve(process.cwd(), "public/fonts/NotoSansSC-Regular.ttf")))
}

const execFileAsync = promisify(execFile)

afterEach(() => {
  vi.restoreAllMocks()
})

test("exports a real PDF from a selected folder through the complete local pipeline", async () => {
  const db = new VeloDB(`pdf-document-pipeline-${crypto.randomUUID()}`)
  const folder = await createFolder(db, { title: "数学", parentId: null }, 1)
  await createNote(db, { title: "导数", parentId: folder.id }, 2)
  const fontBytes = await bundledFont()
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(fontBytes, { status: 200 })))
  vi.stubGlobal("navigator", { canShare: () => false })
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:complete-pdf")
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)

  try {
    await expect(exportNotesPdf(db, folder.id)).resolves.toEqual({ delivery: "downloaded", filename: "数学.pdf" })
    expect(click).toHaveBeenCalledTimes(1)
  } finally {
    db.close()
    await db.delete()
  }
})

describe("createNotesPdf", () => {
  test("creates a loadable A4 PDF containing cover, contents, note pages and page metadata", async () => {
    const bytes = await createNotesPdf(snapshot, await bundledFont(), new Date("2026-09-10T08:00:00+08:00"))
    const document = await PDFDocument.load(bytes)

    expect(new TextDecoder("latin1").decode(bytes.slice(0, 5))).toBe("%PDF-")
    expect(document.getPageCount()).toBeGreaterThanOrEqual(3)
    expect(document.getTitle()).toBe("数学复习")
    expect(document.getCreator()).toBe("Velow Notebook")
    for (const page of document.getPages()) expect(page.getSize()).toEqual({ width: 595.28, height: 841.89 })
  })

  test("adds pages for long Chinese content instead of clipping it", async () => {
    const longSnapshot: PdfExportSnapshot = {
      ...snapshot,
      entries: [{ id: "long", kind: "note", title: "长篇笔记", level: 0, markdown: "这是一段需要正确换行的中文内容。".repeat(1_200) }],
    }

    const bytes = await createNotesPdf(longSnapshot, await bundledFont(), new Date("2026-09-10T08:00:00+08:00"))
    const document = await PDFDocument.load(bytes)

    expect(document.getPageCount()).toBeGreaterThan(4)
  })

  test("embeds a Chinese font that Poppler can render without font errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "velow-pdf-font-"))
    const pdfPath = join(directory, "chinese.pdf")
    const imagePrefix = join(directory, "page")
    try {
      await writeFile(pdfPath, await createNotesPdf(snapshot, await bundledFont(), new Date("2026-09-10T08:00:00+08:00")))
      const { stderr } = await execFileAsync("pdftoppm", ["-png", "-f", "1", "-singlefile", pdfPath, imagePrefix])
      expect(stderr).not.toMatch(/font file may be invalid|Couldn't create a font|non-embedded font/i)
      expect((await readFile(`${imagePrefix}.png`)).byteLength).toBeGreaterThan(1_000)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe("deliverPdfFile", () => {
  test("uses the system share sheet when the browser accepts PDF files", async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { canShare: () => true, share })
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)

    await expect(deliverPdfFile("数学.pdf", new Uint8Array([37, 80, 68, 70]))).resolves.toBe("shared")
    expect(share).toHaveBeenCalledTimes(1)
    const sharePayload = share.mock.calls[0]?.[0] as ShareData
    expect(sharePayload.files?.[0]).toMatchObject({ name: "数学.pdf", type: "application/pdf" })
    expect(click).not.toHaveBeenCalled()
  })

  test("falls back to a browser download when file sharing is unavailable", async () => {
    vi.stubGlobal("navigator", { canShare: () => false })
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf")
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)

    await expect(deliverPdfFile("数学.pdf", new Uint8Array([37, 80, 68, 70]))).resolves.toBe("downloaded")
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pdf")
  })

  test("does not download a second copy when the user cancels the system share sheet", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"))
    vi.stubGlobal("navigator", { canShare: () => true, share })
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)

    await expect(deliverPdfFile("数学.pdf", new Uint8Array([37, 80, 68, 70]))).resolves.toBe("cancelled")
    expect(click).not.toHaveBeenCalled()
  })

  test("downloads the PDF after a non-cancellation share failure", async () => {
    const share = vi.fn().mockRejectedValue(new Error("share unavailable"))
    vi.stubGlobal("navigator", { canShare: () => true, share })
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fallback")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)

    await expect(deliverPdfFile("数学.pdf", new Uint8Array([37, 80, 68, 70]))).resolves.toBe("downloaded")
    expect(click).toHaveBeenCalledTimes(1)
  })
})
