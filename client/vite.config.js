import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [clientRoot, path.resolve(clientRoot, '../shared')],
    },
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
