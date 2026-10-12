import { projectFetch } from './project-request'
import type { RuntimeBridge } from './runtime-bridge'
import type { AdapterContext } from './adapter'

// Captured before any run routes the page's fetch, so CIVIC's own requests never loop back.
const pageFetch = globalThis.fetch.bind(globalThis)

export async function runtimeRequest<T>(input: Record<string, unknown>): Promise<T> {
  const response = await projectFetch('/api/review/runtime', { method: 'POST', keepalive: input.action === 'close', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }, pageFetch)
  const result = await response.json()
  if (!response.ok) throw Object.assign(Error(result.error ?? 'Isolated runtime unavailable'), { data: result.data })
  return result
}
/** A persona's synthetic review identity for one run. `credential` is fresh per run and is only ever typed into this page's sign-in form. */
export type ReviewIdentity = { id: string; name: string; email: string; credential: string; signedIn: boolean }
export type RuntimeSession<Seed = unknown> = { id: string; source: string; project: string; now: number; seed: Seed; identity: ReviewIdentity | null }
// What the page sends in place of the run's credential; the run swaps it back, so recordings never hold it.
export const credentialPlaceholder = '[review credential]'

/** One request boundary records effects regardless of which screen initiated them. */
export function runtimeTransport(session: { id: string }) {
  let bridge: RuntimeBridge | undefined
  const pending = new Set<Promise<unknown>>()
  const request = <T>(action: string, name?: string, args?: unknown): Promise<T> => {
    const execute = () => runtimeRequest<T>({ action, run: session.id, ...(name ? { name, args } : {}) })
    const work = action === 'mutation' || action === 'action' ? bridge ? bridge.operation(action, name!, args, execute) : execute() : execute()
    pending.add(work); void work.finally(() => pending.delete(work)).catch(() => {})
    return work
  }
  return { request, bind: (value: RuntimeBridge) => { bridge = value }, settle: async () => { while (pending.size) await Promise.allSettled([...pending]) } }
}
export type RuntimeTransport = ReturnType<typeof runtimeTransport>

function memoryStorage(): Storage {
  const rows = new Map<string, string>()
  return { get length() { return rows.size }, getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => { rows.set(String(key), String(value)) }, removeItem: (key) => { rows.delete(key) }, clear: () => rows.clear(), key: (index) => [...rows.keys()][index] ?? null }
}

type SessionContext = Pick<AdapterContext, 'scenario' | 'persona' | 'role' | 'condition' | 'snapshot' | 'recording'>

/**
 * Starts an isolated run and pins what the page would otherwise take from the reviewer's machine:
 * the clock, random IDs and browser storage. Replays reuse the recording's clock and entropy.
 */
export async function openRuntimeSession<Seed = unknown>(context: SessionContext) {
  const previous = (context.recording?.seed as { application?: { timeZone?: string; entropySeed?: string } } | undefined)?.application
  const timeZone = previous?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const session = await runtimeRequest<RuntimeSession<Seed>>({ action: 'start', scenario: context.scenario.id, persona: context.persona.id, role: context.role.id, condition: context.condition.id, timeZone, ...(context.recording ? { now: context.recording.now } : {}) })
  if (session.source !== context.snapshot.revision.source) { await runtimeRequest({ action: 'close', run: session.id }); throw Error('Source changed during startup. Start a new run.') }
  const transport = runtimeTransport(session)
  const OriginalDate = Date, uuidDescriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID')
  const entropySeed = previous?.entropySeed ?? crypto.randomUUID()
  let sequence = 0, data: unknown = null, closed = false
  const stores = ['localStorage', 'sessionStorage'].map((key) => ({ key, descriptor: Object.getOwnPropertyDescriptor(window, key)!, storage: memoryStorage() }))
  globalThis.Date = new Proxy(OriginalDate, {
    construct: (target, args) => Reflect.construct(target, args.length ? args : [session.now]),
    apply: () => new OriginalDate(session.now).toString(),
    get: (target, key) => key === 'now' ? () => session.now : Reflect.get(target, key),
  })
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => entropySeed.slice(0, 24) + (++sequence).toString(16).padStart(12, '0') })
  for (const { key, storage } of stores) Object.defineProperty(window, key, { configurable: true, value: storage })
  return {
    session, transport,
    seed: { scenario: context.scenario.id, persona: context.persona, role: context.role.id, condition: context.condition.id, timeZone, entropySeed },
    data: () => ({ ...data as object, runId: session.id }),
    async settle() {
      for (let index = 0; index < 3; index++) { await transport.settle(); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())) }
      data = await transport.request('state')
    },
    async reset() { await transport.request('reset'); for (const { storage } of stores) storage.clear(); sequence = 0 },
    async assertSource() { await runtimeRequest({ action: 'state', run: session.id }) },
    close() {
      if (closed) return
      closed = true; globalThis.Date = OriginalDate
      if (uuidDescriptor) Object.defineProperty(crypto, 'randomUUID', uuidDescriptor); else Reflect.deleteProperty(crypto, 'randomUUID')
      for (const { key, descriptor } of stores) Object.defineProperty(window, key, descriptor)
      void runtimeRequest({ action: 'close', run: session.id }).catch(() => {})
    },
  }
}
export type OpenRuntimeSession = Awaited<ReturnType<typeof openRuntimeSession>>

/**
 * The HTTP adapter: the page's own `fetch` calls under `prefixes` go to the run's fetch handler
 * instead of a server. Reads run as queries; writes are recorded as operations and replayed.
 * Everything else, including CIVIC's own `/api/review/` requests, is refused or passed through unchanged.
 */
export function routeFetch(transport: RuntimeTransport, prefixes: string[], credential?: string) {
  const conceal = (text: string) => credential ? text.replaceAll(credential, credentialPlaceholder).replaceAll(encodeURIComponent(credential), credentialPlaceholder) : text
  const routed = (url: URL) => url.origin === location.origin && !url.pathname.startsWith('/api/review/') && prefixes.some((prefix) => url.pathname.startsWith(prefix))
  const isolated: typeof fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url)
    if (!routed(url)) return pageFetch(input, init)
    const method = request.method.toUpperCase(), write = !['GET', 'HEAD'].includes(method)
    const body = write ? conceal(await request.text()) : undefined
    const args = { query: conceal(url.search), ...(body ? { body, type: request.headers.get('content-type') ?? 'application/json' } : {}) }
    try {
      const result = await transport.request<{ status: number; type: string; body: string }>(write ? 'mutation' : 'query', `${method}:${url.pathname}`, args)
      return new Response(method === 'HEAD' || [204, 304].includes(result.status) ? null : result.body, { status: result.status, headers: result.type ? { 'content-type': result.type } : {} })
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 503 })
    }
  }
  globalThis.fetch = isolated
  return () => { if (globalThis.fetch === isolated) globalThis.fetch = pageFetch }
}

/**
 * Fills sign-in password fields with the run's review credential, as a password manager would, so a reviewer
 * signing in as the persona never types or sees a secret, and a replay signs in again. Password fields are never recorded.
 */
export function fillCredentials(root: HTMLElement, credential: string) {
  const fill = () => {
    for (const input of root.querySelectorAll<HTMLInputElement>('input[type="password"]')) {
      if (input.value || input.dataset.civicCredential === credential) continue
      input.dataset.civicCredential = credential
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, credential)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }
  const observer = new MutationObserver(fill)
  observer.observe(root, { childList: true, subtree: true })
  fill()
  return () => observer.disconnect()
}
