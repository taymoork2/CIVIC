import { startApp } from './app.js'

// CIVIC's preview adapter: the real app, with its backend client answered by an isolated run of its real backend functions.
export async function mount(container, context) {
  const listeners = new Set()
  const client = { query: (name, args) => run.query(name, args), mutation: (name, args) => run.mutation(name, args) }
  const app = startApp(container, client, {
    screen: context.scenario.id,
    navigated: (from, to, action) => { context.transition(to, action); for (const listener of listeners) listener() },
  })
  const run = await context.startRuntime({
    screen: () => app.screen,
    status: () => ({ dirty: app.dirty, pending: app.pending }),
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    captureInputs: ['Item', 'Quantity'],
    reset: () => app.restart(),
  })
  await app.load()
  return () => { run.close(); container.replaceChildren() }
}
