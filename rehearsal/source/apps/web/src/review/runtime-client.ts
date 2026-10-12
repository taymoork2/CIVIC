import { projectFetch } from './project-request'
import type { RuntimeBridge } from './runtime-bridge'

export async function runtimeRequest<T>(input: Record<string, unknown>): Promise<T> {
  const response = await projectFetch('/api/review/runtime', { method: 'POST', keepalive: input.action === 'close', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  const result = await response.json()
  if (!response.ok) throw Object.assign(Error(result.error ?? 'Isolated runtime unavailable'), { data: result.data })
  return result
}
export type RuntimeSession = { id: string; source: string; project: string; now: number; seed: { scenario: string; householdId: string; principalKey: string; subject: string; textiles: string[]; towels: string[] } }

/** One request boundary records effects regardless of which screen initiated them. */
export function runtimeTransport(session: RuntimeSession) {
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
