import { runtimeRequest, runtimeTransport, type RuntimeSession } from '../runtime-client'
import { convexRuntimeClient } from '../convex-runtime-client'
import { setRuntimeIdentity } from './laundry-auth'
import type { AdapterContext } from '@civic/canvas/adapter'

function memoryStorage(): Storage {
  const rows = new Map<string, string>()
  return { get length() { return rows.size }, getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => { rows.set(String(key), String(value)) }, removeItem: (key) => { rows.delete(key) }, clear: () => rows.clear(), key: (index) => [...rows.keys()][index] ?? null }
}

/** Native routes and curated presenters share the same data, clock, identity and reset boundary. */
export async function openLaundrySession(context: AdapterContext) {
  const previous = (context.recording?.seed as { application?: { timeZone?: string; entropySeed?: string } } | undefined)?.application
  const timeZone = previous?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const session = await runtimeRequest<RuntimeSession>({ action: 'start', scenario: context.scenario.id, persona: context.persona.id, role: context.role.id, condition: context.condition.id, timeZone, ...(context.recording ? { now: context.recording.now } : {}) })
  if (session.source !== context.snapshot.revision.source) { await runtimeRequest({ action: 'close', run: session.id }); throw Error('Source changed during startup. Start a new run.') }
  const transport = runtimeTransport(session), facade = convexRuntimeClient(transport)
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
  setRuntimeIdentity(session.seed.subject)
  return {
    session, transport, client: facade.client,
    seed: { scenario: context.scenario.id, persona: context.persona, role: context.role.id, condition: context.condition.id, timeZone, entropySeed },
    data: () => ({ ...data as object, runId: session.id }),
    async settle() {
      for (let index = 0; index < 3; index++) { await transport.settle(); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())) }
      data = await transport.request('state')
    },
    async reset() { await transport.request('reset'); facade.reset(); for (const { storage } of stores) storage.clear(); sequence = 0 },
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
