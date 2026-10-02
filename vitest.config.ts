import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('./src/index.ts', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**'],
    },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.{ts,tsx}'] },
      },
      {
        // The parity suite runs the same tests against this library...
        extends: true,
        test: { name: 'parity:compat', include: ['parity/**/*.test.{ts,tsx}'] },
        resolve: { alias: { 'recoil-under-test': src } },
      },
      {
        // ...and against the real Recoil, to prove identical behaviour.
        extends: true,
        test: { name: 'parity:recoil', include: ['parity/**/*.test.{ts,tsx}'] },
        resolve: { alias: { 'recoil-under-test': 'recoil' } },
      },
    ],
  },
  resolve: {
    conditions: ['browser'],
  },
});
