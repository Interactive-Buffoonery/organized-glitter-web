import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const generatedTestArtifacts = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.tmp/**',
  '**/coverage/**',
  '**/playwright-report/**',
  '**/test-results/**',
  '**/.worktrees/**',
  '**/cypress/**',
  '**/.{idea,git,cache,output,temp}/**',
  '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
  'e2e/**',
  'blog/test/**',
];

const nodeTestFiles = [
  'api/**/*.{test,spec}.{js,mjs,cjs,ts}',
  'pb_hooks/**/*.{test,spec}.{js,mjs,cjs,ts}',
  'scripts/**/*.{test,spec}.{js,mjs,cjs,ts}',
  'server/**/*.{test,spec}.{js,mjs,cjs,ts}',
  'spacefast/**/*.{test,spec}.{js,mjs,cjs,ts}',
  'test/pb-hooks/**/*.test.js',
  'test/vitest-config.test.ts',
];

const scriptDomTestFiles = [
  'scripts/__tests__/app-icon-links.test.mjs',
  'scripts/__tests__/axe-readiness.test.ts',
];

const nodeTestsUnderDomRoots = ['test/pb-hooks/**/*.test.js', 'test/vitest-config.test.ts'];

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,

    pool: 'threads',
    fileParallelism: true,
    maxWorkers: 4,
    isolate: true,

    testTimeout: 10000,
    hookTimeout: 5000,
    teardownTimeout: 1000,

    bail: 0,
    retry: 0,

    coverage: {
      enabled: false,
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

    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.tmp/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.worktrees/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'e2e/**',
      'blog/test/**',
    ],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: nodeTestFiles,
          exclude: [...generatedTestArtifacts, ...scriptDomTestFiles],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./test/setup.ts'],
          include: [
            'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
            'test/**/*.{test,spec}.{js,jsx,ts,tsx}',
            ...scriptDomTestFiles,
          ],
          exclude: [...generatedTestArtifacts, ...nodeTestsUnderDomRoots],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      'virtual:pwa-register': resolve(__dirname, './test/mocks/virtual-pwa-register.ts'),
    },
  },
});
