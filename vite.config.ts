import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Only PORT is read here (server-side, in Node). No variable is exposed to
  // the browser bundle; the Kedy API key never leaves the backend.
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.PORT || '3001';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.{ts,tsx}'],
    },
  };
});
