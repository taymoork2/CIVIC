import type { ConvexReactClient } from 'convex/react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { ConvexError, type Value } from 'convex/values'
import type { runtimeTransport } from './runtime-client'

/** Convex's existing hooks and useConvexCall talk to the isolated transport, not recreated handlers. */
export function convexRuntimeClient(transport: ReturnType<typeof runtimeTransport>) {
  type Query = { name: string; args: Record<string, unknown>; value?: unknown; error?: Error; listeners: Set<() => void>; version: number }
  const queries = new Map<string, Query>()
  let generation = 0
  const refresh = (query: Query) => {
    const version = ++query.version, epoch = generation
    void transport.request('query', query.name, query.args).then((value) => { if (epoch === generation && version === query.version) { query.value = value; query.error = undefined; for (const listener of query.listeners) listener() } }, (error) => { if (epoch === generation && version === query.version) { query.error = error; for (const listener of query.listeners) listener() } })
  }
  const invalidate = () => { for (const query of queries.values()) if (query.listeners.size) refresh(query) }
  const client = {
    watchQuery(reference: FunctionReference<'query'>, args: Record<string, unknown>) {
      const name = getFunctionName(reference), key = JSON.stringify([name, args])
      let query = queries.get(key)
      if (!query) { query = { name, args, listeners: new Set(), version: 0 }; queries.set(key, query); refresh(query) }
      const active = query
      return { localQueryResult: () => { if (active.error) throw active.error; return active.value }, journal: () => undefined, onUpdate: (callback: () => void) => { active.listeners.add(callback); if (active.version && active.value !== undefined) queueMicrotask(callback); return () => active.listeners.delete(callback) } }
    },
    query: (reference: FunctionReference<'query'>, args: Record<string, unknown>) => transport.request('query', getFunctionName(reference), args),
    async mutation(reference: FunctionReference<'mutation'>, args: Record<string, unknown>) {
      try { const result = await transport.request('mutation', getFunctionName(reference), args); invalidate(); return result }
      catch (error) { const data = (error as Error & { data?: Value }).data; if (data !== undefined) throw new ConvexError(data); throw error }
    },
    action: (reference: FunctionReference<'action'>, args: Record<string, unknown>) => transport.request('action', getFunctionName(reference), args),
    setAuth: (_token: unknown, changed: (authenticated: boolean) => void) => queueMicrotask(() => changed(true)), clearAuth: () => {},
    connectionState: () => ({ isWebSocketConnected: true, hasEverConnected: true, oldestInflightRequestStartedAt: null, hasInflightRequests: false }), subscribeToConnectionState: () => () => {},
  } as unknown as ConvexReactClient
  return { client, invalidate, reset: () => { generation++; queries.clear() } }
}
