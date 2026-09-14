import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Tests import the workspace package by name, exactly like the apps do.
      '@netgauge/core': r('./packages/core/src/index.ts'),
      // The desktop app imports `electron` in its main-process modules; there is no
      // Electron binary in CI sandboxes, so tests stub the surface they use.
      electron: r('./apps/desktop/test/__mocks__/electron.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'apps/*/test/**/*.test.tsx'],
    reporters: ['dot'],
  },
});
