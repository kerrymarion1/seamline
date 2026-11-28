import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/fredoka' // the Hugpix wordmark
import '@fontsource/instrument-serif'
import '@fontsource/instrument-serif/400-italic.css'
// For the seasonal greetings (see SEASONS in lib/theme.js).
import '@fontsource/creepster'
import '@fontsource/mountains-of-christmas/700.css'
import '@fontsource/lobster'
import '@fontsource/mr-dafoe' // the signature at the foot of the welcome page
import '@fontsource-variable/fraunces'
import '@fontsource-variable/space-grotesk'
import '@fontsource/bebas-neue'
import '@fontsource-variable/caveat'
import '@fontsource/dm-mono'
import './styles.css'
import './lib/theme'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { unlockAudio } from './lib/chime'
import { startPersistence } from './lib/persist'
import { registerSW } from 'virtual:pwa-register'

startPersistence()

// With automatic updates on, this reloads the page once when a newly
// published version has finished downloading.
registerSW({ immediate: true })

// iOS Safari ignores the viewport zoom lock; stop page pinch-zoom here.
document.addEventListener('gesturestart', (e) => e.preventDefault())

// The message chime may only sound once the page has been touched.
document.addEventListener('pointerdown', unlockAudio, { passive: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
