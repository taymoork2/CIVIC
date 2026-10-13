#!/usr/bin/env node
// Crawls the journey engine's manifest-free discovery example with CIVIC's crawl loop (D34)
// and writes inputs/crawl.json. The example is a static site, so the crawl serves its folder
// itself. The one input the crawl may fill is the note title; every other field stays empty.
//
//   node projects/discovery-app/capture.ts        (from the repository root, on a clean checkout of the example)

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { crawl, launchBrowser, serveFolder, webDriver } from '../../crawl/src/index.ts'

export const APP = 'projects/discovery-app/app/src'
const root = new URL('../../', import.meta.url).pathname
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
if (git('status', '--porcelain', '--', APP)) throw new Error(`${APP} has uncommitted changes; commit them so the crawl names a real revision.`)

const server = await serveFolder(`${root}${APP}`)
const browser = await launchBrowser()
try {
  const result = await crawl(webDriver(browser, `${server.url}index.html`), {
    seed: 'index.html',
    platform: 'web',
    driver: 'playwright-core',
    revision: git('rev-parse', 'HEAD'),
    inputs: { Title: 'Crawl note' },
  })
  writeFileSync(new URL('inputs/crawl.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
  console.log(`${result.states.length} state(s), ${result.transitions.length} transition(s), ${result.blocked.length} blocked, ${result.unreached.length} unreached.`)
} finally {
  await browser.close()
  await server.close()
}
