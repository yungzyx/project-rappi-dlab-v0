import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { AGENT_NAME } from './src/agent/name.js'

// El título y la descripción de index.html llevan el nombre del agente desde la misma constante que la app.
const agentName = {
  name: 'agent-name',
  transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%AGENT_NAME%', AGENT_NAME) },
}

export default defineConfig({
  plugins: [react(), agentName],
  server: { port: 5174 },
  // Sin imágenes embebidas en base64: los recortes pequeños inflaban el JS a ~500 kB.
  build: { assetsInlineLimit: 0 },
  // Hora de Chile en las pruebas: la misión del día y la racha del juego usan la fecha local (CI corre en UTC).
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    env: { TZ: 'America/Santiago' },
  },
})
