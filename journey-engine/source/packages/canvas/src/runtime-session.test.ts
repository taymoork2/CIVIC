import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

function memory(): { storage: Storage; rows: Map<string, string> } {
  const rows = new Map<string, string>()
  return { rows, storage: { get length() { return rows.size }, getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => { rows.set(key, value) }, clear: () => rows.clear(), key: (index) => [...rows.keys()][index] ?? null, removeItem: (key) => { rows.delete(key) } } }
}

test('a write cut off by the connection is kept for its account and is never resent by itself', async () => {
  let online = false
  const fetch = vi.fn(async (_url: string, options: RequestInit) => {
    if (!online || options.signal?.aborted) throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify({ accepted: true }))
  })
  // The session module captures the page's fetch when it loads, as it does in a frame.
  vi.stubGlobal('fetch', fetch)
  const { bindProjectRequests } = await import('./project-request')
  const { runtimeTransport } = await import('./runtime-session')
  bindProjectRequests('test-project')
  const { storage, rows } = memory()
  let account = 'owner'
  const accepted = vi.fn()
  const transport = runtimeTransport({ id: 'run', project: 'test-project' }, { storage, actor: () => ({ account, subject: `subject-${account}` }), start: () => 'owner', accepted })
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
  // The app's own retry of the same write is accepted once and clears the saved step, so nothing is sent twice.
  await transport.request('mutation', 'actions:recordAction', args)
  expect(transport.pending()).toHaveLength(0)
  expect(accepted).toHaveBeenCalledWith(args)
  expect(JSON.parse(fetch.mock.calls[1]![1].body as string).actor).toBe('subject-owner')
  // A write made while disconnected never reaches the run; it is kept like an interrupted one. Reads just fail.
  transport.connect(false)
  await expect(transport.request('mutation', 'actions:recordAction', { ...args, receiptId: 'receipt-2' })).rejects.toThrow('interrupted')
  await expect(transport.request('query', 'inventory:list', {})).rejects.toThrow('interrupted')
  expect(transport.pending().map((row) => row.args.receiptId)).toEqual(['receipt-2'])
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('a saved step is resent only by an explicit apply, and discarding drops it without sending', async () => {
  let online = true
  const fetch = vi.fn(async (_url: string, options: RequestInit) => {
    if (!online || options.signal?.aborted) throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify({ accepted: true }))
  })
  vi.stubGlobal('fetch', fetch)
  const { bindProjectRequests } = await import('./project-request')
  const { runtimeTransport } = await import('./runtime-session')
  bindProjectRequests('test-project')
  const { storage } = memory()
  const transport = runtimeTransport({ id: 'run', project: 'test-project' }, { storage, actor: () => ({ account: 'owner', subject: 'subject-owner' }), start: () => 'owner' })
  online = false
  await expect(transport.request('mutation', 'closet:markWorn', { textileIds: ['a'] })).rejects.toThrow('interrupted')
  await expect(transport.request('mutation', 'closet:markWorn', { textileIds: ['b'] })).rejects.toThrow('interrupted')
  // The same write tapped twice is kept once.
  await expect(transport.request('mutation', 'closet:markWorn', { textileIds: ['b'] })).rejects.toThrow('interrupted')
  expect(transport.pending().map((row) => row.args)).toEqual([{ textileIds: ['a'] }, { textileIds: ['b'] }])
  expect(fetch).toHaveBeenCalledTimes(1)
  await expect(transport.apply(transport.pending()[0]!.id)).rejects.toThrow('Reconnect')
  online = true; transport.connect(true)
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(fetch).toHaveBeenCalledTimes(1)
  await transport.apply(transport.pending()[0]!.id)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(transport.pending().map((row) => row.args)).toEqual([{ textileIds: ['b'] }])
  transport.discard(transport.pending()[0]!.id)
  expect(transport.pending()).toHaveLength(0)
  expect(fetch).toHaveBeenCalledTimes(2)
})
