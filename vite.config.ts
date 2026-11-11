import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: `http://127.0.0.1:${loadEnv(mode, process.cwd(), '').PORT || '3001'}`, changeOrigin: true, timeout: 0, proxyTimeout: 0 } } },
}));
