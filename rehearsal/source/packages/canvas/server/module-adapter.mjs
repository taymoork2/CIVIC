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
  const runs = []
  try {
    context = await browser.newContext({ viewport: { width: 393, height: 852 } })
    await context.addCookies([{ name: 'review_session', value: cookie.slice('review_session='.length), url: origin }])
    // Reads only: page assets, and an isolated run's start, reads and close. Its writes are refused.
    await context.route('**/*', async (route) => {
      const request = route.request(), url = new URL(request.url())
      const runtime = url.origin === origin && request.method() === 'POST' && url.pathname === '/api/review/runtime' && ['start', 'query', 'state', 'close'].includes(request.postDataJSON()?.action)
      if (runtime && request.postDataJSON().action === 'start') {
        const response = await route.fetch()
        if (response.ok()) runs.push((await response.json()).id)
        await route.fulfill({ response })
      } else if (url.origin === origin && (request.method() === 'GET' || runtime)) await route.continue()
      else await route.abort()
    })
    const page = await context.newPage()
    await page.goto(`${origin}/review-frame.html?scenario=${encodeURIComponent(node.scenario ?? node.id)}`, { waitUntil: 'networkidle' })
    await page.locator('[data-rehearsal-ready="true"]').waitFor({ state: 'attached', timeout: 10000 })
    if (await page.getByRole('heading', { name: 'Preview unavailable', exact: true }).count()) throw Error('Fixture did not render; no verified snapshot was saved.')
    return await page.screenshot({ type: 'png', animations: 'disabled' })
  } finally {
    for (const run of runs) await context?.request.post(`${origin}/api/review/runtime`, { data: { action: 'close', run } }).catch(() => {})
    await context?.close(); if (!sharedBrowser) await browser.close()
  }
}
