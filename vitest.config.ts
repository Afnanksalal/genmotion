import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    exclude: ['tests/e2e/**', '**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli.ts',
        'src/mcp.ts',
        'src/index.ts',
        'src/version.ts',
        'src/**/types.ts',
        'src/engine/worker.ts',
        'src/agent/runtime.ts',
      ],
      thresholds: { lines: 75, functions: 75, statements: 75, branches: 65 },
    },
  },
});
