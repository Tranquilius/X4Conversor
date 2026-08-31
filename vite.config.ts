import { defineConfig } from 'vite';

export default defineConfig({
  base: '/X4Conversor/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
});
