import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const localApiHost = env.VITE_LOCAL_API_HOST || 'localhost'
  const localApiPort = env.VITE_LOCAL_API_PORT || '5004'
  const proxyTarget = env.VITE_API_PROXY_TARGET || `http://${localApiHost}:${localApiPort}`

  return {
    base: "/",   // ✅🔥 ADD THIS LINE (VERY IMPORTANT)

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
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        }
      }
    }
  }
})