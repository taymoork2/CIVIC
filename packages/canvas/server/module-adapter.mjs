import { journeyGraph, pathId } from '../src/journey-graph.mjs'
import { hostPlaywright } from '@civic/shell/server'

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
  exploreFixture,
}

/** Prefers an installed Chrome, then Playwright's own Chromium; `CIVIC_BROWSER` names a channel. */
async function launchFixtureBrowser() {
  const { chromium } = await hostPlaywright()
  const channel = process.env.CIVIC_BROWSER ?? 'chrome'
  try { return await chromium.launch({ channel, headless: true, timeout: 10000 }) }
  catch (error) { if (process.env.CIVIC_BROWSER) throw error; return chromium.launch({ headless: true, timeout: 10000 }) }
}

/** Renders one screen through the preview adapter in an isolated context that can only read this review server. */
async function captureFixture(node, { origin, cookie, browser: sharedBrowser, visit, writes = false }) {
  if (node.preview === 'requires-start-state') throw Error('A concrete starting state is required for this screen. Reach it through a live run.')
  const browser = sharedBrowser ?? await launchFixtureBrowser()
  let context
  const runs = []
  try {
    const viewport = node.viewport ?? { width: 393, height: 852 }
    context = await browser.newContext({ viewport, deviceScaleFactor: node.pixelRatio ?? 1, colorScheme: node.theme ?? 'light' })
    await context.addCookies([{ name: 'review_session', value: cookie.slice('review_session='.length), url: origin }])
    if (context.routeWebSocket) await context.routeWebSocket('**/*', socket => {
      const url = new URL(socket.url())
      if (url.origin === origin.replace('http:', 'ws:') && url.pathname.startsWith('/api/review/')) socket.connectToServer()
      else socket.close()
    })
    // Reads only: page assets, and an isolated run's start, reads and close. Its writes are refused.
    await context.route('**/*', async (route) => {
      const request = route.request(), url = new URL(request.url())
      const runtime = url.origin === origin && request.method() === 'POST' && url.pathname === '/api/review/runtime' && (writes || ['start', 'query', 'state', 'close'].includes(request.postDataJSON()?.action))
      if (runtime && request.postDataJSON().action === 'start') {
        try {
          const response = await route.fetch()
          if (response.ok()) runs.push((await response.json()).id)
          await route.fulfill({ response })
        } catch { await route.abort().catch(() => {}) }
      } else if (url.origin === origin && (request.method() === 'GET' || runtime || request.method() === 'POST' && url.pathname === '/api/review/interactions' && request.postDataJSON()?.action === 'observe')) await route.continue()
      else await route.abort()
    })
    const page = await context.newPage()
    const params = new URLSearchParams({ scenario: node.scenario ?? node.id, width: String(viewport.width), height: String(viewport.height), theme: node.theme ?? 'light', ...(node.appTheme ? { appTheme: node.appTheme } : {}), ...(node.condition ? { condition: node.condition } : {}) })
    await page.goto(`${origin}/review-frame.html?${params}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.locator('[data-rehearsal-ready="true"], #review-root:has(> h1:text-is("Preview unavailable"))').waitFor({ state: 'attached', timeout: 10000 })
    if (await page.getByRole('heading', { name: 'Preview unavailable', exact: true }).count()) throw Error((await page.getByRole('alert').first().textContent())?.slice(0, 300) || 'Fixture did not render')
    if (visit) {
      let timer
      try { return await Promise.race([visit(page), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Fixture exploration exceeded its 20 second action budget')), 20000) })]) }
      finally { clearTimeout(timer) }
    }
    await page.evaluate(async () => { await window.reviewPreview?.flushDiscovery?.(); const error = document.getElementById('review-root')?.dataset.discoveryError; if (error) throw Error(error) })
    return await page.screenshot({ type: 'png', animations: 'disabled', timeout: 10000 })
  } finally {
    for (const run of runs) await context?.request.post(`${origin}/api/review/runtime`, { data: { action: 'close', run } }).catch(() => {})
    await context?.close(); if (!sharedBrowser) await browser.close()
  }
}

/** Each branch starts with fresh storage; unknown actions stay gaps rather than guessed writes. */
export async function exploreFixture(node, options) {
  const queue = [[]], seen = new Set(), result = { states: 0, actions: 0, limited: false, errors: [] }
  const deadline = Date.now() + 45000
  while (queue.length && result.states < 20 && Date.now() < deadline) {
    const path = queue.shift()
    try {
      await captureFixture(node, { ...options, visit: async page => {
        for (const target of path) {
          const point = await page.evaluate(target => window.reviewPreview.explorationPoint(target), target)
          await page.mouse.click(point.x, point.y)
          await page.evaluate(() => window.reviewPreview.recording())
        }
        const view = await page.evaluate(async () => { await window.reviewPreview?.flushDiscovery?.(); return window.reviewPreview?.exploration?.() })
        if (!view) throw Error('This preview has no interaction discovery bridge')
        const signature = JSON.stringify(view.state)
        if (seen.has(signature)) return
        seen.add(signature); result.states++
        if (path.length) {
          const tape = await page.evaluate(() => window.reviewPreview.recording())
          await options.saveRecording(tape); result.actions += tape.steps.length
        }
        const next = view.targets.filter(target => !path.some(previous => JSON.stringify(previous) === JSON.stringify(target)))
        if (path.length < 3) for (const target of next.slice(0, 12)) queue.push([...path, target])
        else if (next.length) result.limited = true
        if (next.length > 12) result.limited = true
      } })
    } catch (error) { result.errors.push(error.message.split('\n')[0].slice(0, 300)) }
  }
  result.limited ||= queue.length > 0
  return result
}
