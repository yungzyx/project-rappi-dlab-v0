import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  // Sin imágenes embebidas en base64: los recortes pequeños inflaban el JS a ~500 kB.
  build: { assetsInlineLimit: 0 },
  test: {
    environment: 'jsdom',
  },
})
