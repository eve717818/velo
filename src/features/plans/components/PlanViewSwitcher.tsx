import type { PlanView } from "../usePlanWorkspace"
import styles from "../PlansPage.module.css"

interface PlanViewSwitcherProps {
  value: PlanView
  onChange: (view: PlanView) => void
}

const views: Array<{ value: PlanView; label: string }> = [
  { value: "day", label: "日" },
  { value: "week", label: "周" },
  { value: "month", label: "月" },
  { value: "period", label: "周期" },
]

export function PlanViewSwitcher({ value, onChange }: PlanViewSwitcherProps) {
  return (
    <div aria-label="计划视图" className={styles.viewSwitcher} role="group">
      {views.map((view) => (
        <button
          aria-pressed={value === view.value}
          className={styles.viewButton}
          key={view.value}
          onClick={() => onChange(view.value)}
          type="button"
        >
          {view.label}
        </button>
      ))}
    </div>
  )
}
