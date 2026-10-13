import { createRoot } from 'react-dom/client'
import { ReadingList, type View } from './app'

type Context = {
  scenario: { id: string }
  transition: (to: string, action: string) => void
  startRuntime: (options: Record<string, unknown>) => Promise<{ close: () => void }>
}

// CIVIC's preview adapter: the real app, with its server function calls answered by an isolated run of its real handlers.
export async function mount(container: HTMLElement, context: Context) {
  const listeners = new Set<() => void>()
  const changed = () => { for (const listener of listeners) listener() }
  const view: View = { screen: context.scenario.id, dirty: false, pending: false }
  const root = createRoot(container)
  let generation = 0
  // Resolves once the app's first read has landed, so a run or reset settles on real data.
  const render = () => new Promise<void>((loaded) => {
    root.render(<ReadingList key={generation++} view={view} loaded={loaded} changed={changed} navigated={(to, action) => { context.transition(to, action); changed() }} />)
  })
  const run = await context.startRuntime({
    routes: [],
    screen: () => view.screen,
    status: () => ({ dirty: view.dirty, pending: view.pending }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    captureInputs: ['Title', 'Author'],
    reset: () => { Object.assign(view, { screen: context.scenario.id, dirty: false, pending: false }); return render() },
  })
  await render()
  return () => { run.close(); root.unmount() }
}
