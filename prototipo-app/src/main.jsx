import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/figtree'
import './styles/tokens.css'
import './styles/global.css'
import App from './App.jsx'
import ConnectionGate from './components/ConnectionGate.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { reloadOnPreloadError } from './preloadError.js'

reloadOnPreloadError()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary variant="root">
      <ConnectionGate>
        <App />
      </ConnectionGate>
    </ErrorBoundary>
  </StrictMode>,
)
