// Runs the browser suite with full output in .data/e2e.log and prints only counts, time and failures.
import { spawn } from 'node:child_process'
import { mkdirSync, openSync, readFileSync } from 'node:fs'

const dir = new URL('../.data/', import.meta.url)
mkdirSync(dir, { recursive: true })
const report = new URL('e2e-report.json', dir).pathname, log = new URL('e2e.log', dir).pathname
const out = openSync(log, 'w')
const playwright = new URL('../node_modules/.bin/playwright', import.meta.url).pathname
const code = await new Promise((resolve) => spawn(playwright, ['test', '--reporter=json', ...process.argv.slice(2)], {
  stdio: ['ignore', out, out], env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: report },
}).on('close', resolve))

let json
try { json = JSON.parse(readFileSync(report, 'utf8')) }
catch { console.log(`No report (exit ${code}); see ${log}`); process.exit(code || 1) }
const { expected = 0, unexpected = 0, flaky = 0, skipped = 0, duration = 0 } = json.stats
console.log(`passed ${expected}  failed ${unexpected}  flaky ${flaky}  skipped ${skipped}  ${(duration / 60_000).toFixed(1)} min`)
const walk = (suite, titles = []) => {
  for (const child of suite.suites ?? []) walk(child, suite.title ? [...titles, suite.title] : titles)
  for (const spec of suite.specs ?? []) for (const t of spec.tests) {
    if (t.status !== 'unexpected' && t.status !== 'flaky') continue
    const last = t.results.at(-1)
    const context = t.results.flatMap((r) => r.attachments).find((a) => a.name === 'error-context')?.path
    console.log(`${t.status === 'flaky' ? 'FLAKY' : 'FAIL'} ${[...titles, suite.title, spec.title].filter(Boolean).join(' > ')}:${spec.line}`)
    console.log(`  ${(last.error?.message ?? '').split('\n')[0].replace(/\x1b\[[0-9;]*m/g, '').slice(0, 200)}`)
    if (context) console.log(`  ${context}`)
  }
}
for (const suite of json.suites) walk(suite)
for (const error of json.errors ?? []) console.log(`ERROR ${(error.message ?? '').split('\n')[0]}`)
if (code) console.log(`full log: ${log}`)
process.exit(code)
