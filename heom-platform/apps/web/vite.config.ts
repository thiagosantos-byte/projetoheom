import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const projectEnvDirectory = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectEnvDirectory, '');
  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins: [react()],
    define: {
      'import.meta.env.VITE_HEOM_MODE': JSON.stringify('demo'),
      'import.meta.env.VITE_HEOM_WS': JSON.stringify('false')
    },
    server: {
      host: env.VITE_DEV_HOST || '127.0.0.1',
      port: 5173,
      strictPort: true
    },
    build: { outDir: 'dist', emptyOutDir: true }
  };
});
