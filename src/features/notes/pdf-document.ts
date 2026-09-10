import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib"
import type { VeloDB } from "@/db/velo-db"
import { buildPdfExportSnapshot } from "./pdf-export-model"
import type { PdfExportEntry, PdfExportSnapshot } from "./pdf-export-model"

const A4: [number, number] = [595.28, 841.89]
const margin = 54
const footerHeight = 32
const contentWidth = A4[0] - margin * 2
const brand = rgb(0.49, 0.08, 0.4)
const ink = rgb(0.1, 0.09, 0.12)
const muted = rgb(0.38, 0.37, 0.42)
const line = rgb(0.88, 0.86, 0.89)

interface LayoutState {
  document: PDFDocument
  font: PDFFont
  page: PDFPage
  y: number
}

function supportedText(text: string, font: PDFFont) {
  const supported = new Set(font.getCharacterSet())
  return [...text].map((character) => supported.has(character.codePointAt(0) ?? 0) ? character : "□").join("")
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const safeText = supportedText(text, font)
  if (!safeText) return [""]
  const lines: string[] = []
  let current = ""
  for (const character of safeText) {
    if (character === "\n") {
      lines.push(current)
      current = ""
      continue
    }
    const candidate = `${current}${character}`
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current)
      current = character
    } else current = candidate
  }
  lines.push(current)
  return lines
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const safeText = supportedText(text, font)
  if (font.widthOfTextAtSize(safeText, size) <= maxWidth) return safeText
  let result = ""
  for (const character of safeText) {
    if (font.widthOfTextAtSize(`${result}${character}…`, size) > maxWidth) break
    result += character
  }
  return `${result}…`
}

function addContentPage(state: Pick<LayoutState, "document" | "font">): LayoutState {
  return { ...state, page: state.document.addPage(A4), y: A4[1] - margin }
}

function ensureSpace(state: LayoutState, height: number) {
  if (state.y - height >= margin + footerHeight) return state
  return addContentPage(state)
}

function drawWrapped(
  state: LayoutState,
  text: string,
  options: { size: number; lineHeight: number; indent?: number; color?: ReturnType<typeof rgb>; gapAfter?: number },
) {
  const indent = options.indent ?? 0
  const lines = wrapText(text, state.font, options.size, contentWidth - indent)
  let current = state
  for (const wrappedLine of lines) {
    current = ensureSpace(current, options.lineHeight)
    if (wrappedLine) current.page.drawText(wrappedLine, { x: margin + indent, y: current.y - options.size, size: options.size, font: current.font, color: options.color ?? ink })
    current.y -= options.lineHeight
  }
  current.y -= options.gapAfter ?? 0
  return current
}

function stripMarkdownToken(lineText: string) {
  return lineText
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]([^*_~`]+)[*_~`]/g, "$1")
    .replace(/\\([\\`*{}[\]()#+.!_>-])/g, "$1")
}

function drawMarkdown(state: LayoutState, markdown: string) {
  let current = state
  let code = false
  for (const rawLine of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*```/.test(rawLine)) {
      code = !code
      current.y -= 4
      continue
    }
    if (!rawLine.trim()) {
      current.y -= 7
      continue
    }
    if (code) {
      current = drawWrapped(current, rawLine, { size: 9.5, lineHeight: 15, indent: 12, color: rgb(0.24, 0.23, 0.27), gapAfter: 1 })
      continue
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(rawLine)
    if (heading) {
      const size = Math.max(12, 18 - heading[1].length)
      current.y -= 5
      current = drawWrapped(current, stripMarkdownToken(heading[2]), { size, lineHeight: size + 7, color: ink, gapAfter: 3 })
      continue
    }
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(rawLine)
    if (bullet) {
      current = drawWrapped(current, `• ${stripMarkdownToken(bullet[1])}`, { size: 10.5, lineHeight: 17, indent: 12, gapAfter: 2 })
      continue
    }
    const quote = /^\s*>\s?(.*)$/.exec(rawLine)
    if (quote) {
      current = drawWrapped(current, stripMarkdownToken(quote[1]), { size: 10.5, lineHeight: 17, indent: 16, color: muted, gapAfter: 3 })
      continue
    }
    current = drawWrapped(current, stripMarkdownToken(rawLine), { size: 10.5, lineHeight: 18, gapAfter: 3 })
  }
  return current
}

function headingSize(entry: PdfExportEntry) {
  if (entry.kind === "note") return Math.max(15, 20 - Math.min(entry.level, 3))
  return Math.max(12, 18 - Math.min(entry.level, 4))
}

function drawEntry(state: LayoutState, entry: PdfExportEntry) {
  const size = headingSize(entry)
  let current = ensureSpace(state, size + 26)
  current.y -= entry.kind === "note" ? 14 : 8
  current = drawWrapped(current, entry.title, {
    size,
    lineHeight: size + 7,
    indent: Math.min(entry.level, 4) * 8,
    color: entry.kind === "folder" ? brand : ink,
    gapAfter: entry.kind === "note" ? 10 : 5,
  })
  if (entry.kind === "note") current = drawMarkdown(current, entry.markdown)
  return current
}

function drawCover(page: PDFPage, font: PDFFont, snapshot: PdfExportSnapshot, createdAt: Date) {
  const titleLines = wrapText(snapshot.title, font, 28, contentWidth)
  let y = A4[1] * 0.62
  for (const titleLine of titleLines) {
    page.drawText(titleLine, { x: margin, y, size: 28, font, color: ink })
    y -= 40
  }
  page.drawLine({ start: { x: margin, y: y - 4 }, end: { x: margin + 92, y: y - 4 }, thickness: 3, color: brand })
  page.drawText("Velow Notebook", { x: margin, y: y - 40, size: 13, font, color: brand })
  page.drawText(`导出日期 ${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`, { x: margin, y: y - 65, size: 10, font, color: muted })
}

function drawContents(pages: PDFPage[], font: PDFFont, entries: PdfExportEntry[], pageNumbers: number[]) {
  const perPage = 31
  pages.forEach((page, pageIndex) => {
    page.drawText(pageIndex === 0 ? "目录" : "目录（续）", { x: margin, y: A4[1] - margin - 18, size: 20, font, color: ink })
    let y = A4[1] - margin - 58
    for (let index = pageIndex * perPage; index < Math.min(entries.length, (pageIndex + 1) * perPage); index += 1) {
      const entry = entries[index]
      const indent = Math.min(entry.level, 5) * 12
      const pageLabel = String(pageNumbers[index])
      const labelWidth = font.widthOfTextAtSize(pageLabel, 9.5)
      page.drawText(fitText(entry.title, font, 9.5, contentWidth - indent - labelWidth - 20), { x: margin + indent, y, size: 9.5, font, color: entry.kind === "folder" ? brand : ink })
      page.drawText(pageLabel, { x: A4[0] - margin - labelWidth, y, size: 9.5, font, color: muted })
      page.drawLine({ start: { x: margin + indent, y: y - 5 }, end: { x: A4[0] - margin, y: y - 5 }, thickness: 0.35, color: line })
      y -= 22
    }
  })
}

export async function createNotesPdf(snapshot: PdfExportSnapshot, fontBytes: Uint8Array, createdAt = new Date()) {
  const document = await PDFDocument.create()
  document.registerFontkit(fontkit)
  // pdf-lib/fontkit currently produces invalid or incomplete CJK subsets for
  // some OpenType and variable TrueType fonts. Embedding the static font in
  // full keeps the exported file readable in Android and print-shop viewers.
  const font = await document.embedFont(fontBytes, { subset: false })
  document.setTitle(snapshot.title)
  document.setAuthor("Velow Notebook")
  document.setCreator("Velow Notebook")
  document.setProducer("Velow Notebook PDF Export")
  document.setCreationDate(createdAt)
  document.setModificationDate(createdAt)

  const cover = document.addPage(A4)
  drawCover(cover, font, snapshot, createdAt)
  const contentsPages = Array.from({ length: Math.max(1, Math.ceil(snapshot.entries.length / 31)) }, () => document.addPage(A4))
  let state = addContentPage({ document, font })
  const pageNumbers: number[] = []
  for (const entry of snapshot.entries) {
    state = ensureSpace(state, headingSize(entry) + 26)
    pageNumbers.push(document.getPageCount())
    state = drawEntry(state, entry)
  }
  drawContents(contentsPages, font, snapshot.entries, pageNumbers)

  const pages = document.getPages()
  pages.forEach((page, index) => {
    const label = `第 ${index + 1} / ${pages.length} 页`
    const width = font.widthOfTextAtSize(label, 8.5)
    page.drawText(label, { x: A4[0] - margin - width, y: 25, size: 8.5, font, color: muted })
  })
  return document.save({ useObjectStreams: true })
}

function downloadPdf(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function deliverPdfFile(filename: string, bytes: Uint8Array): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" })
  const file = new File([blob], filename, { type: "application/pdf" })
  const shareData: ShareData = { title: filename.replace(/\.pdf$/i, ""), files: [file] }
  if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare(shareData)) {
    try {
      await navigator.share(shareData)
      return "shared"
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return "cancelled"
    }
  }
  downloadPdf(filename, blob)
  return "downloaded"
}

export interface PdfExportResult {
  delivery: "shared" | "downloaded" | "cancelled"
  filename: string
}

export async function exportNotesPdf(db: VeloDB, selectedNodeId: string | null): Promise<PdfExportResult> {
  const snapshot = await buildPdfExportSnapshot(db, selectedNodeId)
  if (!snapshot.hasNotes) throw new Error("当前范围没有可导出的笔记")
  const response = await fetch(`${import.meta.env.BASE_URL}fonts/NotoSansSC-Regular.ttf`)
  if (!response.ok) throw new Error("PDF 中文字体加载失败，请稍后重试")
  const bytes = await createNotesPdf(snapshot, new Uint8Array(await response.arrayBuffer()))
  return { delivery: await deliverPdfFile(snapshot.filename, bytes), filename: snapshot.filename }
}
