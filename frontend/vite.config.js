import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * In development the app talks to the Java gateway, exactly as it does in
 * production — so CORS, cookies and the panel redirects behave the same here
 * as they will on the server.
 */
const GATEWAY = process.env.GATEWAY_URL || 'http://127.0.0.1:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: GATEWAY, changeOrigin: true },
      '/media': { target: GATEWAY, changeOrigin: true },
      '/static': { target: GATEWAY, changeOrigin: true },
      '/qr': { target: GATEWAY, changeOrigin: true },
      '/adminpanel': { target: GATEWAY, changeOrigin: true },
      '/superadminpanel': { target: GATEWAY, changeOrigin: true },
      '/analytics': { target: GATEWAY, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // The whole site is a handful of pages; one bundle loads faster than
    // several round trips.
    chunkSizeWarningLimit: 700,
  },
});
