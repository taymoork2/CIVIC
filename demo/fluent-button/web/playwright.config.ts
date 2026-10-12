import { defineConfig } from '@playwright/test'
import { readFileSync } from 'node:fs'

const version = (name: string) => JSON.parse(readFileSync(new URL(`node_modules/${name}/package.json`, import.meta.url), 'utf8')).version as string

// CIVIC_REPORT records the run as evidence; without it the run only checks. Either way the
// CIVIC reporter (roadmap step 10) ends the run by comparing it with the demo's graph: what
// now fails that passed, and which subjects the run left uncovered.
const report = process.env.CIVIC_REPORT
const civic = ['../../../importers/src/playwright-reporter.ts', { graph: '../out/resolved.graph.json', platform: 'web' }] as const
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  reporter: report ? [['list'], ['json', { outputFile: report }], civic] : [['list'], civic],
  // The report's metadata names the exact revision the run proves, so the importer can tie
  // each result to it (spec: Evidence integrity).
  metadata: { 'civic.revision': `@fluentui/react-components@${version('@fluentui/react-components')}`, 'civic.tool': 'playwright' },
  // Fluent's own Button stories, built by `pnpm run storybook:build` (e2e/storybook.spec.ts).
  webServer: { command: 'node serve-storybook.mjs', url: 'http://127.0.0.1:6106/index.json', reuseExistingServer: false },
  use: {
    baseURL: 'http://127.0.0.1:6106',
    browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
})
