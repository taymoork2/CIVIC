import receipt from './receipt.json'
import scenarios from './civic.scenarios.json'
import { openRuntimeSession } from '@civic/canvas/runtime-session'

export async function mount(container, context) {
  if (context.scenario.fixture.componentError) throw Error(context.scenario.fixture.componentError)
  const componentEntry = './component-preview.mjs'
  if (context.scenario.fixture.component) return (await import(/* @vite-ignore */ componentEntry)).mount(container, context)
  const run = await openRuntimeSession(context)
  const routes = { home: '/', project: `/p/${run.session.seed.projectId}`, work: `/w/${run.session.seed.workItemId}`, session: `/s/${run.session.seed.sessionId}`, settings: '/settings', 'project-settings': `/p/${run.session.seed.projectId}/settings`, 'new-project': '/projects/new', projects: '/projects', learning: '/learning', 'project-learning': `/p/${run.session.seed.projectId}/learning`, problems: '/problems' }
  const classify = () => scenarios.find(row => row.route && new RegExp('^' + row.route.replace(/:[a-zA-Z]+/g, '[^/]+') + '/?$').test(location.pathname))?.id ?? 'unmapped'
  const originalSocket = window.WebSocket
  const sockets = new Set()
  let state, pending = new Set()
  const reads = new Set(['GetAppSettings', 'GetProjectSettings', 'InspectInterruptedWork', 'ListHarnesses', 'SessionActivity', 'ListPreviews', 'GetLearning', 'GetIncidents', 'GetHarnessCatalog', 'GetGuidance'])
  // The app keeps its own protocol and handlers; only its transport points at this run's backend.
  class IsolatedSocket extends EventTarget {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3
    readyState = 0
    constructor() { super(); sockets.add(this); queueMicrotask(() => { this.readyState = 1; const event = new Event('open'); this.dispatchEvent(event); this.onopen?.(event) }) }
    emit(data) { if (this.readyState === 1) { const event = new MessageEvent('message', { data: JSON.stringify(data) }); this.dispatchEvent(event); this.onmessage?.(event) } }
    send(raw) {
      const task = (async () => {
        const message = JSON.parse(raw)
        if (message._tag === 'Hello') this.emit({ _tag: 'Snapshot', snapshot: await run.transport.request('query', 'snapshot', {}) })
        else if (message._tag === 'LoadTranscript') this.emit({ _tag: 'Transcript', sessionId: message.sessionId, entries: await run.transport.request('query', 'transcript', { sessionId: message.sessionId }) })
        else if (message._tag === 'Command') {
          try {
            const read = reads.has(message.command._tag)
            const result = await run.transport.request(read ? 'query' : 'mutation', 'command', message.command)
            this.emit({ _tag: 'CommandResult', id: message.id, ok: true, result })
            if (!read) this.emit({ _tag: 'Snapshot', snapshot: await run.transport.request('query', 'snapshot', {}) })
          } catch (error) { this.emit({ _tag: 'CommandResult', id: message.id, ok: false, error: error.message }) }
        }
        else if (message._tag?.startsWith('Terminal')) this.emit({ _tag: 'TerminalError', workItemId: message.workItemId, message: 'Terminals are unavailable in this isolated preview. Verify terminal behavior in Orca’s own tests.' })
      })()
      pending.add(task); void task.finally(() => pending.delete(task)).catch(() => {})
    }
    close() { this.readyState = 3; sockets.delete(this); const event = new Event('close'); this.dispatchEvent(event); this.onclose?.(event) }
  }
  window.WebSocket = IsolatedSocket
  const initial = location.href
  history.replaceState(null, '', routes[context.scenario.fixture.name])
  for (const path of receipt.css) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/__orca-isolated' + path; document.head.append(link) }
  const meta = document.createElement('meta'); meta.name = 'orca-revision'; meta.content = receipt.ui; document.head.append(meta)
  const app = document.createElement('div'); app.id = 'root'; container.append(app)
  const settle = async () => { while (pending.size) await Promise.allSettled([...pending]); await run.settle(); state = run.data(); await new Promise(resolve => setTimeout(resolve, 150)) }
  const bridge = context.connectRuntime({
    seed: run.seed, now: run.session.now, run, screen: classify, route: () => location.pathname,
    data: () => ({ ...state, projectPath: run.session.seed.projectPath }), captureInputs: 'synthetic', settle, assertSource: run.assertSource,
    // shortcut: protocol replay needs reset and event replay before Orca tapes can be certified.
    reset: async () => { throw Error('Orca protocol transport replay is not yet supported; use fresh authored behavior checks.') },
    subscribe(changed) { const observer = new MutationObserver(() => { if (classify() !== context.config.scenario) changed() }); observer.observe(app, { subtree: true, childList: true }); return () => observer.disconnect() },
  })
  run.transport.bind(bridge)
  await import(/* @vite-ignore */ '/__orca-isolated' + receipt.script)
  const deadline = Date.now() + 10000
  while (!app.querySelector('main') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 40))
  if (!app.querySelector('main')) throw Error('The actual Orca app did not mount')
  await settle()
  const note = document.createElement('aside'); note.textContent = 'Isolated Orca · synthetic database · model and host actions disabled'; note.style.cssText = 'position:fixed;bottom:0;right:0;background:#163b32;color:white;font:11px system-ui;z-index:99999'; container.append(note)
  return () => { for (const socket of sockets) socket.close(); window.WebSocket = originalSocket; history.replaceState(null, '', initial); run.close() }
}
