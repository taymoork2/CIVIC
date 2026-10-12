#!/usr/bin/env node
// Captures Laundry's real inputs for its CIVIC graph (roadmap step 9): the journey engine's
// review index, and a Playwright JSON report from the browser specs the index declares as
// its scenarios' checks. Laundry's suite runs unchanged; nothing is added to it.
//
// Start a review server first, from journey-engine/source:  pnpm --dir apps/web run review
// Then, from the repository root:                    node projects/laundry/capture.ts [base URL]
//
// The base URL defaults to http://127.0.0.1:3010. The report is stamped with the commit the
// review server read, so a dirty journey-engine/source tree is refused: the evidence would
// describe code no commit holds. Then run `node projects/laundry/build.ts` to rebuild out/.

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:3010'
const root = new URL('../../', import.meta.url).pathname
const web = join(root, 'journey-engine/source/apps/web')
const inputs = new URL('inputs/', import.meta.url).pathname
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()

if (git('status', '--porcelain', '--', 'journey-engine/source')) throw new Error('journey-engine/source has uncommitted changes; commit them so the evidence names a real revision.')

// The review server sets its session cookie on the workspace page and serves the index behind it.
const page = await fetch(`${base}/review.html`)
const cookie = page.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
const response = await fetch(`${base}/api/review/index`, { headers: { cookie } })
if (!response.ok) throw new Error(`The review server answered ${response.status}: ${await response.text()}`)
const index = (await response.json()) as {
  revision: { head: string; source: string }
  project: { id: string; name: string }
  scenarios: { id: string; label: string; journey: string; renderer?: string; component?: string; checks?: string[]; edges?: unknown[] }[]
  routeActions?: Record<string, unknown>[]
}
if (index.revision.head !== git('rev-parse', 'HEAD')) throw new Error(`The review server read ${index.revision.head}, but HEAD is ${git('rev-parse', 'HEAD')}. Restart it.`)

// Only what the importer reads, in a stable shape, so a recapture shows up as a reviewable diff.
const pick = <T extends Record<string, unknown>>(value: T, keys: string[]) => Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]))
writeFileSync(join(inputs, 'review-index.json'), JSON.stringify({
  revision: { head: index.revision.head, source: index.revision.source },
  project: { id: index.project.id, name: index.project.name },
  scenarios: index.scenarios.map((scenario) => pick(scenario, ['id', 'label', 'journey', 'renderer', 'component', 'checks', 'edges'])),
  routeActions: (index.routeActions ?? []).map((action) => pick(action, ['from', 'action', 'destination', 'route', 'when', 'returnTo', 'source', 'anchor'])),
}, null, 2) + '\n')

// The browser specs the scenarios name as their checks. Unit tests (vitest) are not Playwright runs.
const specs = [...new Set(index.scenarios.flatMap((scenario) => scenario.checks ?? []))].filter((check) => /^apps\/web\/e2e\/.+\.spec\.ts$/.test(check)).sort()
const scratch = mkdtempSync(join(tmpdir(), 'civic-laundry-'))
try {
  const report = join(scratch, 'report.json')
  const run = spawnSync(join(web, 'node_modules/.bin/playwright'), ['test', ...specs.map((spec) => spec.replace(/^apps\/web\//, '')), '--project=isolated', '--workers=1', '--reporter=json'], {
    cwd: web,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, WASHCLOSET_REVIEW_E2E: '1', WASHCLOSET_E2E_BASE_URL: base, PLAYWRIGHT_JSON_OUTPUT_FILE: report },
  })
  const raw = JSON.parse(readFileSync(report, 'utf8')) as { suites: Suite[]; stats: Record<string, unknown> }
  // Keep results and errors; drop attachments, output and absolute paths, which are about this machine.
  const clean = (suite: Suite): Suite => ({
    title: suite.title,
    file: suite.file,
    ...(suite.specs ? { specs: suite.specs.map((spec) => ({ title: spec.title, file: spec.file, line: spec.line, tests: spec.tests.map((test) => ({ annotations: test.annotations, status: test.status, results: test.results.map((result) => ({ status: result.status, startTime: result.startTime, duration: result.duration, retry: result.retry, ...(result.errors?.length ? { errors: result.errors.map((error) => ({ message: error.message?.replace(/\x1b\[[0-9;]*m/g, '').replaceAll(root, '') })) } : {}) })) })) })) } : {}),
    ...(suite.suites ? { suites: suite.suites.map(clean) } : {}),
  })
  writeFileSync(join(inputs, 'playwright-report.json'), JSON.stringify({
    config: { metadata: { 'civic.revision': index.revision.head, 'civic.tool': 'playwright' } },
    suites: raw.suites.map(clean),
    stats: raw.stats,
  }, null, 2) + '\n')
  console.log(`Captured ${index.scenarios.length} scenarios and ${specs.length} spec files at ${index.revision.head.slice(0, 12)}: ${JSON.stringify(raw.stats)}`)
  if (run.status !== 0) console.log('Some tests failed. That is evidence too: the graph records them as failing.')
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

interface Suite {
  title: string
  file: string
  specs?: { title: string; file: string; line: number; tests: { annotations: unknown[]; status: string; results: { status: string; startTime: string; duration: number; retry: number; errors?: { message?: string }[] }[] }[] }[]
  suites?: Suite[]
}
