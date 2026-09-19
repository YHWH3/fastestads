import { defineConfig } from 'vitest/config';

// Runs only after `pnpm build` — asserts on dist/ output.
export default defineConfig({
  test: {
    include: ['tests/build/**/*.test.ts'],
    environment: 'node',
  },
});
