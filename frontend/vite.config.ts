import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      '/stream': 'http://localhost:5001',
      '/command': 'http://localhost:5001',
      '/scenario': 'http://localhost:5001',
    }
  }
})
