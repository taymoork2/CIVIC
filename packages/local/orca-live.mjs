import { createRequire } from 'node:module'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { loadProject } from '@civic/vite-connector/project'
import { projectPicker } from '@civic/vite-connector/projects'
import { reviewInventory } from '@civic/vite-connector/inventory'
import { bindScreens, componentBuildStatus, registerComponents } from './orca-drafts.mjs'

const frontend = 'http://127.0.0.1:5734'
const backend = 'http://127.0.0.1:4417'
const reads = new Set(['ListFiles', 'ListHarnesses', 'SessionActivity', 'WorktreeDiff', 'WorktreeFileDiff', 'GetHarnessCatalog', 'UpdateStatus', 'ListPreviews', 'PreviewLogs', 'GetAppSettings', 'GetProjectSettings', 'InspectWork', 'InspectInterruptedWork'])
export const browseMessage = input => Boolean(input && !Array.isArray(input) && (input._tag === 'Hello' || input._tag === 'LoadTranscript' && typeof input.sessionId === 'string' || input._tag === 'Command' && typeof input.id === 'string' && reads.has(input.command?._tag)))
export const allowedAsset = path => /^\/assets\/[a-zA-Z0-9_-]+\.(?:js|css|woff2?|png|svg)$/.test(path) || ['/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'].includes(path)
const routes = [
  ['home', 'Home', '/', 'apps/web/src/routes/pages.tsx'],
  ['project', 'Project and assistant', '/p/:projectId', 'apps/web/src/routes/pages.tsx'],
  ['work', 'Work detail and implementation evidence', '/w/:workItemId', 'apps/web/src/routes/WorkItem.tsx'],
  ['session', 'Session transcript', '/s/:sessionId', 'apps/web/src/routes/pages.tsx'],
  ['project-settings', 'Project settings', '/p/:projectId/settings', 'apps/web/src/routes/settings.tsx'],
  ['settings', 'App settings', '/settings', 'apps/web/src/routes/settings.tsx'],
  ['new-project', 'Add project', '/projects/new', 'apps/web/src/routes/pages.tsx'],
]
export function routeScreen(path) {
  const row = routes.find(([, , route]) => new RegExp('^' + route.replace(/:[a-zA-Z]+/g, '[^/]+') + '/?$').test(path))
  return row ? `orca.live.${row[0]}` : null
}
export function liveScenarios() {
  const destinations = { home: ['project', 'settings', 'new-project'], project: ['home', 'work', 'project-settings', 'settings', 'new-project'], work: ['home', 'project', 'settings', 'new-project'], session: ['home', 'project', 'work', 'settings', 'new-project'], 'project-settings': ['home', 'project', 'settings', 'new-project'], settings: ['home', 'project', 'new-project'], 'new-project': ['home', 'project', 'settings'] }
  return bindScreens(routes.map(([name, label, route, component]) => ({
    id: `orca.live.${name}`, label, journey: 'Orca · real user journey', section: 'Live implementation', component,
    route, viewport: { width: 1440, height: 900 },
    fixture: { route, name }, preview: 'live-read-only', behavior: 'Live implementation; journey traversal unverified', captureFields: [],
    // These are real router destinations, not evidence that a person traversed them.
    edges: routes.filter(([destination]) => destinations[name].includes(destination)).map(([destination, title]) => ({ destination: `orca.live.${destination}`, action: `Open ${title}` })),
  })), 'live')
}
const forwarded = headers => Object.fromEntries(['tailscale-user-login', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host'].filter(name => headers[name] !== undefined).map(name => [name, headers[name]]))
const wsLibrary = source => createRequire(join(source, 'apps/server/package.json'))('ws')

async function upstreamIndex(headers) {
  const response = await fetch(frontend + '/', { headers: forwarded(headers), redirect: 'manual', signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw Object.assign(Error('Orca refused this caller or its frontend is unavailable'), { status: response.status })
  const html = await response.text()
  const script = html.match(/<script[^>]+src="(\/assets\/[^"?]+\.js)"/)?.[1]
  const css = [...html.matchAll(/<link[^>]+href="(\/assets\/[^"?]+\.css)"/g)].map(match => match[1])
  const ui = html.match(/name="orca-revision" content="([a-f0-9]+)"/)?.[1]
  if (!script || !allowedAsset(script) || !css.length || css.some(path => !allowedAsset(path)) || !ui) throw Error('Orca frontend entry changed; inspect it before reconnecting')
  const health = await fetch(backend + '/health', { signal: AbortSignal.timeout(5000) }).then(response => response.json())
  return { script, css, ui, server: health.revision, activeSessions: health.activeSessions, queuedInputs: health.queuedInputs, startedAt: health.startedAt }
}
async function readOrca(source, headers, request = { _tag: 'Hello' }) {
  const { WebSocket } = wsLibrary(source)
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(frontend.replace('http:', 'ws:') + '/ws', { headers: { ...forwarded(headers), origin: frontend }, maxPayload: 16 * 1024 * 1024 })
    let completed = false
    const timer = setTimeout(() => { ws.terminate(); reject(Error('Orca read timed out')) }, 5000)
    ws.on('open', () => ws.send(JSON.stringify(request)))
    ws.on('error', reject)
    ws.on('message', raw => { try { const data = JSON.parse(raw); if (data._tag === 'Snapshot' || data._tag === 'CommandResult' && data.id === request.id) { completed = true; clearTimeout(timer); ws.close(); if (data.ok === false) reject(Error(data.error)); else resolve(data.snapshot ?? data.result) } } catch (error) { reject(error); ws.close() } })
    ws.on('close', () => { clearTimeout(timer); if (!completed) reject(Error('Orca closed the connection before returning its read receipt')) })
  })
}
export async function connectOrca(store, source) {
  const folder = join(store, 'projects/orca-live')
  await mkdir(folder, { recursive: true, mode: 0o700 })
  const entry = await upstreamIndex({})
  const json = (name, value) => writeFile(join(folder, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  await json('civic.scenarios.json', liveScenarios())
  await json('civic.coverage.json', { version: 1, targets: [{ id: 'orca.live.browse', title: 'Home → Project → Work → Home', kind: 'journey', scenarios: ['home', 'project', 'work'].map(name => `orca.live.${name}`), acceptance: ['Traverse actual controls against the running Orca instance; inspect retained state and implementation evidence.', 'Viewport changes preserve the journey; each capture retains its actual dimensions.', 'A declared edge, rendered screen or saved capture alone does not prove this whole journey.'] }] })
  await json('receipt.json', { ...entry, capturedAt: new Date().toISOString(), mode: 'live-read-only', source, frontend, backend })
  await copyFile(new URL('./orca-live-preview.mjs', import.meta.url), join(folder, 'preview.mjs'))
  await copyFile(new URL('./orca-live-extension.mjs', import.meta.url), join(folder, 'extension.mjs'))
  await json('civic.project.json', { version: 1, id: 'orca-live', name: 'Orca · live implementation', adapter: { kind: 'orca-live', mode: 'live-read-only', entry: 'preview.mjs', extension: 'extension.mjs' }, sources: ['apps/web/src', 'packages/contracts/src'], scenarios: 'civic.scenarios.json', coverage: 'civic.coverage.json', personas: [{ id: 'owner', label: 'Current Orca instance' }], roles: [{ id: 'browse', label: 'Browse and record; live writes blocked' }], conditions: [{ id: 'live', label: 'Live backend; not a deterministic test run' }], navigation: ['Live implementation'] })
  await registerComponents(folder, source, 'live', 'Components')
  const project = loadProject(store, { manifest: join(folder, 'civic.project.json'), applicationRoot: source })
  const picker = await projectPicker(store, project, { kinds: ['module', 'laundry', 'orca-live'] })
  await picker.organize({ key: project.key, app: { id: 'orca', name: 'Orca' }, kind: 'live' })
  await picker.select(project.key)
  return { key: project.key, ...entry }
}
export const orcaConnector = {
  kind: 'orca-live', sharedStore: () => false,
  async inventory(store, designRoot, appRoot) {
    const project = loadProject(store)
    const result = await reviewInventory(store, designRoot, appRoot, project, { connector: { kind: 'orca-live' }, engineRoots: [new URL('.', import.meta.url).pathname] })
    await componentBuildStatus(result, project)
    const [entry, state] = await Promise.all([upstreamIndex({}), readOrca(project.root, {})])
    const binding = createHash('sha256').update(JSON.stringify([entry.ui, entry.server, entry.script, entry.css])).digest('hex')
    result.metadata.revision.source = createHash('sha256').update(result.metadata.revision.source + binding).digest('hex')
    result.metadata.fixtureSource = createHash('sha256').update(result.metadata.revision.source + String(state.cursor)).digest('hex')
    result.metadata.fixtureHashes = Object.fromEntries(result.metadata.scenarios.map(row => [row.id, result.metadata.fixtureSource]))
    result.metadata.connection = { ...result.metadata.connection, mode: 'live-read-only', servedUI: entry.ui, runningServer: entry.server, refresh: 'Reload to bind to a newer served build; open recordings keep their original revision.' }
    result.metadata.limits = ['Actual installed Orca UI and backend, in read-only browse mode.', 'Agent commands, approvals, drafts, settings saves and other writes are refused by the proxy.', 'Recordings capture navigation, not deterministic replay or complete journey acceptance.', 'Desktop web inside CIVIC is not proof of Orca native Electron APIs or physical-device acceptance.']
    return result
  },
}

export function orcaLivePlugin({ store, source, publicOrigin }) {
  const live = loadProject(store).manifest.adapter.kind === 'orca-live'
  const allowedHosts = new Set(['127.0.0.1:3012', 'localhost:3012', ...(publicOrigin ? [new URL(publicOrigin).host] : [])])
  const authorize = async req => {
    const host = req.headers.host
    if (!allowedHosts.has(host) || req.headers.origin && req.headers.origin !== (host === new URL(publicOrigin ?? 'http://127.0.0.1:3012').host ? publicOrigin : `http://${host}`)) return false
    const response = await fetch('http://127.0.0.1:3012/api/review/index', { headers: { cookie: req.headers.cookie ?? '', authorization: req.headers.authorization ?? '' }, signal: AbortSignal.timeout(5000) })
    return response.ok && (await response.json()).project?.id === 'orca-live'
  }
  return {
    name: 'civic-orca-live',
    enforce: 'pre',
    async configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!live && !req.url?.startsWith('/__orca/')) return next()
        // Fixture capture is loopback, so gate the entire live project before CIVIC can capture on a remote caller's behalf.
        if (live && Object.keys(forwarded(req.headers)).length) {
          let owner
          try { owner = (await readOrca(source, {}, { _tag: 'Command', id: 'civic-owner', command: { _tag: 'GetAppSettings' } })).remote?.owner } catch {}
          if (!owner || req.headers['tailscale-user-login'] !== owner) {
            res.writeHead(403, { 'content-type': 'text/plain', 'cache-control': 'no-store' }); res.end('Live Orca is local-only for this caller: its configured Tailscale owner does not match. Open CIVIC at http://127.0.0.1:3012/review.'); return
          }
        }
        if (!req.url?.startsWith('/__orca/') && !['/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'].includes(req.url)) return next()
        const json = (status, data) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)) }
        try {
          if (req.method !== 'GET' || !await authorize(req)) return json(403, { error: 'Open the live Orca project in CIVIC first; caller or origin refused.' })
          if (req.url === '/__orca/bootstrap') {
            const [entry, data] = await Promise.all([upstreamIndex(req.headers), readOrca(source, req.headers)])
            const project = data.projects[0], work = data.workItems.find(row => row.projectId === project?.id), session = data.sessions.find(row => row.workItemId === work?.id)
            return json(200, { ...entry, routes: { home: '/', settings: '/settings', 'new-project': '/projects/new', ...(project ? { project: `/p/${project.id}`, 'project-settings': `/p/${project.id}/settings` } : {}), ...(work ? { work: `/w/${work.id}` } : {}), ...(session ? { session: `/s/${session.id}` } : {}) } })
          }
          const assetURL = new URL(req.url, 'http://127.0.0.1')
          if (assetURL.search && assetURL.search !== '?import') return json(400, { error: 'Unregistered asset query' })
          const path = assetURL.pathname.replace(/^\/__orca/, '')
          if (!allowedAsset(path)) return json(404, { error: 'Unregistered Orca asset' })
          const response = await fetch(frontend + path, { headers: forwarded(req.headers), redirect: 'manual', signal: AbortSignal.timeout(5000) })
          res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) { json(error.status ?? 503, { error: error.message }) }
      })
      const { WebSocket, WebSocketServer } = wsLibrary(source)
      const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 })
      const active = new Set()
      const upgrade = async (req, socket, head) => {
        if (req.url !== '/__orca/ws') return
        socket.on('error', () => socket.destroy())
        try {
          if (!req.headers.origin || !await authorize(req)) return socket.destroy()
          // The original forwarded identity still passes Orca's own owner gate. No owner is synthesized.
          await upstreamIndex(req.headers)
          wss.handleUpgrade(req, socket, head, downstream => {
            const upstream = new WebSocket(frontend.replace('http:', 'ws:') + '/ws', { headers: { ...forwarded(req.headers), origin: frontend }, maxPayload: 16 * 1024 * 1024, handshakeTimeout: 5000 })
            active.add(upstream); active.add(downstream)
            const waiting = []
            const close = () => { upstream.terminate(); downstream.terminate(); active.delete(upstream); active.delete(downstream) }
            upstream.on('open', () => { for (const raw of waiting) upstream.send(raw); waiting.length = 0 })
            upstream.on('message', raw => {
              if (downstream.readyState === WebSocket.OPEN) downstream.send(raw.toString())
              try { if (JSON.parse(raw)._tag === 'Event') vite.watcher.emit('change', loadProject(store).manifestPath) } catch {}
            })
            downstream.on('message', raw => {
              try {
                const message = JSON.parse(raw)
                if (!browseMessage(message)) { downstream.send(JSON.stringify({ _tag: 'CommandResult', id: typeof message?.id === 'string' ? message.id : '?', ok: false, error: 'CIVIC is browsing live Orca. Make changes and send messages in Orca itself.' })); return }
                if (upstream.readyState === WebSocket.OPEN) upstream.send(raw.toString())
                else if (waiting.length < 20) waiting.push(raw.toString()); else close()
              } catch { close() }
            })
            for (const ws of [upstream, downstream]) ws.on('close', close).on('error', close)
          })
        } catch { socket.destroy() }
      }
      vite.httpServer.on('upgrade', upgrade)
      vite.httpServer.once('close', () => { vite.httpServer.off('upgrade', upgrade); for (const ws of active) ws.terminate(); wss.close() })
    },
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { store } = await import('./onboard.mjs')
  if (!process.argv[2]) throw Error('Pass the installed Orca source folder, e.g. ~/.orca-dogfood/app')
  console.log(await connectOrca(store, process.argv[2]))
}
