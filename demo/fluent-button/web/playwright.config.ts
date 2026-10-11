import { defineConfig } from '@playwright/test'
import { readFileSync } from 'node:fs'

const version = (name: string) => JSON.parse(readFileSync(new URL(`node_modules/${name}/package.json`, import.meta.url), 'utf8')).version as string

// CIVIC_REPORT records the run as evidence; without it the run only checks.
const report = process.env.CIVIC_REPORT
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  reporter: report ? [['list'], ['json', { outputFile: report }]] : [['list']],
  // The report's metadata names the exact revision the run proves, so the importer can tie
  // each result to it (spec: Evidence integrity).
  metadata: { 'civic.revision': `@fluentui/react-components@${version('@fluentui/react-components')}`, 'civic.tool': 'playwright' },
  use: {
    browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
})
