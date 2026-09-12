import { Camera, Focus, SquarePen } from "lucide-react"
import { Link } from "react-router-dom"
import styles from "../HomePage.module.css"

const actions = [
  {
    label: "新建笔记",
    description: "记录想法与知识",
    to: "/notes?new=1",
    icon: SquarePen,
    tone: styles.actionViolet,
  },
  {
    label: "拍照录入",
    description: "敬请期待",
    to: null,
    icon: Camera,
    tone: styles.actionMint,
  },
  {
    label: "开始专注",
    description: "专注学习，保持节奏",
    to: "/focus?start=1",
    icon: Focus,
    tone: styles.actionIndigo,
  },
] as const

export function QuickActions() {
  return (
    <section className={styles.quickPanel} aria-labelledby="home-actions-title" data-bento-card="actions">
      <div className={styles.cardHeadingRow}>
        <h2 className={styles.sectionTitle} id="home-actions-title">
          快捷操作
        </h2>
        <span className={styles.cardIndex}>03</span>
      </div>
      <div className={styles.quickActions}>
        {actions.map(({ description, icon: Icon, label, to, tone }) => to === null ? (
          <div className={`${styles.quickAction} ${styles.unavailableAction}`} key={label}>
            <span className={styles.actionIcon} aria-hidden="true"><Icon size={28} strokeWidth={1.9} /></span>
            <span><strong>{label}</strong><small>{description}</small></span>
          </div>
        ) : (
          <Link aria-label={label} className={styles.quickAction} key={label} to={to}>
            <span className={`${styles.actionIcon} ${tone}`} aria-hidden="true">
              <Icon size={28} strokeWidth={1.9} />
            </span>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
