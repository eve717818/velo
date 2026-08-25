import { CalendarDays, House, NotebookTabs, Settings, Timer } from "lucide-react"
import { NavLink } from "react-router-dom"
import styles from "./PrimaryNav.module.css"

type NavigationVariant = "mobile" | "rail"

interface PrimaryNavProps {
  variant: NavigationVariant
}

const primaryItems = [
  { label: "首页", to: "/", icon: House, end: true },
  { label: "计划", to: "/plans", icon: CalendarDays },
  { label: "笔记", to: "/notes", icon: NotebookTabs },
  { label: "专注", to: "/focus", icon: Timer },
]

export function PrimaryNav({ variant }: PrimaryNavProps) {
  const items = variant === "rail" ? [...primaryItems, { label: "设置", to: "/settings", icon: Settings }] : primaryItems

  return (
    <nav className={`${styles.navigation} ${styles[variant]}`} aria-label="主导航">
      {items.map(({ label, to, icon: Icon, end }) => (
        <NavLink
          className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
          end={end}
          key={to}
          to={to}
        >
          <Icon aria-hidden="true" size={20} strokeWidth={2} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
