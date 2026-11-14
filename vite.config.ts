import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Worker (wrangler dev, port 8787) serves /api during local development.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
