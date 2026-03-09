import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/battleship/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
  },
})
