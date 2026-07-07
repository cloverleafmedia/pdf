import { defineConfig } from 'vitest/config'

// Kept separate from vitest.config.js (the fast, offline unit-test suite) -
// these tests launch a real Vite dev server + Electron window via Playwright
// (see e2e/helpers.js), so they're slow and must never run as part of the
// default `npm run test`. Invoke explicitly via `npm run test:e2e`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
