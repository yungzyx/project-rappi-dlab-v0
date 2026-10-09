import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: { port: 5176 },
  build: { rollupOptions: { input: 'juego-verticales.html' } },
  // Hora de Chile en las pruebas: así «fecha local, no UTC» se prueba de verdad (CI corre en UTC).
  test: { environment: 'jsdom', env: { TZ: 'America/Santiago' } },
})
