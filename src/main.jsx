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
import App from './App'
import { startPersistence } from './lib/persist'

startPersistence()

// iOS Safari ignores the viewport zoom lock; stop page pinch-zoom here.
document.addEventListener('gesturestart', (e) => e.preventDefault())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
