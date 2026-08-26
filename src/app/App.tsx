import { BrowserRouter } from "react-router-dom"
import { AppRoutes } from "@/app/AppRoutes"
import { LocalDataBootstrap } from "@/app/LocalDataBootstrap"

export function App() {
  return (
    <div role="application" aria-label="Velo">
      <BrowserRouter>
        <LocalDataBootstrap>
          <AppRoutes />
        </LocalDataBootstrap>
      </BrowserRouter>
    </div>
  )
}
