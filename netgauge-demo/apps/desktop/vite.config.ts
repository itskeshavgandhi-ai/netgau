import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react(), tailwindcss()],
  // @netgauge/core ships TypeScript source; keep it out of dep pre-bundling.
  optimizeDeps: { exclude: ['@netgauge/core'] },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Allow the sandboxed preview host (and any local origin) to load the app.
    allowedHosts: true,
    cors: true,
    // Lets the renderer's built-in speed test hit a local NetGauge server.
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'build/renderer',
    emptyOutDir: true,
    target: 'chrome126',
    sourcemap: false,
  },
});
