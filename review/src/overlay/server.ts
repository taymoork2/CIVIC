import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { parseId, type ElementLocator } from '../../../graph/src/index.ts'
import { annotate, type Context } from '../loop.ts'

const OVERLAY = new URL('./overlay.js', import.meta.url)
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/
const MAX_BODY = 6_000_000

export type Rasterize = (html: string, viewport: { width: number; height: number }, pageOrigin: string) => Promise<Uint8Array>

/**
 * The local server behind the capture overlay (D40). It serves the overlay script to dev and
 * preview builds and turns each submitted selection into an annotation in the shared store.
 * Loopback only, and only for pages served from loopback, so another website can't write
 * annotations. The screenshot is rendered deterministically from the submitted DOM with
 * scripts disabled, as the journey engine's capture does.
 */
export function createOverlayServer(context: () => Context, rasterize: Rasterize = rasterizeWithPlaywright): Server {
  return createServer((req, res) => {
    void handle(req, res, context, rasterize)
  })
}

async function handle(req: IncomingMessage, res: ServerResponse, context: () => Context, rasterize: Rasterize) {
  const origin = req.headers.origin
  const json = (status: number, value: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...(origin && LOOPBACK.test(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}) })
    res.end(JSON.stringify(value))
  }
  try {
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host ?? '')) return json(403, { error: 'The CIVIC overlay server is local only.' })
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (path === '/overlay.js' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(readFileSync(OVERLAY))
    }
    if (path !== '/annotate') return json(404, { error: 'Not found' })
    if (!origin || !LOOPBACK.test(origin)) return json(403, { error: 'Annotations come only from pages served on this machine.' })
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600', vary: 'origin' })
      return res.end()
    }
    if (req.method !== 'POST') return json(405, { error: 'Use POST' })
    if (!req.headers['content-type']?.startsWith('application/json')) return json(400, { error: 'Use JSON' })
    const input = checked(JSON.parse(await body(req)) as Record<string, unknown>, origin)
    const png = await rasterize(input.html, input.viewport, new URL(input.url).origin)
    const annotation = annotate(context(), {
      comment: input.comment,
      url: input.url,
      viewport: input.viewport,
      rect: input.rect,
      targetIds: input.targetIds,
      ...(input.locator ? { locator: input.locator } : {}),
      ...(input.stamped ? { stamped: input.stamped } : {}),
      image: { bytes: png, mediaType: 'image/png' },
    })
    return json(201, { id: annotation.id, seenOn: annotation.seenOn })
  } catch (error) {
    return json((error as { status?: number }).status ?? 500, { error: (error as Error).message })
  }
}

const bad = (message: string) => Object.assign(new Error(message), { status: 400 })

function checked(input: Record<string, unknown>, origin: string) {
  const text = (value: unknown, max: number, what: string) => {
    if (typeof value !== 'string' || value.trim() === '' || value.length > max) throw bad(`Invalid ${what}`)
    return value.trim()
  }
  const comment = text(input.comment, 4000, 'comment')
  const url = text(input.url, 4000, 'page URL')
  if (new URL(url).origin !== origin) throw bad('The page URL must be the page that sent the annotation.')
  const viewport = input.viewport as { width?: unknown; height?: unknown } | undefined
  if (!viewport || !Number.isInteger(viewport.width) || !Number.isInteger(viewport.height) || (viewport.width as number) < 100 || (viewport.width as number) > 4000 || (viewport.height as number) < 100 || (viewport.height as number) > 4000) throw bad('Invalid viewport')
  const rect = input.rect as Record<string, unknown> | undefined
  if (!rect || ['x', 'y', 'width', 'height'].some((key) => typeof rect[key] !== 'number' || (rect[key] as number) < 0 || (rect[key] as number) > 1)) throw bad('Invalid selection')
  const targetIds = Array.isArray(input.targetIds) ? input.targetIds : []
  if (targetIds.length > 20 || targetIds.some((id) => typeof id !== 'string' || !parseId(id))) throw bad('Invalid CIVIC IDs on the element')
  let locator: ElementLocator | undefined
  if (input.locator !== undefined) {
    const raw = input.locator as Record<string, unknown>
    locator = {}
    if (raw.testId !== undefined) locator.testId = text(raw.testId, 300, 'test ID')
    if (raw.role !== undefined || raw.name !== undefined) {
      if (typeof raw.role !== 'string' || !/^[a-z]{2,40}$/.test(raw.role)) throw bad('Invalid role')
      locator.role = raw.role
      locator.name = text(raw.name, 300, 'accessible name')
    }
  }
  const stamped = typeof input.line === 'string' && typeof input.revision === 'string' && parseId(input.line) ? { line: input.line, revision: text(input.revision, 200, 'revision') } : undefined
  return {
    comment,
    url,
    viewport: { width: viewport.width as number, height: viewport.height as number },
    rect: { x: rect.x as number, y: rect.y as number, width: rect.width as number, height: rect.height as number, ...(typeof rect.label === 'string' ? { label: text(rect.label, 300, 'label') } : {}) },
    targetIds: targetIds as string[],
    ...(locator && Object.keys(locator).length > 0 ? { locator } : {}),
    ...(stamped ? { stamped } : {}),
    html: text(input.html, 5_000_000, 'page snapshot'),
  }
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw bad('The page snapshot is too large.')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Renders the submitted DOM with scripts disabled; only the page's own images, fonts and styles load. */
async function rasterizeWithPlaywright(html: string, viewport: { width: number; height: number }, pageOrigin: string): Promise<Uint8Array> {
  const { launchBrowser } = await import('../recapture.ts')
  const browser = (await launchBrowser()) as unknown as {
    newContext(options: object): Promise<{ route(pattern: string, handler: (route: { request(): { url(): string; resourceType(): string }; continue(): Promise<void>; abort(): Promise<void> }) => Promise<void>): Promise<void>; newPage(): Promise<{ setContent(html: string, options: object): Promise<void>; screenshot(options: object): Promise<Uint8Array> }> }>
    close(): Promise<void>
  }
  try {
    const page = await browser.newContext({ viewport, javaScriptEnabled: false }).then(async (context) => {
      await context.route('**/*', async (route) => {
        const request = route.request()
        if (new URL(request.url()).origin === pageOrigin && ['image', 'font', 'stylesheet'].includes(request.resourceType())) await route.continue()
        else await route.abort()
      })
      return context.newPage()
    })
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 })
    return await page.screenshot({ type: 'png', timeout: 15_000 })
  } finally {
    await browser.close()
  }
}
