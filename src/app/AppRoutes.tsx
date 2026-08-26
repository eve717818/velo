import { Route, Routes } from "react-router-dom"
import { AppShell } from "@/app/AppShell"
import { HomePage } from "@/features/home/HomePage"
import { FocusPage } from "@/pages/FocusPage"
import { NotesPage } from "@/pages/NotesPage"
import { PlansPage } from "@/pages/PlansPage"
import { SettingsPage } from "@/pages/SettingsPage"

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="notes" element={<NotesPage />} />
        <Route path="focus" element={<FocusPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
