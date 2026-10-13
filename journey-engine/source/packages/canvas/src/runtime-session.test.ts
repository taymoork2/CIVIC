import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

function memory(): { storage: Storage; rows: Map<string, string> } {
  const rows = new Map<string, string>()
  return { rows, storage: { get length() { return rows.size }, getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => { rows.set(key, value) }, clear: () => rows.clear(), key: (index) => [...rows.keys()][index] ?? null, removeItem: (key) => { rows.delete(key) } } }
}
type Sent = { action: string; name?: string; args?: Record<string, unknown>; actor?: string; intent?: string }
// The session module captures the page's fetch and random IDs when it loads, as it does in a frame.
async function load(online: () => boolean) {
  const sent: Sent[] = []
  const fetch = vi.fn(async (_url: string, options: RequestInit) => {
    if (!online() || options.signal?.aborted) throw new TypeError('Failed to fetch')
    sent.push(JSON.parse(options.body as string))
    return new Response(JSON.stringify({ accepted: true }))
  })
  vi.stubGlobal('fetch', fetch)
  const { bindProjectRequests } = await import('./project-request')
  const { runtimeTransport } = await import('./runtime-session')
  bindProjectRequests('test-project')
  return { fetch, sent, runtimeTransport }
}

test('a write cut off by the connection is kept for its account and is never resent by itself', async () => {
  let online = false
  const { fetch, sent, runtimeTransport } = await load(() => online)
  const { storage, rows } = memory()
  let account = 'owner'
  const accepted = vi.fn()
  const transport = runtimeTransport({ id: 'run', project: 'test-project' }, { storage, actor: () => ({ account, subject: `subject-${account}` }), start: () => 'owner', accepted, key: (_name, args) => typeof args.receiptId === 'string' ? args.receiptId : undefined })
  const args = { receiptId: 'receipt-1', actionId: 'step-1', status: 'confirmed' }
  await expect(transport.request('mutation', 'actions:recordAction', args)).rejects.toThrow('interrupted')
  expect(transport.connected()).toBe(false)
  expect(transport.pending()).toHaveLength(1)
  expect([...rows.keys()]).toEqual(['civic:pending:test-project:run'])
  // Another account never sees or sends the owner's saved step.
  account = 'member'
  expect(transport.pending()).toHaveLength(0)
  await expect(transport.apply(JSON.parse([...rows.values()][0]!)[0].id)).rejects.toThrow('account that made this step')
  expect(() => transport.discard(JSON.parse([...rows.values()][0]!)[0].id)).toThrow('another account')
  account = 'owner'; online = true; transport.connect(true)
  expect(transport.pending()).toHaveLength(1)
  expect(fetch).toHaveBeenCalledTimes(1)
  // The app's own retry of the same write, named by its adapter's key, settles the saved step.
  await transport.request('mutation', 'actions:recordAction', args)
  expect(transport.pending()).toHaveLength(0)
  expect(accepted).toHaveBeenCalledWith(args)
  expect(sent[0]!.actor).toBe('subject-owner')
  // A write made while disconnected never reaches the run; it is kept like an interrupted one. Reads just fail.
  transport.connect(false)
  await expect(transport.request('mutation', 'actions:recordAction', { ...args, receiptId: 'receipt-2' })).rejects.toThrow('interrupted')
  await expect(transport.request('query', 'inventory:list', {})).rejects.toThrow('interrupted')
  expect(transport.pending().map((row) => row.args.receiptId)).toEqual(['receipt-2'])
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('each write has its own identity; a saved step is resent only by hand, under the identity it was first sent with', async () => {
  let online = true
  const { fetch, sent, runtimeTransport } = await load(() => online)
  const { storage } = memory()
  const transport = runtimeTransport({ id: 'run', project: 'test-project' }, { storage, actor: () => ({ account: 'owner', subject: 'subject-owner' }), start: () => 'owner' })
  await transport.request('mutation', 'POST:/api/posts', { body: 'same' })
  await transport.request('mutation', 'POST:/api/posts', { body: 'same' })
  expect(sent.map((row) => row.intent)).toHaveLength(2)
  expect(new Set(sent.map((row) => row.intent)).size).toBe(2)
  expect(sent.every((row) => /^[0-9a-f-]{36}$/.test(row.intent!))).toBe(true)
  await transport.request('query', 'GET:/api/posts', {})
  expect(sent.at(-1)!.intent).toBeUndefined()
  online = false
  await expect(transport.request('mutation', 'POST:/api/posts', { body: 'a' })).rejects.toThrow('interrupted')
  // Two identical writes made offline are two saved steps, each with its own identity.
  await expect(transport.request('mutation', 'POST:/api/posts', { body: 'b' })).rejects.toThrow('interrupted')
  await expect(transport.request('mutation', 'POST:/api/posts', { body: 'b' })).rejects.toThrow('interrupted')
  const saved = transport.pending()
  expect(saved.map((row) => row.args)).toEqual([{ body: 'a' }, { body: 'b' }, { body: 'b' }])
  expect(new Set(saved.map((row) => row.intent)).size).toBe(3)
  expect(fetch).toHaveBeenCalledTimes(4)
  await expect(transport.apply(saved[0]!.id)).rejects.toThrow('Reconnect')
  online = true; transport.connect(true)
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(fetch).toHaveBeenCalledTimes(4)
  // A resend that fails again keeps the same step and identity.
  online = false
  await expect(transport.apply(saved[0]!.id)).rejects.toThrow('interrupted')
  expect(transport.pending().map((row) => row.intent)).toEqual(saved.map((row) => row.intent))
  online = true; transport.connect(true)
  await transport.apply(saved[0]!.id)
  expect(sent.at(-1)).toMatchObject({ name: 'POST:/api/posts', args: { body: 'a' }, intent: saved[0]!.intent })
  expect(transport.pending().map((row) => row.intent)).toEqual([saved[1]!.intent, saved[2]!.intent])
  // Without an app key, an identical new write is not taken for a saved one.
  await transport.request('mutation', 'POST:/api/posts', { body: 'b' })
  expect(transport.pending()).toHaveLength(2)
  transport.discard(saved[1]!.id)
  expect(transport.pending().map((row) => row.intent)).toEqual([saved[2]!.intent])
})
