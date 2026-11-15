import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
  build: { target: 'es2022', sourcemap: true },
});