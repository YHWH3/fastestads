import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Live smoke against the real Jev API — run via `pnpm live:jev` (LIVE_JEV=1).
export default defineConfig({
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@server': fileURLToPath(new URL('./src/server', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
    },
  },
  test: {
    include: ['tests/live/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
