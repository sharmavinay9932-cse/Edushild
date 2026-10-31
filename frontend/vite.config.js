import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const frontendDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  server: {
    port: 5173,
    fs: {
      allow: [frontendDirectory],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
