import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
  // Dos páginas: el panel (index.html) y la presentación estática (presentacion.html).
  build: { rollupOptions: { input: { panel: 'index.html', presentacion: 'presentacion.html' } } },
  test: {
    environment: 'jsdom',
  },
})
