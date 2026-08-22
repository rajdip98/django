import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps every asset reference relative, so the built `dist/` folder
// works when dropped into any directory on any host (public_html, a subfolder,
// GitHub Pages, S3, a file:// double-click). Combined with hash routing this
// means zero server configuration is required to host the app.
export default defineConfig(({ mode }) => {
  // '.' resolves relative to the project root Vite was started in — avoids
  // needing @types/node just to read process.cwd().
  const env = loadEnv(mode, '.', 'VITE_');

  return {
    base: './',
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Keep chunks predictable and cache-friendly for the service worker.
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            leaflet: ['leaflet'],
          },
        },
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: env.VITE_DEV_API ?? 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
