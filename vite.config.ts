import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    // Allow Cloudflare quick-tunnel hostnames (browser verification
    // reaches the app through *.trycloudflare.com).
    allowedHosts: ['.trycloudflare.com', '.cfargotunnel.com'],
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com', '.cfargotunnel.com'],
  },
})
