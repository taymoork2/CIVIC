#!/usr/bin/env node
// civic-crawl: runs CIVIC's crawl loop (D34) on a web app and writes what it found as a
// `civic.crawl/0` file, which the crawl importer reads into the graph. No model calls.
//
//   node src/cli.ts <seed URL> --revision <rev> [--out crawl.json] [--input "Label=value"]...
//   node src/cli.ts --folder <static site> --seed index.html --revision <rev> ...
//
// --max-states and --max-depth bound the crawl; --block <regex> blocks more action names.

import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { crawl } from './explore.ts'
import { launchBrowser, webDriver } from './playwright.ts'
import { serveFolder } from './serve.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    folder: { type: 'string' },
    seed: { type: 'string' },
    revision: { type: 'string' },
    out: { type: 'string' },
    input: { type: 'string', multiple: true },
    block: { type: 'string', multiple: true },
    'max-states': { type: 'string' },
    'max-depth': { type: 'string' },
  },
})
if (!values.revision) throw new Error('Name the revision the crawl runs against with --revision, so its results can be tied to it.')
const inputs = Object.fromEntries((values.input ?? []).map((pair) => {
  const at = pair.indexOf('=')
  if (at < 1) throw new Error(`--input takes Label=value, not ${pair}.`)
  return [pair.slice(0, at), pair.slice(at + 1)]
}))

const server = values.folder ? await serveFolder(values.folder) : undefined
const seed = server ? new URL(values.seed ?? 'index.html', server.url).href : positionals[0]
if (!seed) throw new Error('Give a seed URL, or --folder with --seed.')
const browser = await launchBrowser()
try {
  const result = await crawl(webDriver(browser, seed), {
    // A served folder's port changes each run, so the seed is recorded relative to it.
    seed: server ? (values.seed ?? 'index.html') : seed,
    platform: 'web',
    driver: `playwright chromium ${browser.version()}`,
    revision: values.revision,
    inputs,
    ...(values.block ? { block: values.block } : {}),
    ...(values['max-states'] ? { maxStates: Number(values['max-states']) } : {}),
    ...(values['max-depth'] ? { maxDepth: Number(values['max-depth']) } : {}),
  })
  const body = `${JSON.stringify(result, null, 2)}\n`
  if (values.out) writeFileSync(values.out, body)
  else process.stdout.write(body)
  console.error(`${result.states.length} state(s), ${result.transitions.length} transition(s), ${result.blocked.length} blocked, ${result.unreached.length} unreached${result.truncated ? ', truncated by a limit' : ''}.`)
} finally {
  await browser.close()
  await server?.close()
}
