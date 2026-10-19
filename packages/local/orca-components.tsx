import { createSignal } from 'solid-js'
import { render } from '@solidjs/web'
import { Segmented, ProjectTabs } from '@orca-specimen/components/settings/ui.tsx'
import { Modal } from '@orca-specimen/components/shell/Modal.tsx'
import { CitationCards } from '@orca-specimen/components/composer/CitationCards.tsx'
import { EvidencePanel } from '@orca-specimen/components/evidence/EvidencePanel.tsx'
import { Markdown } from '@orca-specimen/components/Markdown.tsx'
import { Trace, TraceLine, TraceTitle, TraceCollapsible } from '@orca-specimen/components/transcript/trace.tsx'
import '@orca-specimen/styles.css'

export function mount(container, context) {
  const { component, state } = context.scenario.fixture
  document.documentElement.classList.toggle('light', context.config.theme !== 'dark')
  const [choice, setChoice] = createSignal(state)
  const [open, setOpen] = createSignal(state === 'open')
  const citation = { id: 'specimen-citation', number: 1, sourceSessionId: 'synthetic-session', sourceEntryId: 'synthetic-entry', quote: 'Verify the result before marking it complete.', comment: 'Synthetic review context.' }
  const [citations, setCitations] = createSignal(state === 'empty' ? [] : [citation])
  const [changes, setChanges] = createSignal(0)
  const dispose = render(() => <main class="min-h-screen bg-zinc-950 p-6 text-zinc-200">
    <p class="mb-6 text-xs text-zinc-500">Orca component · {context.scenario.label} · synthetic props</p>
    <div class="mx-auto max-w-2xl space-y-4">
      {component === 'segmented' && <Segmented label="Preferred harness" options={[{ value: 'claude', label: 'Claude' }, { value: 'codex', label: 'Codex' }]} value={choice()} onChange={value => { setChoice(value); setChanges(n => n + 1) }} />}
      {component === 'project-tabs' && <ProjectTabs projectId="synthetic-project" active={state} />}
      {component === 'modal' && <><button class="btn" onClick={() => setOpen(true)}>Open dialog</button>{open() && <Modal label="Component preview" onClose={() => setOpen(false)}><div class="space-y-4 p-4"><h1>Component preview</h1><p>This dialog only changes this preview.</p><button class="btn" onClick={() => setOpen(false)}>Close dialog</button></div></Modal>}</>}
      {component === 'citations' && <CitationCards citations={citations()} expanded={state === 'expanded'} onChange={['editable', 'expanded'].includes(state) ? rows => { setCitations(rows); setChanges(n => n + 1) } : undefined} />}
      {component === 'evidence' && <EvidencePanel sessions={[]} evidence={state === 'empty' ? [] : [{ id: 'synthetic-evidence', rung: 'verification', kind: 'execution', at: '2026-10-18T00:00:00Z', claim: 'Synthetic component fixture; no real verification is claimed.', detail: 'A representative record for inspecting the component.', revision: 'd1d9d02' + (state === 'dirty' ? '+dirty' : ''), sessionId: null }]} />}
      {component === 'markdown' && <Markdown text={state === 'empty' ? '' : state === 'code' ? '```js\nconst synthetic = true\n```' : '## Review the result\n\n- Inspect the change\n- Verify the behavior\n\n> Synthetic preview content.'} />}
      {component === 'trace' && <Trace><TraceCollapsible open={state === 'expanded'} line={<TraceLine status={state === 'running' ? 'running' : state === 'error' ? 'error' : undefined}><TraceTitle>Inspect implementation</TraceTitle></TraceLine>}><p>Synthetic trace details. No command was executed.</p></TraceCollapsible></Trace>}
      <p role="status" class="text-xs text-zinc-500">{component === 'segmented' ? `Selected: ${choice()}` : component === 'modal' ? `Dialog ${open() ? 'open' : 'closed'}` : `${changes()} local edits`}</p>
    </div>
  </main>, container)
  // Specimen links describe destinations; they must never navigate into the live application.
  const links = event => { if (event.target.closest('a')) event.preventDefault() }
  container.addEventListener('click', links)
  context.connectRuntime({ seed: context.scenario.fixture, now: 1792281600000,
    screen: () => context.scenario.id, route: () => `component:${component}:${state}`,
    captureInputs: 'synthetic', data: () => ({ choice: choice(), open: open(), citations: citations(), changes: changes() }),
    settle: async () => { await new Promise(resolve => requestAnimationFrame(resolve)) },
    reset: () => { throw Error('Component recordings are observational; deterministic replay is not registered for these specimens.') },
    assertSource: async () => { const current = await fetch('/api/review/index').then(response => { if (!response.ok) throw Error('Component source inventory unavailable'); return response.json() }); if (current.revision.source !== context.snapshot.revision.source) throw Error('The component source changed. Reload before recording more evidence.') },
  })
  context.publish({ screen: context.scenario.id, dirty: false, pending: false })
  return () => { container.removeEventListener('click', links); dispose() }
}
