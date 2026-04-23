import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "localhost",
    port: 5174,
    strictPort: true,
    origin: "http://localhost:5174",
    cors: {
      origin: [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5176",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5176"
      ],
      credentials: true
    },
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 5174,
      clientPort: 5174
    },
    proxy: {
      "/api": {
        target: "http://localhost:5002",
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
