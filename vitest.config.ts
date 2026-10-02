import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true,

    // Optimized for speed with test isolation
    pool: 'threads',
    fileParallelism: false,
    isolate: true, // Ensure proper test isolation

    // Fast execution settings
    testTimeout: 10000, // 10 seconds max per test
    hookTimeout: 5000, // 5 seconds max for setup/teardown
    teardownTimeout: 1000,

    // Improved error handling
    bail: 0, // Don't bail on first failure - see all issues
    retry: 0, // No retries - tests should be deterministic

    // Minimal coverage for essential files only
    coverage: {
      enabled: false, // Disable by default for speed
      reporter: ['text'],
      include: [
        'src/components/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
        'src/services/**/*.{ts,tsx}',
        'src/utils/**/*.{ts,tsx}',
      ],
      exclude: ['**/__tests__/**', '**/*.test.*', '**/test-utils/**', 'src/types/**', '**/*.d.ts'],
      thresholds: {
        lines: 10,
        functions: 10,
        branches: 10,
        statements: 10,
      },
    },

    // Exclude problematic test patterns
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.worktrees/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      // Playwright specs live in `e2e/` and use a different runtime than
      // vitest; they are invoked via `npx playwright test`, not `vitest`.
      'e2e/**',
      'blog/test/**',
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      'virtual:pwa-register': resolve(__dirname, './test/mocks/virtual-pwa-register.ts'),
    },
  },
});
