import { FileText } from "lucide-react"
import { Link } from "react-router-dom"
import type { NoteDocument } from "@/db/types"
import styles from "../HomePage.module.css"

interface RecentNoteRowProps {
  note: NoteDocument | null
}

function formatNoteTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp))
}

export function RecentNoteRow({ note }: RecentNoteRowProps) {
  return (
    <section className={styles.noteSection} aria-labelledby="home-note-title">
      <div className={styles.sectionHeadingRow}>
        <h2 className={styles.sectionTitle} id="home-note-title">
          最近笔记
        </h2>
        <Link className={styles.sectionLink} to="/notes">
          查看全部
        </Link>
      </div>
      {note ? (
        <Link aria-label={`打开最近笔记：${note.title}`} className={styles.noteRow} to="/notes">
          <span className={styles.noteIcon} aria-hidden="true">
            <FileText size={28} strokeWidth={1.9} />
          </span>
          <span className={styles.noteCopy}>
            <strong>{note.title}</strong>
            <span>{formatNoteTime(note.updatedAt)}</span>
          </span>
          <span className={styles.annotationPreview} aria-hidden="true">
            {note.plainText}
          </span>
        </Link>
      ) : (
        <div className={`${styles.noteRow} ${styles.emptyNote}`}>
          <span>还没有笔记</span>
          <Link className={styles.emptyLink} to="/notes?new=1">
            新建第一篇笔记
          </Link>
        </div>
      )}
    </section>
  )
}
