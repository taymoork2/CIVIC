import towel from '../src/review/towel-journey.json' with { type: 'json' }

/**
 * Laundry App's side of the CIVIƆ review shell (@civic/shell/server): the towel journey screens,
 * the presentation properties its intake sheet accepts as proposals, and how to render a fixture.
 */
export const laundryReviewAdapter = {
  screens: towel,
  proposalProperties: ['title', 'action', 'color'],
  captureFixture,
  launchFixtureBrowser: async () => (await import('@playwright/test')).chromium.launch({ channel: 'chrome', headless: true }),
}

/** Captures fixed, real synthetic fixtures in an isolated browser context; never the reviewer's run. */
async function captureFixture(node, { origin, cookie, browser: sharedBrowser }) {
  const { chromium } = await import('@playwright/test')
  const browser = sharedBrowser ?? await chromium.launch({ channel: 'chrome', headless: true })
  let context
  try {
    context = await browser.newContext({ viewport: { width: 393, height: 852 } })
    await context.addCookies([{ name: 'review_session', value: cookie.slice('review_session='.length), url: origin }])
    await context.route('**/*', async (route) => {
      const req = route.request()
      if (new URL(req.url()).origin === origin && req.method() === 'GET') await route.continue()
      else await route.abort()
    })
    const page = await context.newPage()
    const care = node.id.startsWith('care:') ? `&care=${node.id.split(':')[1]}` : ''
    await page.goto(`${origin}/review-frame.html?scenario=${node.scenario}${node.scenario.startsWith('intake.towel.') ? '&journey=towel' : ''}${care}`, { waitUntil: 'networkidle' })
    if (node.renderer !== 'legacy') await page.getByRole('dialog').first().waitFor({ timeout: 5000 })
    if (node.id === 'saved') { await page.getByRole('button', { name: 'Save item', exact: true }).click(); await page.getByRole('heading', { name: 'Saved', exact: true }).waitFor() }
    return await page.screenshot({ type: 'png', animations: 'disabled' })
  } finally { await context?.close(); if (!sharedBrowser) await browser.close() }
}

