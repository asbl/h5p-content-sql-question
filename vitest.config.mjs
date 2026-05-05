import { defineConfig } from 'vitest/config';

export default defineConfig({
  assetsInclude: ['**/*.db'],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});