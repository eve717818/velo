import { Plus } from "lucide-react"

import type { RangePlan, RangePlanKind } from "@/db/types"

import styles from "../PlansPage.module.css"

interface RangePlanSummaryProps {
  kind: RangePlanKind
  onOpen: () => void
  plan: RangePlan | null
}

export function RangePlanSummary({ kind, onOpen, plan }: RangePlanSummaryProps) {
  const rangeName = kind === "week" ? "本周" : "本月"
  const buttonLabel = plan ? `查看或编辑${rangeName}计划` : `制定${rangeName}计划`

  return (
    <section aria-label={`${rangeName}总计划`} className={styles.rangePlanSummary}>
      <div className={styles.rangePlanCopy}>
        <p className={styles.metaLabel}>{rangeName}总计划</p>
        <h3>{plan?.theme ?? `先确定${rangeName}的学习方向`}</h3>
        <p>{plan?.goal ?? "主题、目标与重点事项会在这里形成清晰概览。"}</p>
        {plan?.focusItems.length ? (
          <ul>{plan.focusItems.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
        ) : null}
      </div>
      <button aria-label={buttonLabel} className={styles.rangePlanButton} onClick={onOpen} type="button">
        <Plus aria-hidden size={17} strokeWidth={2.2} />
        {plan ? "查看与编辑" : `制定${rangeName}计划`}
      </button>
    </section>
  )
}
