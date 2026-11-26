import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const projectEnvDirectory = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectEnvDirectory, '');
  return {
    plugins: [react()],
    server: {
      // A demonstração local não deve expor a entrada rápida de perfis na LAN.
      // O script institucional define VITE_DEV_HOST=0.0.0.0 para acesso cabeado.
      host: env.VITE_DEV_HOST || '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
        '/ws': { target: 'ws://127.0.0.1:4000', ws: true }
      }
    }
  };
});
