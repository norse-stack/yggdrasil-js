import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use 'node' environment by default (no jsdom)
    // For DOM tests, install jsdom and use: // @vitest-environment jsdom
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/*.ts'],
    exclude: ['node_modules', 'dist'],
    globals: true,
  },
});
