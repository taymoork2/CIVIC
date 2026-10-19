import receipt from './receipt.json'
import scenarios from './civic.scenarios.json'
import { captureScreen } from '@civic/shell/capture'

export async function mount(container, context) {
  if (context.scenario.fixture.componentError) throw Error(context.scenario.fixture.componentError)
  if (context.scenario.fixture.component) return (await import('./component-preview.mjs')).mount(container, context)
  if (context.recording) throw Error('Live Orca recordings are observational evidence. Replay against the changing real backend is not supported.')
  const bootstrap = await fetch('/__orca/bootstrap').then(async response => { if (!response.ok) throw Error((await response.json()).error); return response.json() })
  if (bootstrap.ui !== receipt.ui || bootstrap.server !== receipt.server) throw Error('Orca updated since this connection was captured. Refresh its onboarding to bind the new build.')
  const { name } = context.scenario.fixture
  const route = bootstrap.routes[name]
  if (!route) throw Error('This screen needs an existing project, work item or session in Orca. No data was fabricated.')
  const originalSocket = window.WebSocket
  window.WebSocket = class extends originalSocket {
    constructor(url, protocols) {
      const target = new URL(url, location.href)
      if (target.host === location.host && target.pathname === '/ws') target.pathname = '/__orca/ws'
      super(target.href, protocols)
    }
  }
  const note = document.createElement('aside')
  note.setAttribute('aria-label', 'Orca live connection')
  note.style.cssText = 'position:fixed;z-index:99999;bottom:0;right:0;max-width:100%;padding:4px 8px;background:#163b32;color:white;font:11px/1.4 system-ui;pointer-events:none'
  note.textContent = `Live Orca · Web · UI ${bootstrap.ui} / server ${bootstrap.server} · browse only; writes blocked`
  const app = document.createElement('div'); app.id = 'root'
  container.append(app, note)
  document.documentElement.classList.add('dark')
  document.documentElement.style.colorScheme = 'dark'
  for (const path of bootstrap.css) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/__orca' + path; document.head.append(link) }
  const meta = document.createElement('meta'); meta.name = 'orca-revision'; meta.content = bootstrap.ui; document.head.append(meta)
  const initial = location.href
  history.replaceState(null, '', route)
  const classify = path => scenarios.find(row => row.route && new RegExp('^' + row.route.replace(/:[a-zA-Z]+/g, '[^/]+') + '/?$').test(path))?.id ?? null
  let current = classify(location.pathname), departing = null, stopped = false
  context.publish({ screen: current })
  // Record only route labels. Live prompts, drafts, credentials and transcript bodies are not input captures.
  const click = event => {
    const link = event.target.closest('a[href]')
    const next = link && classify(new URL(link.href, location.href).pathname)
    const edge = scenarios.find(row => row.id === current)?.edges.find(edge => edge.destination === next)
    if (edge) departing = { from: current, to: next, action: edge.action, html: captureScreen(document) }
  }
  document.addEventListener('click', click, true)
  await import(/* @vite-ignore */ '/__orca' + bootstrap.script)
  const readyUntil = Date.now() + 10000
  while (!app.querySelector('main') && Date.now() < readyUntil) await new Promise(resolve => setTimeout(resolve, 40))
  if (!app.querySelector('main')) throw Error('The actual Orca app did not mount')
  const settle = async () => { await new Promise(resolve => setTimeout(resolve, 150)) }
  context.connectRuntime({
    seed: { mode: 'live-read-only', ui: bootstrap.ui, server: bootstrap.server }, now: Date.now(),
    screen: () => classify(location.pathname) ?? 'unmapped', route: () => location.pathname,
    captureInputs: [], data: () => ({ ui: bootstrap.ui, server: bootstrap.server, mode: 'live-read-only', screen: current }),
    settle, reset: async () => { throw Error('Live Orca cannot be reset or deterministically replayed by CIVIC.') },
    assertSource: async () => { const now = await fetch('/__orca/bootstrap').then(response => response.json()); if (now.ui !== bootstrap.ui || now.server !== bootstrap.server) throw Error('The served Orca build changed. Reconnect before recording more evidence.') },
    subscribe(changed) {
      const update = () => {
        const next = classify(location.pathname)
        if (!stopped && next && next !== current) {
          if (departing?.from === current && departing.to === next) context.transition(next, departing.action, 'app', departing.html)
          departing = null; current = next; changed()
        }
      }
      const observer = new MutationObserver(update); observer.observe(app, { subtree: true, childList: true })
      window.addEventListener('popstate', update)
      return () => { observer.disconnect(); window.removeEventListener('popstate', update) }
    },
  })
  context.publish({ screen: current })
  return () => { stopped = true; document.removeEventListener('click', click, true); window.WebSocket = originalSocket; history.replaceState(null, '', initial); container.replaceChildren() }
}
