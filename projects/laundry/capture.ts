#!/usr/bin/env node
// Captures Laundry's real inputs for its CIVIC graph (roadmap step 9) from a Laundry checkout (decision 0010,
// step 5): its review index and coverage contract, a Playwright JSON report from the browser specs the index
// declares as its scenarios' checks, and the few source facts build.ts reads. Laundry's suite runs unchanged in
// its own checkout; nothing is added to it.
//
// Start Laundry's review server first, in the checkout:  pnpm --dir apps/web review
// Then, from this repository's root:                    node projects/laundry/capture.ts --checkout <path> [base URL]
//
// The checkout defaults to $LAUNDRY_CHECKOUT and the base URL to http://127.0.0.1:3010. Every input is stamped
// with the checkout's commit, so a dirty checkout is refused: the evidence would describe code no commit holds.
// Then run `node projects/laundry/build.ts` to rebuild out/.

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { Store, type StoredReplay } from '../../review/src/index.ts'

const { values, positionals } = parseArgs({ options: { checkout: { type: 'string' } }, allowPositionals: true })
const base = positionals[0] ?? 'http://127.0.0.1:3010'
const given = values.checkout ?? process.env.LAUNDRY_CHECKOUT
if (!given) throw new Error('Name a Laundry checkout: --checkout <path>, or set LAUNDRY_CHECKOUT.')
const checkout = resolve(given)
const web = join(checkout, 'apps/web')
if (!existsSync(join(checkout, 'civic.project.json')) || !existsSync(web)) throw new Error(`${checkout} is not a Laundry checkout with CIVIC review (no civic.project.json or apps/web).`)
const inputs = new URL('inputs/', import.meta.url).pathname
const COVERAGE = 'docs/design/review-product/coverage.json'
const TOKENS = 'apps/web/src/generated/tokens.css'
const SOURCE = 'apps/web/src'
const git = (...args: string[]) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim()

if (git('status', '--porcelain')) throw new Error(`${checkout} has uncommitted changes; commit them so the evidence names a real revision.`)
const head = git('rev-parse', 'HEAD')

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
if (index.revision.head !== head) throw new Error(`The review server read ${index.revision.head}, but the checkout's HEAD is ${head}. Start it from ${checkout} at HEAD.`)

// Only what the importer reads, in a stable shape, so a recapture shows up as a reviewable diff.
const pick = <T extends Record<string, unknown>>(value: T, keys: string[]) => Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]))
writeFileSync(join(inputs, 'review-index.json'), JSON.stringify({
  revision: { head: index.revision.head, source: index.revision.source },
  project: { id: index.project.id, name: index.project.name },
  scenarios: index.scenarios.map((scenario) => pick(scenario, ['id', 'label', 'journey', 'renderer', 'component', 'checks', 'edges'])),
  routeActions: (index.routeActions ?? []).map((action) => pick(action, ['from', 'action', 'destination', 'route', 'when', 'returnTo', 'source', 'anchor'])),
}, null, 2) + '\n')

// Recorded runs replayed at this commit (decision 0009): run evidence a person kept from the canvas.
const replays = await fetch(`${base}/api/review/replays`, { headers: { cookie } })
if (!replays.ok) throw new Error(`The review server answered ${replays.status} for replays: ${await replays.text()}`)
// Replays others shared through civic sync count too; the same replay kept on both sides counts once.
// Each checkout's project key is the manifest ID and a hash of where it is, so match the ID.
const store = Store.forCommonDir(resolve(checkout, git('rev-parse', '--git-common-dir')))
const shared = store.replays().filter((replay) => replay.project.startsWith(`${index.project.id}-`))
const atHead = [...new Map([...((await replays.json()) as StoredReplay[]), ...shared].filter((replay) => replay.head === index.revision.head).map((replay) => [JSON.stringify(replay), replay])).values()]
writeFileSync(join(inputs, 'replays.json'), JSON.stringify(atHead.sort((a, b) => a.tape.localeCompare(b.tape) || a.replayedAt.localeCompare(b.replayedAt)), null, 2) + '\n')
// Each replayed tape by its SHA-256, for the story portal's replay player (decision 0013): from the review
// server when it serves tapes, else from the shared store. A tape neither has is left out, and its replay stays
// evidence without a player.
rmSync(join(inputs, 'tapes'), { recursive: true, force: true })
for (const sha of new Set(atHead.map((replay) => replay.tape))) {
  const served = await fetch(`${base}/api/review/replays/tapes/${sha}`, { headers: { cookie } })
  const bytes = served.ok ? Buffer.from(await served.arrayBuffer()) : store.readTape(sha)
  if (!bytes) {
    console.warn(`No tape ${sha.slice(0, 12)} on the review server or in the shared store; its replay gets no player.`)
    continue
  }
  if (createHash('sha256').update(bytes).digest('hex') !== sha) throw new Error(`Tape ${sha.slice(0, 12)} doesn't match its SHA-256.`)
  mkdirSync(join(inputs, 'tapes'), { recursive: true })
  writeFileSync(join(inputs, 'tapes', `${sha}.json`), bytes)
}

// The coverage contract at the same commit: what Laundry declares must be shown and proven.
writeFileSync(join(inputs, 'coverage.json'), readFileSync(join(checkout, COVERAGE), 'utf8'))

// The browser specs the scenarios name as their checks. Unit tests (vitest) are not Playwright runs.
const specs = [...new Set(index.scenarios.flatMap((scenario) => scenario.checks ?? []))].filter((check) => /^apps\/web\/e2e\/.+\.spec\.ts$/.test(check)).sort()
const scratch = mkdtempSync(join(tmpdir(), 'civic-laundry-'))
try {
  const report = join(scratch, 'report.json')
  // Each test's progress prints as it runs; the JSON report goes to its file. Bounded: Playwright stops the run
  // after 25 minutes, and the process is killed a minute after that if it has not exited.
  // Laundry's config runs Chrome. CIVIC_BROWSER_PATH names another Chromium instead, through a config outside the
  // checkout that extends Laundry's.
  const browser = process.env.CIVIC_BROWSER_PATH
  const config = browser ? join(scratch, 'playwright.config.ts') : undefined
  if (config) writeFileSync(config, `import base from ${JSON.stringify(join(web, 'playwright.config.ts'))}\nexport default { ...base, testDir: ${JSON.stringify(join(web, 'e2e'))}, use: { ...base.use, channel: undefined, launchOptions: { executablePath: ${JSON.stringify(browser)} } } }\n`)
  const run = spawnSync(join(web, 'node_modules/.bin/playwright'), ['test', ...(config ? ['--config', config] : []), ...specs.map((spec) => spec.replace(/^apps\/web\//, '')), '--project=isolated', '--workers=1', '--reporter=line,json', '--global-timeout=1500000'], {
    cwd: web,
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 1_560_000,
    env: { ...process.env, WASHCLOSET_REVIEW_E2E: '1', WASHCLOSET_E2E_BASE_URL: base, PLAYWRIGHT_JSON_OUTPUT_FILE: report },
  })
  if (run.error || run.signal) throw new Error(`Playwright did not finish: ${run.error?.message ?? `stopped by ${run.signal}`}`)
  const raw = JSON.parse(readFileSync(report, 'utf8')) as { suites: Suite[]; stats: Record<string, unknown> }
  // Keep results and errors; drop attachments, output and absolute paths, which are about this machine.
  const clean = (suite: Suite): Suite => ({
    title: suite.title,
    file: suite.file,
    ...(suite.specs ? { specs: suite.specs.map((spec) => ({ title: spec.title, file: spec.file, line: spec.line, tests: spec.tests.map((test) => ({ annotations: test.annotations, status: test.status, results: test.results.map((result) => ({ status: result.status, startTime: result.startTime, duration: result.duration, retry: result.retry, ...(result.errors?.length ? { errors: result.errors.map((error) => ({ message: error.message?.replace(/\x1b\[[0-9;]*m/g, '').replaceAll(checkout, '') })) } : {}) })) })) })) } : {}),
    ...(suite.suites ? { suites: suite.suites.map(clean) } : {}),
  })
  writeFileSync(join(inputs, 'playwright-report.json'), JSON.stringify({
    config: { metadata: { 'civic.revision': index.revision.head, 'civic.tool': 'playwright' } },
    suites: raw.suites.map(clean),
    stats: raw.stats,
  }, null, 2) + '\n')
  // What build.ts reads from Laundry's source, at the same commit, so the graph builds without a checkout: the
  // spec files the report covers (a test covers the scenarios its body names), the generated web tokens, and the
  // exported declarations in the web source (component families are matched by exported name).
  const specFiles = [...new Set(raw.suites.map((suite) => suite.file))].sort()
  const exportLine = /^export\s+(?:default\s+)?(?:function|const)\s+[A-Z]\w*/
  const exported = (readdirSync(join(checkout, SOURCE), { recursive: true }) as string[])
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .sort()
    .flatMap((file) => readFileSync(join(checkout, SOURCE, file), 'utf8').split('\n').flatMap((text, at) => (exportLine.test(text) ? [{ path: `${SOURCE}/${file}`, line: at + 1, text }] : [])))
  writeFileSync(join(inputs, 'source.json'), JSON.stringify({
    repository: 'taymoork2/washcloset',
    revision: head,
    specs: Object.fromEntries(specFiles.map((file) => [file, readFileSync(join(web, 'e2e', file), 'utf8')])),
    tokens: { path: TOKENS, text: readFileSync(join(checkout, TOKENS), 'utf8') },
    exports: exported,
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
