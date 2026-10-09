import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/figtree'
import App from './App.jsx'

// El marco del teléfono (874 px de alto) se achica para caber en pantallas de escritorio más bajas.
const fit = () =>
  document.documentElement.style.setProperty('--phone-scale', String(Math.min(1, (window.innerHeight - 40) / 874)))
fit()
window.addEventListener('resize', fit)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
