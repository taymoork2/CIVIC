import { defineConfig } from '@playwright/test'

// Runs against an already-running app: locally `vite dev` plus the local Convex backend,
// or a deployed preview/staging URL through WASHCLOSET_E2E_BASE_URL.
// Indexed design specimens deliberately do not ship in the production build.
const previewSpecs = process.env.WASHCLOSET_E2E_BUILD === 'production' ? ['**/drying-preview.spec.ts', '**/a8-preview.spec.ts'] : []
const demoAccountSpecs = ['**/polish.spec.ts', '**/item-routing.spec.ts']

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Files run in parallel; tests inside a file stay in order because they often share state.
  fullyParallel: false,
  // ponytail: 3 workers; 4 is the ceiling (the machine has crashed from memory pressure).
  workers: 3,
  // A first visit can outwait a timeout while the dev server compiles for three browsers; one retry
  // passes it, and the quiet runner still names every retried test as flaky.
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.WASHCLOSET_E2E_BASE_URL ?? 'http://localhost:3000',
    browserName: process.env.WASHCLOSET_E2E_BROWSER === 'webkit' ? 'webkit' : 'chromium',
    channel: process.env.WASHCLOSET_E2E_BROWSER === 'webkit' ? undefined : process.env.WASHCLOSET_E2E_CHANNEL ?? 'chrome',
    actionTimeout: 15_000,
    // A metric locale keeps label text (ml, °C) stable; units.test.ts covers US units.
    locale: 'en-GB',
    headless: true,
    trace: 'retain-on-failure',
  },
  // These files sign in as the shared demo fixture account and mutate it, so they run one at a time.
  projects: [
    { name: 'isolated', testIgnore: [...previewSpecs, ...demoAccountSpecs] },
    { name: 'demo-account', testMatch: demoAccountSpecs, workers: 1 },
  ],
})
