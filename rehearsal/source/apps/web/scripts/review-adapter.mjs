import towel from '../src/review/towel-journey.json' with { type: 'json' }
import { journeyGraph, pathId } from '../src/review/journey-graph.mjs'

/**
 * Laundry App's side of the CIVIC review shell (@civic/shell/server): the towel journey screens,
 * the journey graph the canvas and server validation share, the presentation properties its
 * intake sheet accepts as proposals, and how to render a fixture.
 */
export const laundryReviewAdapter = {
  screens: towel,
  journeyGraph,
  pathId,
  proposalProperties: ['title', 'action', 'color'],
  captureFixture,
  launchFixtureBrowser: async () => (await import('@playwright/test')).chromium.launch({ channel: 'chrome', headless: true }),
}

/** Captures fixed, real synthetic fixtures in an isolated browser context; never the reviewer's run. */
async function captureFixture(node, { origin, cookie, browser: sharedBrowser }) {
  if (node.preview === 'requires-start-state') throw Error('A concrete starting state is required for this route. Reach it through a live app run.')
  const { chromium } = await import('@playwright/test')
  const browser = sharedBrowser ?? await chromium.launch({ channel: 'chrome', headless: true })
  let context
  let runId
  try {
    context = await browser.newContext({ viewport: { width: 393, height: 852 } })
    await context.addCookies([{ name: 'review_session', value: cookie.slice('review_session='.length), url: origin }])
    await context.route('**/*', async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      const isolated = ['runtime', 'towel-runtime'].includes(node.renderer)
      const runtimeRead = isolated && req.method() === 'POST' && url.pathname === '/api/review/runtime' && (['start', 'query', 'state', 'close'].includes(req.postDataJSON()?.action) || node.id === 'saved' && req.postDataJSON()?.action === 'mutation')
      if (url.origin === origin && runtimeRead && req.postDataJSON().action === 'start') {
        const response = await route.fetch()
        if (response.ok()) runId = (await response.json()).id
        await route.fulfill({ response })
      } else if (url.origin === origin && (req.method() === 'GET' || runtimeRead)) await route.continue()
      else await route.abort()
    })
    const page = await context.newPage()
    const care = node.id.startsWith('care:') ? `&care=${node.id.split(':')[1]}` : ''
    await page.goto(`${origin}/review-frame.html?scenario=${node.scenario}${node.scenario.startsWith('intake.towel.') ? '&journey=towel' : ''}${care}`, { waitUntil: 'networkidle' })
    if (['adapter', 'runtime', 'towel-runtime'].includes(node.renderer)) await page.locator('[data-rehearsal-ready="true"]').waitFor({ state: 'attached', timeout: 10000 })
    else if (node.renderer === 'family') await page.getByLabel('Family care progress').waitFor({ timeout: 5000 })
    else if (node.renderer === 'reminder') await page.locator('.app-main h1').waitFor({ timeout: 5000 })
    else if (node.renderer !== 'legacy' && node.renderer !== 'route-state') await page.getByRole('dialog').first().waitFor({ timeout: 5000 })
    if (await page.getByRole('heading', { name: 'Preview unavailable', exact: true }).count() || await page.getByText('Something went wrong!', { exact: true }).count()) throw new Error('Fixture did not render; no verified snapshot was saved.')
    if (['runtime', 'towel-runtime'].includes(node.renderer)) runId = await page.evaluate(() => window.reviewPreview?.data()?.runId) ?? runId
    if (node.id === 'saved') { await page.getByRole('button', { name: 'Save item', exact: true }).click(); await page.getByRole('heading', { name: 'Saved', exact: true }).waitFor() }
    return await page.screenshot({ type: 'png', animations: 'disabled' })
  } finally { if (runId) await context?.request.post(`${origin}/api/review/runtime`, { data: { action: 'close', run: runId } }).catch(() => {}); await context?.close(); if (!sharedBrowser) await browser.close() }
}
