import { createServerFunctions, decode, encode } from './server-functions-core.mjs'
import type { RuntimeTransport } from './runtime-session'

let active: RuntimeTransport | null = null

/**
 * The preview's `@tanstack/react-start` for one module (the canvas's transform swaps the import in).
 * Each call goes to the live run: GET functions as queries, POST functions as recorded mutations.
 */
export function serverFunctions(file: string) {
  return createServerFunctions(file, async (key, method, data, context) => {
    if (!active) throw Error('Server functions run only in a live run. Play the screen to start one.')
    try {
      const result = await active.request<{ value: unknown }>(method === 'GET' ? 'query' : 'mutation', `serverFn:${key}`, { data: encode(data), context: encode(context) })
      return decode(result.value)
    } catch (error) {
      const thrown = (error as { data?: { thrown?: unknown } }).data?.thrown
      if (thrown !== undefined) throw decode(thrown)
      throw error
    }
  })
}

/** Sends the page's server function calls to this run until the returned function restores the previous one. */
export function routeServerFunctions(transport: RuntimeTransport) {
  const previous = active
  active = transport
  return () => { if (active === transport) active = previous }
}
