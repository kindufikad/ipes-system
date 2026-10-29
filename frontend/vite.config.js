import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    watch: {
      usePolling: true,
      interval: 100,
    },
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5005',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:5005',
        changeOrigin: true,
        ws: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:5005',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  }
});