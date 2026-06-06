import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function usePwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isServiceWorkerReady, setIsServiceWorkerReady] = useState(false)

  const isSupportedContext = useMemo(
    () =>
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]',
    []
  )

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    setIsStandalone(standalone)

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsStandalone(true)
      toast.success('Lucy3000 instalada')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    const shouldWaitForServiceWorker = import.meta.env.PROD && 'serviceWorker' in navigator && isSupportedContext

    if (shouldWaitForServiceWorker) {
      void navigator.serviceWorker.ready
        .then(() => setIsServiceWorkerReady(true))
        .catch(() => setIsServiceWorkerReady(false))
    } else {
      setIsServiceWorkerReady(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [isSupportedContext])

  const install = async () => {
    if (isStandalone) {
      toast.success('Lucy3000 ya esta instalada')
      return false
    }

    if (!isSupportedContext) {
      toast('Abre Lucy3000 desde HTTPS para instalarla como app')
      return false
    }

    if (!installPrompt) {
      if ('serviceWorker' in navigator && !isServiceWorkerReady) {
        toast('Preparando instalacion. Espera unos segundos o recarga la pagina')
        return false
      }

      toast('Pulsa el icono de instalacion en la barra del navegador')
      return false
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)

    if (choice.outcome === 'accepted') {
      toast.success('Instalando Lucy3000')
      return true
    }

    return false
  }

  return {
    canPromptInstall: Boolean(installPrompt),
    install,
    isStandalone,
    isServiceWorkerReady,
    isSupportedContext
  }
}
