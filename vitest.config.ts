import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/database.ts'],
    testTimeout: 60000, // 60 seconds for container startup
    hookTimeout: 120000, // 2 minutes for beforeAll/afterAll
  },
});

