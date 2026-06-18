import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      DB_PATH: ':memory:',
      DB_DROP_SCHEMA: 'true',
      DB_SYNCHRONIZE: 'true',
      WORKER_POLL_INTERVAL_MS: '1',
    },
  },
});
