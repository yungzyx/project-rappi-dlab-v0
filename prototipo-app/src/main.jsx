import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/figtree'
import './styles/tokens.css'
import './styles/global.css'
import App from './App.jsx'
import ConnectionGate from './components/ConnectionGate.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConnectionGate>
      <App />
    </ConnectionGate>
  </StrictMode>,
)
