import { useRegisterSW } from "virtual:pwa-register/react"
import { PWAUpdatePrompt } from "./PWAUpdatePrompt"

export function RegisterPWA() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <PWAUpdatePrompt
      needRefresh={needRefresh}
      offlineReady={offlineReady}
      onClose={close}
      onReload={() => void updateServiceWorker(true)}
    />
  )
}
