import { journeyGraph, pathId } from '../src/journey-graph.mjs'

/**
 * The review server's side of a module project: CIVIC's own journey graph, no guided run or
 * presentation proposals, and fixture snapshots taken from the project's preview adapter.
 */
export const moduleReviewAdapter = {
  screens: [],
  journeyGraph,
  pathId,
  proposalProperties: [],
  captureFixture,
  launchFixtureBrowser,
}

/** Prefers an installed Chrome, then Playwright's own Chromium; `CIVIC_BROWSER` names a channel. */
async function launchFixtureBrowser() {
  const { chromium } = await import('@playwright/test')
  const channel = process.env.CIVIC_BROWSER ?? 'chrome'
  try { return await chromium.launch({ channel, headless: true }) }
  catch (error) { if (process.env.CIVIC_BROWSER) throw error; return chromium.launch({ headless: true }) }
}

/** Renders one screen through the preview adapter in an isolated context that can only read this review server. */
async function captureFixture(node, { origin, cookie, browser: sharedBrowser }) {
  if (node.preview === 'requires-start-state') throw Error('A concrete starting state is required for this screen. Reach it through a live run.')
  const browser = sharedBrowser ?? await launchFixtureBrowser()
  let context
  try {
    context = await browser.newContext({ viewport: { width: 393, height: 852 } })
    await context.addCookies([{ name: 'review_session', value: cookie.slice('review_session='.length), url: origin }])
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin && route.request().method() === 'GET' ? route.continue() : route.abort())
    const page = await context.newPage()
    await page.goto(`${origin}/review-frame.html?scenario=${encodeURIComponent(node.scenario ?? node.id)}`, { waitUntil: 'networkidle' })
    await page.locator('[data-rehearsal-ready="true"]').waitFor({ state: 'attached', timeout: 10000 })
    return await page.screenshot({ type: 'png', animations: 'disabled' })
  } finally { await context?.close(); if (!sharedBrowser) await browser.close() }
}
