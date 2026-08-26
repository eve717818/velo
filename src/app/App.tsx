import { BrowserRouter } from "react-router-dom"
import { AppRoutes } from "@/app/AppRoutes"
import { LocalDataBootstrap } from "@/app/LocalDataBootstrap"
import { MotionProvider } from "@/app/MotionProvider"
import { VELO_BUILD_ID } from "@/app/build-id"
import { RegisterPWA } from "@/pwa/RegisterPWA"

export function App() {
  return (
    <div data-app-name="Velo" data-build-id={VELO_BUILD_ID}>
      <MotionProvider>
        <BrowserRouter>
          <LocalDataBootstrap>
            <AppRoutes />
          </LocalDataBootstrap>
        </BrowserRouter>
      </MotionProvider>
      <RegisterPWA />
    </div>
  )
}
