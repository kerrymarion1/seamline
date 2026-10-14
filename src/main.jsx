import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/instrument-sans'
import '@fontsource/instrument-serif'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/space-grotesk'
import '@fontsource/bebas-neue'
import '@fontsource-variable/caveat'
import '@fontsource/dm-mono'
import './styles.css'
import './lib/theme'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { startPersistence } from './lib/persist'
import { registerSW } from 'virtual:pwa-register'

startPersistence()

// With automatic updates on, this reloads the page once when a newly
// published version has finished downloading.
registerSW({ immediate: true })

// iOS Safari ignores the viewport zoom lock; stop page pinch-zoom here.
document.addEventListener('gesturestart', (e) => e.preventDefault())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
