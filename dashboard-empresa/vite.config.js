import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Bajo una subruta (p. ej. PANEL_BASE=/panel/ detrás de un proxy); por defecto, la raíz.
  base: process.env.PANEL_BASE ?? '/',
  plugins: [react()],
  server: { port: 5175 },
  // Dos páginas: el panel (index.html) y la presentación estática (presentacion.html).
  build: { rollupOptions: { input: { panel: 'index.html', presentacion: 'presentacion.html' } } },
  test: {
    environment: 'jsdom',
  },
})
