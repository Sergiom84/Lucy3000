import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { setupRendererLogging } from './utils/logging'

setupRendererLogging()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Registro del service worker solo en el canal web/PWA servido por HTTP(S).
// En el wrapper Electron (protocolo file:) y en desarrollo no se registra.
if (
  import.meta.env.PROD &&
  'serviceWorker' in navigator &&
  window.location.protocol.startsWith('http')
) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin SW la app sigue funcionando; solo se pierde la instalacion PWA.
    })
  })
}

