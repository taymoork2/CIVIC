import { projectFetch } from './project-request'
import type { RuntimeBridge } from './runtime-bridge'
import type { AdapterContext } from './adapter'

// Captured before any run routes the page's fetch, so CIVIC's own requests never loop back.
const pageFetch = globalThis.fetch.bind(globalThis)

export async function runtimeRequest<T>(input: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await projectFetch('/api/review/runtime', { method: 'POST', signal, keepalive: input.action === 'close', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }, pageFetch)
  const result = await response.json()
  if (!response.ok) throw Object.assign(Error(result.error ?? 'Isolated runtime unavailable'), { data: result.data })
  return result
}
/** A persona's synthetic review identity for one run. `credential` is fresh per run and is only ever typed into this page's sign-in form. */
export type ReviewIdentity = { id: string; name: string; email: string; credential: string; signedIn: boolean }
/**
 * One isolated run. `account` and `subject` say who is acting now and `accounts` which synthetic accounts the run
 * can switch to; `clock` is the run's clock, which moves only by an explicit time step. `lease` is this page's hold on
 * the run: a page that reopened it holds a newer one, so an older page closing never stops it.
 */
export type RuntimeSession<Seed = unknown> = { id: string; source: string; project: string; now: number; seed: Seed; identity: ReviewIdentity | null; account: string | null; subject: string | null; accounts: string[]; clock: number; lease: string }
// What the page sends in place of the run's credential; the run swaps it back, so recordings never hold it.
export const credentialPlaceholder = '[review credential]'

/** A write the page sent while the run's connection was down. It belongs to the account that made it, and is resent only by hand. */
export type PendingIntent = { id: string; account: string | null; subject: string | null; name: string; args: Record<string, unknown> }
type Recovery = { storage: Storage; actor: () => { account: string | null; subject: string | null }; start: () => string | null; accepted?: (args: Record<string, unknown>) => void }

/**
 * One request boundary records effects regardless of which screen initiated them. With `recovery`, it also owns
 * the run's connection: disconnecting aborts in-flight requests, a write made or cut off while the connection is
 * down is kept as a saved step for its account, and reconnecting never resends anything by itself.
 */
export function runtimeTransport(session: { id: string; project?: string }, recovery?: Recovery) {
  let bridge: RuntimeBridge | undefined
  const pending = new Set<Promise<unknown>>()
  let connected = true, partition = new AbortController()
  const listeners = new Set<() => void>(), key = `civic:pending:${session.project ?? ''}:${session.id}`
  const changed = () => { for (const listener of listeners) listener() }
  const intents = (): PendingIntent[] => { try { return recovery ? JSON.parse(recovery.storage.getItem(key) ?? '[]') : [] } catch { return [] } }
  const save = (rows: PendingIntent[]) => { recovery?.storage.setItem(key, JSON.stringify(rows)); changed() }
  const same = (row: PendingIntent, actor: { account: string | null; subject: string | null }) => row.account === actor.account && row.subject === actor.subject
  // Counts requests that can change the run's data, so a settle re-reads its state only after one.
  let revision = 0
  const request = <T>(action: string, name?: string, args?: unknown): Promise<T> => {
    const application = ['query', 'mutation', 'action'].includes(action)
    if (!['query', 'state', 'inspect'].includes(action)) revision++
    const actor = recovery?.actor()
    const execute = async () => {
      try {
        // Offline, nothing reaches the run: the request fails as a browser's would, and a write is kept as a saved step.
        if (application && !connected) throw new DOMException('The app is offline in this run.', 'AbortError')
        const result = await runtimeRequest<T>({ action, run: session.id, ...(actor?.subject && (application || action === 'state') ? { actor: actor.subject } : {}), ...(name ? { name } : {}), ...(args !== undefined ? { args } : {}) }, application ? partition.signal : undefined)
        if (action === 'mutation' && recovery && actor && args && typeof args === 'object') {
          recovery.accepted?.(args as Record<string, unknown>)
          // The app's own recovery and CIVIC's saved steps can both resend the same write; once accepted, neither keeps it.
          const kept = intents(), rest = kept.filter((row) => !(same(row, actor) && row.name === name && JSON.stringify(row.args) === JSON.stringify(args)))
          if (rest.length !== kept.length) save(rest)
        }
        return result
      } catch (error) {
        if (application && (error instanceof TypeError || (error as Error).name === 'AbortError')) {
          if (action === 'mutation' && recovery && actor && args && typeof args === 'object') {
            const rows = intents()
            if (!rows.some((row) => same(row, actor) && row.name === name && JSON.stringify(row.args) === JSON.stringify(args))) save([...rows, { id: crypto.randomUUID(), ...actor, name: name!, args: structuredClone(args) as Record<string, unknown> }])
          }
          if (connected) { connected = false; changed() }
          throw Error('The app\'s connection was interrupted. Review saved steps for this account before resending.')
        }
        throw error
      }
    }
    // Writes made after an account switch name the account on their receipt; a run that never switched records none.
    const by = actor && actor.account !== recovery?.start() ? actor.account ?? undefined : undefined
    const work = action === 'mutation' || action === 'action' ? bridge ? bridge.operation(action, name!, args, execute, by) : execute() : execute()
    pending.add(work); void work.finally(() => pending.delete(work)).catch(() => {})
    return work
  }
  return {
    request, bind: (value: RuntimeBridge) => { bridge = value }, settle: async () => { while (pending.size) await Promise.allSettled([...pending]) },
    connected: () => connected,
    revision: () => revision,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    /** Disconnecting aborts this page's in-flight app requests; review controls stay connected. */
    connect(value: boolean) { connected = value; partition.abort(); partition = new AbortController(); changed() },
    /** Saved steps of the account acting now; another account's are never shown or sent. */
    pending: () => recovery ? intents().filter((row) => same(row, recovery.actor())) : [],
    async apply(id: string) {
      const entry = recovery && intents().find((row) => row.id === id && same(row, recovery.actor()))
      if (!entry) throw Error('Switch back to the account that made this step to review it.')
      if (!connected) throw Error('Reconnect the app before resending a saved step.')
      const result = await request('mutation', entry.name, entry.args)
      save(intents().filter((row) => row.id !== id))
      return result
    },
    discard(id: string) {
      if (!recovery || !intents().some((row) => row.id === id && same(row, recovery.actor()))) throw Error('This saved step belongs to another account.')
      save(intents().filter((row) => row.id !== id))
    },
    resetRecovery: () => { if (recovery) save([]) },
  }
}
export type RuntimeTransport = ReturnType<typeof runtimeTransport>

function memoryStorage(): Storage {
  const rows = new Map<string, string>()
  return { get length() { return rows.size }, getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => { rows.set(String(key), String(value)) }, removeItem: (key) => { rows.delete(key) }, clear: () => rows.clear(), key: (index) => [...rows.keys()][index] ?? null }
}

/** Browser storage for one run and account, kept in the reviewer's real storage under a prefix, so a reopened run finds it. */
function scopedStorage(actual: Storage, prefix: () => string): Storage {
  const keys = () => Array.from({ length: actual.length }, (_, index) => actual.key(index)!).filter((key) => key.startsWith(prefix()))
  return {
    get length() { return keys().length },
    getItem: (key) => actual.getItem(prefix() + key), setItem: (key, value) => actual.setItem(prefix() + key, String(value)), removeItem: (key) => actual.removeItem(prefix() + key),
    clear: () => { for (const key of keys()) actual.removeItem(key) }, key: (index) => keys()[index]?.slice(prefix().length) ?? null,
  }
}

type SessionContext = Pick<AdapterContext, 'scenario' | 'persona' | 'role' | 'condition' | 'snapshot' | 'recording'>

/**
 * Starts an isolated run, or reopens the one named by the frame's `runtimeRun` parameter, and pins what the page
 * would otherwise take from the reviewer's machine: the clock, random IDs, browser storage and the connection.
 * Replays reuse the recording's clock and entropy. Browser storage belongs to the run and the account acting in it.
 * `options` are the adapter's run options (sizes and the like), checked by its runtime entry.
 */
export async function openRuntimeSession<Seed = unknown>(context: SessionContext, { options, accepted }: { options?: Record<string, string | number | boolean>; accepted?: (args: Record<string, unknown>) => void } = {}) {
  const previous = (context.recording?.seed as { application?: { timeZone?: string; entropySeed?: string } } | undefined)?.application
  const timeZone = previous?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const reopen = new URLSearchParams(location.search).get('runtimeRun')
  if (reopen && context.recording) throw Error('A recording replays on a fresh run, not a reopened one.')
  const session = await runtimeRequest<RuntimeSession<Seed>>(reopen ? { action: 'resume', run: reopen } : { action: 'start', scenario: context.scenario.id, persona: context.persona.id, role: context.role.id, condition: context.condition.id, timeZone, ...(options ? { options } : {}), ...(context.recording ? { now: context.recording.now } : {}) })
  if (session.source !== context.snapshot.revision.source) { await runtimeRequest({ action: 'close', run: session.id, lease: session.lease }); throw Error('Source changed during startup. Start a new run.') }
  const actual = window.localStorage
  let account = session.account, subject = session.subject, clock = session.clock ?? session.now
  const listeners = new Set<(change: 'identity' | 'connection' | 'time' | 'pending') => void>()
  const notify = (change: 'identity' | 'connection' | 'time' | 'pending') => { for (const listener of listeners) listener(change) }
  const transport = runtimeTransport(session, { storage: actual, actor: () => ({ account, subject }), start: () => session.account, accepted })
  // A request that fails because the connection dropped marks the run offline; adapters hear it as a connection change.
  let online = true
  transport.subscribe(() => { if (online !== transport.connected()) { online = transport.connected(); notify('connection') } else notify('pending') })
  const OriginalDate = Date, uuidDescriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID')
  const entropySeed = previous?.entropySeed ?? crypto.randomUUID()
  let sequence = 0, data: unknown = null, read = -1, closed = false
  const runPrefix = `civic:run:${session.project}:${session.id}:`
  // A replay must start from nothing, so recorded runs keep their storage in memory.
  const stores = ['localStorage', 'sessionStorage'].map((key) => ({ key, descriptor: Object.getOwnPropertyDescriptor(window, key)!, storage: context.recording ? memoryStorage() : scopedStorage(actual, () => `${runPrefix}${subject ?? ''}:${key}:`) }))
  globalThis.Date = new Proxy(OriginalDate, {
    construct: (target, args) => Reflect.construct(target, args.length ? args : [clock]),
    apply: () => new OriginalDate(clock).toString(),
    get: (target, key) => key === 'now' ? () => clock : Reflect.get(target, key),
  })
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => entropySeed.slice(0, 24) + (++sequence).toString(16).padStart(12, '0') })
  for (const { key, storage } of stores) Object.defineProperty(window, key, { configurable: true, value: storage })
  const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine')
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => transport.connected() })
  /** Connects or disconnects the app's own requests, and tells the app the way a browser would. */
  const connection = (value: boolean) => {
    if (transport.connected() === value) return
    transport.connect(value)
    window.dispatchEvent(new Event(value ? 'online' : 'offline'))
  }
  // When the reviewer's machine goes offline, so does the run; it comes back only when someone reconnects it.
  const networkDown = () => { if (transport.connected()) transport.connect(false) }
  window.addEventListener('offline', networkDown)
  // A run reopened while offline stays offline until someone reconnects it.
  if (reopen && new URLSearchParams(location.search).get('disconnected') === '1') transport.connect(false)
  return {
    session, transport,
    seed: { scenario: context.scenario.id, persona: context.persona, role: context.role.id, condition: context.condition.id, timeZone, entropySeed, ...(options ? { options } : {}), ...(reopen ? { reopened: true } : {}) },
    data: () => ({ ...data as object, runId: session.id }),
    status: () => ({ run: session.id, account, subject, accounts: session.accounts ?? [], connected: transport.connected(), now: clock, pending: transport.pending() }),
    subscribe: (listener: (change: 'identity' | 'connection' | 'time' | 'pending') => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    connection,
    /** Acts as another of the run's synthetic accounts. The run's data stays; what the app shows is now that account's. */
    async identity(value: string) {
      await transport.settle()
      const next = await transport.request<{ account: string; subject: string }>('identity', undefined, { account: value })
      account = next.account; subject = next.subject; data = null
      notify('identity')
    },
    /** Moves the run's clock forward. Nothing physical happened; the app sees the time pass. */
    async advance(minutes: number) { clock = (await transport.request<{ now: number }>('time', undefined, { minutes })).now; notify('time') },
    async settle() {
      for (let index = 0; index < 3; index++) { await transport.settle(); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())) }
      // Reading a large run's whole state is costly; it changes only through this page's writes, account, clock or reset.
      if (transport.connected() && (data === null || read !== transport.revision())) { const at = transport.revision(); data = await transport.request('state'); read = at }
    },
    async reset() {
      connection(true)
      await transport.request('reset')
      for (const { storage } of stores) storage.clear()
      for (const key of Array.from({ length: actual.length }, (_, index) => actual.key(index)!)) if (key.startsWith(runPrefix)) actual.removeItem(key)
      account = session.account; subject = session.subject; clock = session.now; sequence = 0
      transport.resetRecovery(); notify('identity')
    },
    // Every run request is refused once the source changed; asking who is acting is the cheapest one.
    async assertSource() { await transport.request('inspect') },
    close() {
      if (closed) return
      closed = true; globalThis.Date = OriginalDate
      if (uuidDescriptor) Object.defineProperty(crypto, 'randomUUID', uuidDescriptor); else Reflect.deleteProperty(crypto, 'randomUUID')
      for (const { key, descriptor } of stores) Object.defineProperty(window, key, descriptor)
      window.removeEventListener('offline', networkDown)
      if (onlineDescriptor) Object.defineProperty(navigator, 'onLine', onlineDescriptor); else Reflect.deleteProperty(navigator, 'onLine')
      void runtimeRequest({ action: 'close', run: session.id, lease: session.lease }).catch(() => {})
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
      // Offline, the page's fetch fails the way a browser's does; the app's own handling is what gets reviewed.
      if (!transport.connected()) throw new TypeError('Failed to fetch')
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
