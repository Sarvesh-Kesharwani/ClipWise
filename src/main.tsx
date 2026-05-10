import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import './dashboard.css'
import './pages.css'
import './theme-overrides.css'
import App from './App'
import { applyTheme, resolveInitialTheme } from './utils/theme'

// Apply persisted theme synchronously before React renders to prevent
// a flash of the wrong theme on initial paint.
applyTheme(resolveInitialTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
)
