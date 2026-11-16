import { projectFetch } from './project-request'

export function attachBrowserPresence() {
  if (window.top !== window || window.civicDesktop) return () => null
  let stopped = false, socket: WebSocket | undefined, retry: ReturnType<typeof setTimeout>, disconnectedAt = Date.now()
  const controller = new AbortController()
  const reconnect = () => {
    if (stopped) return
    if (Date.now() - disconnectedAt >= 10_000) {
      const message = document.createElement('p')
      message.setAttribute('role', 'alert')
      message.textContent = 'CIVIC lost its connection. Open CIVIC from the desktop app or local launcher, then reload this tab.'
      document.body.prepend(message)
      return
    }
    retry = setTimeout(() => { connect().catch(reconnect) }, 500)
  }
  const connect = async () => {
    try {
      const response = await projectFetch('/api/review/presence-ticket', { method: 'POST', signal: controller.signal })
      if (!response.ok) throw Error('Connection unavailable')
      const { ticket } = await response.json()
      if (stopped) return
      socket = new WebSocket(location.origin.replace(/^http/u, 'ws') + '/api/civic/control', ['civic-control', ticket])
      socket.addEventListener('open', () => { disconnectedAt = 0 })
      socket.addEventListener('close', () => { if (!disconnectedAt) disconnectedAt = Date.now(); reconnect() })
    } catch { reconnect() }
  }
  projectFetch('/api/review/index', { signal: controller.signal }).then(response => response.json()).then(index => {
    if (index.managedPresence && !stopped) return connect()
    return null
  }).catch(() => null)
  const close = () => { stopped = true; controller.abort(); clearTimeout(retry); socket?.close() }
  window.addEventListener('pagehide', close, { once: true })
  return () => { window.removeEventListener('pagehide', close); close() }
}
