import { renderScreen } from './screens.js'

// Synthetic state and effects live in the project adapter, never in the shared workspace.
export function mount(container, context) {
  const seed = { screen: context.scenario.id, title: context.scenario.fixture?.title ?? context.persona.seed?.title ?? '', error: '' }
  const model = { ...seed }
  const publish = () => context.publish({ screen: model.screen, dirty: model.screen === 'demo.edit' && Boolean(model.title) })
  const go = (screen, action) => {
    context.transition(screen, action)
    model.screen = screen; model.error = ''; render(); publish()
  }
  const actions = {
    begin: () => go('demo.edit', 'New note'),
    change: (title) => { model.title = title; publish() },
    save: () => {
      if (!model.title.trim() || context.role.id !== 'author' || context.condition.id === 'save-error') { model.error = 'Save unavailable. Your draft is kept.'; render(); publish(); return }
      go('demo.saved', 'Save')
    },
    review: () => { if (model.title.trim()) go('demo.review', 'Review first') },
    back: () => go('demo.edit', 'Back to draft'),
    cancel: () => go('demo.home', model.screen === 'demo.saved' ? 'Back home' : 'Cancel'),
  }
  const render = () => renderScreen(container, model, actions)
  render(); publish()
  context.connectRuntime({ seed, now: context.recording?.now ?? Date.now(), captureInputs: ['Title'], route: () => model.screen, screen: () => model.screen, data: () => ({ ...model }),
    reset: async () => { Object.assign(model, seed); render(); publish() },
    settle: async () => {},
    assertSource: async () => { const response = await fetch('/api/review/index'); if (!response.ok || (await response.json()).revision.source !== context.snapshot.revision.source) throw Error('Source changed. Start a new run.') },
  })
  return () => container.replaceChildren()
}
