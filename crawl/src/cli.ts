#!/usr/bin/env node
// civic-crawl: runs CIVIC's crawl loop (D34) on a web or native app and writes what it found as a
// `civic.crawl/0` file, which the crawl importer reads into the graph. No model calls.
//
//   node src/cli.ts <seed URL> --revision <rev> [--out crawl.json] [--input "Label=value"]...
//   node src/cli.ts --folder <static site> --seed index.html --revision <rev> ...
//   node src/cli.ts --appium http://127.0.0.1:4723 --platform android --capabilities caps.json --revision <rev> ...
//
// --max-states and --max-depth bound the crawl; --block <regex> blocks more action names; --noop <regex> declares actions that change nothing on purpose; --select <text> selects that passage to see what the app offers.

import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { appiumDriver, type NativePlatform } from './appium.ts'
import { crawl, type CrawlOptions, type Driver } from './explore.ts'
import { launchBrowser, webDriver } from './playwright.ts'
import { serveFolder } from './serve.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    folder: { type: 'string' },
    appium: { type: 'string' },
    platform: { type: 'string' },
    capabilities: { type: 'string' },
    seed: { type: 'string' },
    revision: { type: 'string' },
    out: { type: 'string' },
    input: { type: 'string', multiple: true },
    block: { type: 'string', multiple: true },
    noop: { type: 'string', multiple: true },
    select: { type: 'string', multiple: true },
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

const limits: Partial<CrawlOptions> = {
  inputs,
  ...(values.block ? { block: values.block } : {}),
  ...(values.noop ? { noop: values.noop } : {}),
  ...(values['max-states'] ? { maxStates: Number(values['max-states']) } : {}),
  ...(values['max-depth'] ? { maxDepth: Number(values['max-depth']) } : {}),
}
const report = (result: Awaited<ReturnType<typeof crawl>>) => {
  const body = `${JSON.stringify(result, null, 2)}\n`
  if (values.out) writeFileSync(values.out, body)
  else process.stdout.write(body)
  console.error(`${result.states.length} state(s), ${result.transitions.length} transition(s), ${result.blocked.length} blocked, ${result.noEffect.length} changed nothing, ${result.unreached.length} unreached${result.truncated ? ', truncated by a limit' : ''}.`)
}

if (values.appium) {
  const platform = values.platform as NativePlatform
  if (platform !== 'android' && platform !== 'ios') throw new Error('With --appium, name the platform: --platform android or --platform ios.')
  if (!values.capabilities) throw new Error('With --appium, give the session capabilities as a JSON file with --capabilities.')
  const capabilities = JSON.parse(readFileSync(values.capabilities, 'utf8')) as Record<string, unknown>
  const app = String(capabilities['appium:appPackage'] ?? capabilities['appium:bundleId'] ?? capabilities['appium:app'] ?? 'app')
  const driver = appiumDriver({ server: values.appium, platform, capabilities })
  try {
    report(await crawl(driver, { seed: app, platform, driver: `appium ${String(capabilities['appium:automationName'] ?? 'unknown').toLowerCase()}`, revision: values.revision, ...limits }))
  } finally {
    await driver.close()
  }
} else {
  const server = values.folder ? await serveFolder(values.folder) : undefined
  const seed = server ? new URL(values.seed ?? 'index.html', server.url).href : positionals[0]
  if (!seed) throw new Error('Give a seed URL, or --folder with --seed, or --appium for a native app.')
  const browser = await launchBrowser()
  try {
    const driver: Driver = webDriver(browser, seed, { select: values.select ?? [] })
    report(await crawl(driver, {
      // A served folder's port changes each run, so the seed is recorded relative to it.
      seed: server ? (values.seed ?? 'index.html') : seed,
      platform: 'web',
      driver: `playwright chromium ${browser.version()}`,
      revision: values.revision,
      ...limits,
    }))
  } finally {
    await browser.close()
    await server?.close()
  }
}
