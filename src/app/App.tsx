import { useEffect, useState } from "react"
import { BrowserRouter } from "react-router-dom"
import { AppRoutes } from "@/app/AppRoutes"
import { LocalDataBootstrap } from "@/app/LocalDataBootstrap"
import { MotionProvider } from "@/app/MotionProvider"
import { VELO_BUILD_ID } from "@/app/build-id"
import { RegisterPWA } from "@/pwa/RegisterPWA"
import { LaunchScreen } from "./LaunchScreen"

const ONBOARDING_COMPLETE_KEY = "velow-notebook:onboarding-complete"

function shouldShowLaunchScreen() {
  if (new URLSearchParams(window.location.search).get("launch") === "1") return true
  try {
    return localStorage.getItem(ONBOARDING_COMPLETE_KEY) !== "1"
  } catch {
    return true
  }
}

export function App() {
  const [showLaunchScreen, setShowLaunchScreen] = useState(shouldShowLaunchScreen)

  useEffect(() => {
    if (!showLaunchScreen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showLaunchScreen])

  function completeOnboarding() {
    try {
      localStorage.setItem(ONBOARDING_COMPLETE_KEY, "1")
    } catch {
      // The welcome screen remains available when persistent storage is restricted.
    }
    setShowLaunchScreen(false)
  }

  return (
    <div data-app-name="Velow Notebook" data-build-id={VELO_BUILD_ID}>
      <MotionProvider>
        <BrowserRouter>
          <LocalDataBootstrap>
            <AppRoutes />
          </LocalDataBootstrap>
        </BrowserRouter>
      </MotionProvider>
      <RegisterPWA />
      {showLaunchScreen ? <LaunchScreen onComplete={completeOnboarding} /> : null}
    </div>
  )
}
