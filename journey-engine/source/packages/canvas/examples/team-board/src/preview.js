import { startApp } from './app.js'

// CIVIC's preview adapter: the real app, with its /api/ calls answered by an isolated run signed in as the persona.
export async function mount(container, context) {
  const listeners = new Set()
  const app = startApp(container, {
    screen: context.scenario.id,
    navigated: (from, to, action) => { context.transition(to, action); for (const listener of listeners) listener() },
  })
  const run = await context.startRuntime({
    routes: ['/api/'],
    screen: () => app.screen,
    status: () => ({ dirty: app.dirty, pending: app.pending }),
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    captureInputs: ['Email', 'Message'],
    load: () => app.load(),
    reset: () => app.restart(),
  })
  return () => { run.close(); container.replaceChildren() }
}
