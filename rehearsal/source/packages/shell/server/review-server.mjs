import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const bad = (message) => { throw Object.assign(new Error(message), { status: 400 }) }
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : bad('Invalid or oversized text')
const choice = (value, choices) => choices.includes(value) ? value : bad('Unknown review condition')

// An element locator read at capture time (D37): ARIA role and accessible name, matched exactly or not at all.
function checkedLocator(locator) {
  if (!locator || typeof locator !== 'object' || !/^[a-z]{2,40}$/.test(locator.role ?? '')) bad('Invalid element locator')
  return { role: locator.role, name: text(locator.name, 300) }
}

async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) bad('Use JSON')
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 3_000_000) bad('Capture is too large')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()) } catch { bad('Invalid JSON') }
}

function checkedFeedback(input, metadata, screens) {
  if (!input || typeof input !== 'object') bad('Invalid feedback')
  if (!uuid.test(input.requestId)) bad('Invalid request identity')
  const c = input.context
  if (!c || !metadata.scenarios.some((scenario) => scenario.id === c.scenario)) bad('Unknown synthetic scenario')
  if (c.screen !== undefined && !(screens.some((screen) => screen.id === c.screen && screen.scenario === c.scenario) || c.screen === c.scenario)) bad('Unknown review screen target')
  const viewport = c.viewport
  if (!viewport || !Number.isInteger(viewport.width) || !Number.isInteger(viewport.height) || viewport.width < 200 || viewport.width > 1920 || viewport.height < 200 || viewport.height > 1600) bad('Invalid viewport')
  const anchor = input.anchor
  if (!anchor || ['x', 'y', 'width', 'height'].some((key) => typeof anchor[key] !== 'number' || !Number.isFinite(anchor[key]) || anchor[key] < 0 || anchor[key] > 1) || anchor.width === 0 || anchor.height === 0 || anchor.x + anchor.width > 1.001 || anchor.y + anchor.height > 1.001) bad('Invalid highlight')
  const state = c.state
  if (!state || !Array.isArray(state.dialogs) || !Array.isArray(state.tabs) || !Array.isArray(state.fields) || state.dialogs.length > 12 || state.tabs.length > 40 || state.fields.length > 250) bad('Invalid screen state')
  const snapshot = input.snapshot
  if (!snapshot || !/^[0-9a-f]{40}$/.test(snapshot.revision?.head) || !/^[0-9a-f]{64}$/.test(snapshot.revision?.source) || !Number.isFinite(Date.parse(snapshot.revision?.capturedAt)) || snapshot.design?.project !== metadata.design.project || !snapshot.design?.hashes) bad('Invalid rendered source receipt')
  const designHashes = {}
  for (const path of Object.keys(metadata.design.hashes)) {
    const hash = snapshot.design.hashes[path]
    if (hash !== null && !/^[0-9a-f]{64}$/.test(hash)) bad('Invalid design receipt')
    designHashes[path] = hash
  }
  return {
    id: input.requestId, kind: choice(input.kind, ['bug', 'confusing', 'idea', 'other']), message: text(input.message, 4000),
    context: { scenario: c.scenario, ...(c.screen === undefined ? {} : { screen: c.screen }), persona: choice(c.persona, ['single', 'student', 'parent']), role: choice(c.role, ['owner', 'member']), condition: choice(c.condition, ['normal', 'save-error', 'offline', 'missing-care']), theme: choice(c.theme, ['light', 'dark']), textScale: choice(c.textScale, [1, 2]), viewport: { width: viewport.width, height: viewport.height }, state: { dialogs: state.dialogs.map((s) => text(s, 300)), tabs: state.tabs.map((s) => text(s, 300)), fields: state.fields.map((field) => ({ label: text(field.label, 300), value: typeof field.value === 'string' && field.value.length <= 4000 ? field.value : bad('Invalid draft value') })) } },
    anchor: { label: text(anchor.label, 300), x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height, ...(anchor.locator === undefined ? {} : { locator: checkedLocator(anchor.locator) }) },
    html: text(input.html, 2_500_000),
    snapshot: { revision: { head: snapshot.revision.head, source: snapshot.revision.source, capturedAt: snapshot.revision.capturedAt }, design: { project: metadata.design.project, hashes: designHashes } },
  }
}

/**
 * Loopback-only review storage. No Convex client, household credentials or personal records.
 * `shared`, when given, records each saved note as a CIVIC annotation in the store every
 * worktree shares (decision 0007, D39) and hands annotations to agents as work requests.
 * This server keeps only its own working copy and the annotation ID.
 * `publicHost` admits one authenticated Amp portal hostname; its collaborators skip the local key.
 * The adapter declares its journey screens, editable proposal properties and fixture renderer.
 * `coverage`, when given, opens the app's coverage bridge for this data directory and inventory.
 */
export async function reviewMiddleware({ dataDir, metadata, capture, adapter, coverage, evidence = new Map(), publicHost = null, shared = null }) {
  const { screens, proposalProperties, captureFixture, launchFixtureBrowser } = adapter
  // The shell validates exactly these presentation edits; an adapter may offer a subset.
  if (proposalProperties.some((key) => !['title', 'action', 'color'].includes(key))) throw new Error('The review shell can only validate title, action and color proposals.')
  const declared = new Set(screens.map((screen) => screen.scenario))
  const withCurrentSource = (row) => ({ ...row, sourceStale: row.revision.source !== metadata.revision.source || row.revision.head !== metadata.revision.head })
  await mkdir(dataDir, { recursive: true, mode: 0o700 })
  const bridge = metadata.coverage && coverage ? await coverage({ dataDir, metadata }) : null
  const keyPath = join(dataDir, 'access-key')
  let accessKey
  try { accessKey = (await readFile(keyPath, 'utf8')).trim() }
  catch (error) { if (error.code !== 'ENOENT') throw error; accessKey = randomBytes(32).toString('hex'); await writeFile(keyPath, accessKey + '\n', { mode: 0o600, flag: 'wx' }) }
  const session = randomBytes(32).toString('hex')
  const storePath = join(dataDir, 'feedback.json')
  const proposalPath = join(dataDir, 'proposals.json')
  const thumbnails = new Map()
  let fixtureQueue = Promise.resolve()
  const fixtureDir = join(dataDir, 'fixtures')
  await mkdir(fixtureDir, { recursive: true, mode: 0o700 })
  const thumbnail = (node, host, browser) => {
    const source = metadata.fixtureSource ?? metadata.revision.source
    const cacheKey = `${source}:${node.id}`
    if (!thumbnails.has(cacheKey)) {
      if (thumbnails.size >= 512) thumbnails.clear()
      const file = join(fixtureDir, `${source}-${node.id.replace(':', '-')}.png`)
      const operation = fixtureQueue.then(async () => {
        try { return await readFile(file) } catch (error) { if (error.code !== 'ENOENT') throw error }
        const png = await captureFixture(node, { origin: `http://${host}`, cookie: `review_session=${session}`, browser })
        if (source !== (metadata.fixtureSource ?? metadata.revision.source)) throw Object.assign(new Error('Source changed during capture. Retry snapshots.'), { status: 409 })
        await writeFile(file + '.tmp', png, { mode: 0o600 }); await rename(file + '.tmp', file)
        return png
      })
      fixtureQueue = operation.catch(() => {})
      thumbnails.set(cacheKey, operation)
      operation.catch(() => thumbnails.delete(cacheKey))
    }
    return thumbnails.get(cacheKey)
  }
  const readProposals = async () => { try { return JSON.parse(await readFile(proposalPath, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return []; throw error } }
  const read = async () => { try { return JSON.parse(await readFile(storePath, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return []; throw error } }
  const write = async (rows) => { await writeFile(storePath + '.tmp', JSON.stringify(rows, null, 2) + '\n', { mode: 0o600 }); await rename(storePath + '.tmp', storePath) }
  // Captures and read-modify-write operations share one queue; concurrent notes cannot lose each other.
  let queue = Promise.resolve()
  const serial = (fn) => { const operation = queue.then(fn); queue = operation.catch(() => {}); return operation }
  const middleware = async (req, res, next) => {
    const json = (status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)) }
    try {
      const portal = publicHost !== null && req.headers.host === publicHost
      if (!portal && !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '')) { json(403, { error: 'Review is local only' }); return }
      // Headless capture browsers always load the loopback listener, even for portal visitors.
      const host = portal ? `127.0.0.1:${req.socket.localPort}` : req.headers.host
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin && req.headers.origin !== (portal ? `https://${publicHost}` : `http://${host}`)) { json(403, { error: 'Review origin refused' }); return }
      const url = new URL(req.url, `http://${host}`)
      if (url.pathname === '/api/review/login' && req.method === 'POST') {
        if (!equal((await body(req)).key, accessKey)) { json(401, { error: 'That review key is not valid.' }); return }
        res.setHeader('set-cookie', `review_session=${session}; HttpOnly; SameSite=Strict; Path=/`)
        json(200, { signedIn: true }); return
      }
      const cookie = req.headers.cookie?.split('; ').find((part) => part.startsWith('review_session='))?.slice(15)
      // Amp's portal proxy sets this header; public (unauthenticated) portal visitors are not collaborators.
      const collaborator = portal && String(req.headers['x-amp-authenticated'] ?? '').split(/,\s*/).includes('collaborator=yes')
      if (!collaborator && !equal(req.headers.authorization?.replace(/^Bearer /, ''), accessKey) && !equal(cookie, session)) {
        if (url.pathname.startsWith('/api/') || !['/review', '/review.html', '/review-frame.html', '/'].includes(url.pathname)) { json(401, { error: 'Review access required' }); return }
        res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" })
        res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Review access</title><style>body{font:18px/1.5 system-ui;max-width:32rem;margin:12vh auto;padding:24px}input,button{font:inherit;padding:12px;width:100%;box-sizing:border-box;margin:8px 0}</style><h1>A Laundered Closet review</h1><p>Enter the local review key from <code>.review-data/access-key</code> in this worktree. This workspace uses synthetic records.</p><form><label for="key">Review key</label><input id="key" type="password" autocomplete="off" required><button>Open review workspace</button><p role="alert" id="error"></p></form><script>document.querySelector("form").onsubmit=async(e)=>{e.preventDefault();try{const r=await fetch("/api/review/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({key:document.getElementById("key").value})});if(!r.ok)throw Error("That review key is not valid.");location.reload()}catch(e){document.getElementById("error").textContent=e.message}}</script></html>'); return
      }
      if (url.pathname === '/api/review/index' && req.method === 'GET') { json(metadata.refreshError ? 503 : 200, metadata.refreshError ? { error: metadata.refreshError } : metadata); return }
      if (url.pathname === '/api/review/coverage' && ['GET', 'POST'].includes(req.method)) {
        if (!bridge || metadata.refreshError) { json(503, { error: 'Coverage inventory is unavailable. Repair the source and retry.' }); return }
        json(200, req.method === 'GET' ? await bridge.get() : await bridge.update(await body(req))); return
      }
      if (url.pathname === '/api/review/proposals' && req.method === 'GET') { json(200, await serial(readProposals)); return }
      if (url.pathname === '/api/review/proposals' && req.method === 'POST') {
        const input = await body(req)
        if (!uuid.test(input.id) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 || input.source !== metadata.revision.source) bad('Invalid identity, version or stale source. Reload before editing.')
        if (!input.edits || typeof input.edits !== 'object' || Array.isArray(input.edits) || Object.keys(input.edits).length > screens.length) bad('Invalid proposal edits')
        const edits = {}
        for (const [screen, edit] of Object.entries(input.edits)) {
          if (!screens.some((node) => node.id === screen) || !edit || typeof edit !== 'object' || Array.isArray(edit) || Object.keys(edit).some((key) => !proposalProperties.includes(key))) bad('Unsupported screen or property')
          const next = {}
          for (const key of ['title', 'action']) if (edit[key] !== undefined) next[key] = text(edit[key], 160)
          if (edit.color !== undefined) {
            if (!/^#[0-9a-f]{6}$/i.test(edit.color)) bad('Use a six-digit button color')
            const channels = [1, 3, 5].map((offset) => parseInt(edit.color.slice(offset, offset + 2), 16) / 255).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
            if (1.05 / (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] + 0.05) < 4.5) bad('Button color needs at least 4.5:1 contrast with white text')
            next.color = edit.color
          }
          edits[screen] = next
        }
        const result = await serial(async () => {
          const rows = await readProposals()
          const old = rows.find((row) => row.id === input.id)
          if ((old?.version ?? 0) !== input.expectedVersion) return null
          const row = { id: input.id, version: input.expectedVersion + 1, title: text(input.title, 160), edits, source: input.source, updatedAt: new Date().toISOString() }
          const next = [...rows.filter((item) => item.id !== row.id), row]
          await writeFile(proposalPath + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 }); await rename(proposalPath + '.tmp', proposalPath)
          return row
        })
        json(result ? 200 : 409, result ?? { error: 'This proposal changed elsewhere. Your draft is kept. Load the latest version before saving.' }); return
      }
      if (url.pathname === '/api/review/capture' && req.method === 'POST') {
        const input = checkedFeedback(await body(req), metadata, screens)
        const result = await serial(async () => {
          const receipt = join(dataDir, `capture-${input.id}.json`)
          try { return JSON.parse(await readFile(receipt, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
          const png = await capture(input.html, input.context.viewport, { origin: `http://${host}`, cookie: `review_session=${session}` })
          const row = { id: input.id, screenshot: `/api/review/captures/${input.id}.png`, revision: input.snapshot.revision, at: new Date().toISOString() }
          await writeFile(join(dataDir, `capture-${input.id}.png`), png, { mode: 0o600 })
          await writeFile(receipt, JSON.stringify(row), { mode: 0o600 })
          return row
        })
        json(200, result); return
      }
      const runCapture = /^\/api\/review\/captures\/([0-9a-f-]+)\.png$/.exec(url.pathname)
      if (runCapture && req.method === 'GET' && uuid.test(runCapture[1])) {
        let png
        try { png = await readFile(join(dataDir, `capture-${runCapture[1]}.png`)) } catch (error) { if (error.code !== 'ENOENT') throw error; json(404, { error: 'Capture missing' }); return }
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' }); res.end(png); return
      }
      if (url.pathname === '/api/review/fixture.png' && req.method === 'GET') {
        const id = url.searchParams.get('screen')
        const scenario = metadata.scenarios.find((entry) => entry.id === id)
        const node = screens.find((node) => node.id === id) ?? (scenario ? { ...scenario, scenario: scenario.id } : null)
        if (!node) bad('Unknown registered screen')
        const requested = url.searchParams.get('source')
        if (requested !== null && !/^[0-9a-f]{64}$/.test(requested)) bad('Invalid snapshot source')
        if (requested && requested !== (metadata.fixtureSource ?? metadata.revision.source)) {
          let png
          try { png = await readFile(join(fixtureDir, `${requested}-${node.id.replace(':', '-')}.png`)) }
          catch (error) { if (error.code !== 'ENOENT') throw error; json(404, { error: 'Historical fixture snapshot unavailable' }); return }
          res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=3600', 'x-review-source': requested }); res.end(png); return
        }
        const png = await thumbnail(node, host)
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=3600', 'x-review-source': metadata.fixtureSource ?? metadata.revision.source }); res.end(png); return
      }
      if (url.pathname === '/api/review/snapshots' && req.method === 'POST') {
        const input = await body(req)
        const source = metadata.fixtureSource ?? metadata.revision.source
        if (input.scope !== undefined && input.scope !== 'app') bad('Unknown snapshot scope')
        const nodes = input.scope === 'app' ? [...screens, ...metadata.scenarios.filter((entry) => !declared.has(entry.id)).map((entry) => ({ ...entry, scenario: entry.id }))] : screens
        const browser = await launchFixtureBrowser?.()
        let results
        try { results = await Promise.allSettled(nodes.map((node) => thumbnail(node, host, browser))) }
        finally { await browser?.close() }
        const errors = nodes.filter((_, i) => results[i].status === 'rejected').map((node) => node.id)
        if (source !== (metadata.fixtureSource ?? metadata.revision.source)) { json(409, { error: 'Source changed during capture. Retry snapshots; previous run is retained.' }); return }
        json(200, { source, count: nodes.length - errors.length, errors }); return
      }
      if (url.pathname === '/api/review/evidence' && req.method === 'GET') {
        const file = evidence.get(url.searchParams.get('file'))
        if (!file) { json(404, { error: 'Evidence missing' }); return }
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(file); return
      }
      if (url.pathname === '/api/review/shared' && req.method === 'GET') {
        if (!shared) { json(404, { error: 'This review server is not connected to a shared CIVIC store.' }); return }
        json(200, await shared.list()); return
      }
      if (url.pathname === '/api/review/hand-off' && req.method === 'POST') {
        if (!shared) { json(404, { error: 'This review server is not connected to a shared CIVIC store.' }); return }
        const input = await body(req)
        if (!Array.isArray(input.annotationIds) || input.annotationIds.length === 0 || input.annotationIds.length > 50 || input.annotationIds.some((id) => typeof id !== 'string' || !/^annotation:[0-9a-f-]{36}$/.test(id))) bad('Choose saved annotations to hand off')
        const checks = Array.isArray(input.checks) ? input.checks.map((check) => text(check, 500)) : []
        json(201, await serial(() => shared.handOff({ annotationIds: input.annotationIds, ask: text(input.ask, 4000), checks }))); return
      }
      if (url.pathname === '/api/review/feedback' && req.method === 'GET') { json(200, (await serial(read)).map(withCurrentSource)); return }
      if (url.pathname === '/api/review/feedback' && req.method === 'POST') {
        const input = checkedFeedback(await body(req), metadata, screens)
        const { row, duplicate } = await serial(async () => {
          const rows = await read()
          const previous = rows.find((row) => row.id === input.id)
          if (previous) return { row: previous, duplicate: true }
          const serverRevision = structuredClone(metadata.revision)
          const screenshot = await capture(input.html, input.context.viewport, { origin: `http://${host}`, cookie: `review_session=${session}` })
          await writeFile(join(dataDir, input.id + '.png'), screenshot, { mode: 0o600 })
          const { html: _html, snapshot, ...data } = input
          const reproduction = `/review?scenario=${encodeURIComponent(input.context.scenario)}&persona=${input.context.persona}&role=${input.context.role}&condition=${input.context.condition}&theme=${input.context.theme}&scale=${input.context.textScale}&width=${input.context.viewport.width}&feedback=${input.id}`
          const annotationId = shared ? await shared.record({ feedback: { ...data, revision: snapshot.revision }, screenshot, origin: `http://${host}` }) : undefined
          const row = { ...data, ...(annotationId ? { annotationId } : {}), revision: snapshot.revision, design: snapshot.design, serverRevision, sourceStale: snapshot.revision.source !== serverRevision.source || snapshot.revision.head !== serverRevision.head, createdAt: Date.now(), status: 'new', screenshot: `/api/review/screenshots/${input.id}.png`, reproduction }
          await write([...rows, row]); return { row, duplicate: false }
        })
        json(duplicate ? 200 : 201, withCurrentSource(row)); return
      }
      const screenshot = /^\/api\/review\/screenshots\/([0-9a-f-]+)\.png$/.exec(url.pathname)
      if (screenshot && req.method === 'GET' && uuid.test(screenshot[1])) {
        if (!(await serial(read)).some((row) => row.id === screenshot[1])) { json(404, { error: 'Screenshot missing' }); return }
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(await readFile(join(dataDir, screenshot[1] + '.png'))); return
      }
      const resolution = /^\/api\/review\/feedback\/([0-9a-f-]+)\/resolve$/.exec(url.pathname)
      if (resolution && req.method === 'POST' && uuid.test(resolution[1])) {
        const evidence = text((await body(req)).evidence, 2000)
        const row = await serial(async () => { const rows = await read(); const row = rows.find((row) => row.id === resolution[1]); if (!row) bad('Feedback missing'); row.status = 'resolved'; row.resolution = { evidence, at: Date.now(), revision: metadata.revision }; await write(rows); return row })
        json(200, withCurrentSource(row)); return
      }
      if (url.pathname.startsWith('/api/') || url.pathname === '/design-preview') { json(404, { error: 'Only the isolated review is served here' }); return }
      next()
    } catch (error) { json(error.status ?? 503, { error: error.status ? error.message : 'Could not save or load review feedback. Your unsent note is retained; retry.' }) }
  }
  return Object.assign(middleware, { refreshCoverage: () => bridge?.get() })
}

/** Rasterizes the submitted synthetic DOM with scripts disabled and all external requests blocked. */
export async function captureReview(html, viewport, { origin, cookie }) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const context = await browser.newContext({ viewport, javaScriptEnabled: false })
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin && ['image', 'font', 'stylesheet'].includes(request.resourceType())) await route.continue({ headers: { ...request.headers(), cookie } })
      else await route.abort()
    })
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 })
    await page.evaluate(() => { for (const element of document.querySelectorAll('[data-review-scroll]')) element.scrollTop = Number(element.getAttribute('data-review-scroll')) })
    return await page.screenshot({ type: 'png', timeout: 15000 })
  } finally { await browser.close() }
}
