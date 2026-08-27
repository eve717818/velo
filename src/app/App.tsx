import { useEffect, useState } from "react"
import { BrowserRouter } from "react-router-dom"
import { AppRoutes } from "@/app/AppRoutes"
import { LocalDataBootstrap } from "@/app/LocalDataBootstrap"
import { MotionProvider } from "@/app/MotionProvider"
import { VELO_BUILD_ID } from "@/app/build-id"
import { RegisterPWA } from "@/pwa/RegisterPWA"
import { LaunchScreen } from "./LaunchScreen"

const LAUNCH_SESSION_KEY = "velo:launch-seen"

function shouldShowLaunchScreen() {
  try {
    return sessionStorage.getItem(LAUNCH_SESSION_KEY) !== "1"
  } catch {
    return true
  }
}

export function App() {
  const [showLaunchScreen, setShowLaunchScreen] = useState(shouldShowLaunchScreen)

  useEffect(() => {
    if (!showLaunchScreen) return undefined

    try {
      sessionStorage.setItem(LAUNCH_SESSION_KEY, "1")
    } catch {
      // The launch experience remains available when session storage is restricted.
    }

    const timeout = window.setTimeout(() => setShowLaunchScreen(false), 1800)
    return () => window.clearTimeout(timeout)
  }, [showLaunchScreen])

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
      {showLaunchScreen ? <LaunchScreen /> : null}
    </div>
  )
}
