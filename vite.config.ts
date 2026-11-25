import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    target: 'es2022',
    sourcemap: false,
    // screens are React.lazy chunks; Vite splits them (and what only they use, e.g. charts, markdown) by itself
  },
  server: { port: 5173 },
  test: { environment: 'jsdom', globals: true, setupFiles: ['src/test/setup.ts'] },
});
