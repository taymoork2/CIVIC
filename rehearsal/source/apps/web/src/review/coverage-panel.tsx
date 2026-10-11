import { useEffect, useRef, useState } from 'react'
import type { MapScenario } from './app-map'

type Target = { id: string; title: string; kind: string; component?: string; scenarios: string[]; acceptance: string[]; implementation: string; preview: string; verification: string; reason: string; missingEdges: string[] }
type Candidate = { id: string; version: number; source: string; title: string; body: string; action: string; brief: string; code: string; stale: boolean; targetPresent: boolean; acknowledged: boolean }
type Coverage = { version: number; automatic: boolean; source: string; fixtureSource: string; report: { contractVersion: number; targets: Target[]; limits: string[] }; candidates: Candidate[] }
type Draft = { id: string; title: string; body: string; action: string; source: string; expectedVersion: number }

export function useCoverage(onIndex: (index: { scenarios: MapScenario[]; fixtureSource: string }) => void) {
  const [data, setData] = useState<Coverage | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const callback = useRef(onIndex); callback.current = onIndex
  const lastSource = useRef('')
  const mutation = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        if (document.visibilityState !== 'hidden') {
          const version = mutation.current
          const responses = await Promise.all(['/api/review/index', '/api/review/coverage'].map((path) => fetch(path, { signal: controller.signal })))
          if (responses.some((response) => !response.ok)) throw Error('Coverage update unavailable. Previous state and drafts are retained.')
          const [index, next] = await Promise.all(responses.map((response) => response.json()))
          if (index.revision.source !== next.source) throw Error('Inventory changed while loading. Retrying; previous drafts are retained.')
          if (version === mutation.current) {
            const changed = lastSource.current !== next.source
            if (lastSource.current && changed) setNotice('Code or expectations changed. Inventory refreshed; the open preview and draft are retained.')
            lastSource.current = next.source
            setData(next); if (changed) callback.current(index); setError('')
          }
        }
      } catch (caught) { if (!controller.signal.aborted) setError((caught as Error).message) }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5000)
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [])
  const update = async (input: Record<string, unknown>) => {
    mutation.current++
    const response = await fetch('/api/review/coverage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
    const result = await response.json()
    if (!response.ok) throw Error(result.error ?? 'Coverage could not be saved. Your draft is retained.')
    mutation.current++; setData(result); return result as Coverage
  }
  return { data, error, notice, update }
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function CoveragePanel({ bridge, focus }: { bridge: ReturnType<typeof useCoverage>; focus: (scenario: string) => void }) {
  const { data, update } = bridge
  const [selected, setSelected] = useState('')
  const [queuedTarget, setQueuedTarget] = useState<Target | null>(null)
  const [filter, setFilter] = useState('all')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [intent, setIntent] = useState<{ text: string; source: string; expectedVersion: number; contractVersion: number } | null>(null)
  const [value, setValue] = useState('')
  const [captured, setCaptured] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const target = data?.report.targets.find((t) => t.id === selected)
  const candidate = data?.candidates.find((c) => c.id === selected)
  const dirtyDraft = Boolean(draft && (!candidate || draft.title !== candidate.title || draft.body !== candidate.body || draft.action !== candidate.action))
  const act = async (input: Record<string, unknown>) => {
    setBusy(true); setError(''); setStatus('')
    try { const result = await update(input); setStatus('Saved locally.'); return result }
    catch (caught) { setError((caught as Error).message); return null }
    finally { setBusy(false) }
  }
  const choose = (t: Target) => { setSelected(t.id); setDraft(null); setIntent(null); setValue(''); setCaptured(null); setError(''); setStatus(''); setQueuedTarget(null) }
  if (!data) return <p role="status">{bridge.error || 'Checking coverage…'}</p>
  const base = { source: data.source, expectedVersion: data.version }
  const content = draft ?? candidate
  const editIntent = (t?: Target) => setIntent({ ...base, contractVersion: data.report.contractVersion, text: JSON.stringify(t ? { id: t.id, title: t.title, kind: t.kind, ...(t.component ? { component: t.component } : {}), scenarios: t.scenarios, acceptance: t.acceptance } : { id: 'journey.new-journey', title: 'New journey', kind: 'journey', scenarios: [], acceptance: ['Describe the expected behavior.'] }, null, 2) })
  return <section className="rh-coverage-panel" aria-label="Coverage bridge">
    <p className="rh-muted">Expected behavior ↔ repository. Generated proposals stay separate from the app.</p>
    <label className="rh-coverage-switch"><input type="checkbox" checked={data.automatic} disabled={busy} onChange={(event) => void act({ ...base, operation: 'automatic', enabled: event.target.checked })} /> Automatically draft new gaps</label>
    <p className="rh-muted">Local scaffolds include a brief, editable prototype and React candidate. No AI provider is connected. Acknowledging clears the notification; it does not resolve coverage.</p>
    {bridge.error && <p role="alert">{bridge.error}</p>}
    {queuedTarget && <section className="rh-coverage-detail"><h3>Discard unpublished coverage edits?</h3><p>Opening {queuedTarget.title} replaces these coverage edits. Your app draft stays intact.</p><button onClick={() => setQueuedTarget(null)}>Keep editing</button><button onClick={() => choose(queuedTarget)}>Discard edits and open</button></section>}
    <label className="rh-search">Show<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All expectations and discoveries</option><option value="missing">Missing previews</option><option value="planned">Planned features</option><option value="journey">Journeys</option><option value="unread">New proposals</option></select></label>
    <button disabled={intent !== null} onClick={() => editIntent()}>Add expectation</button>
    <ul className="rh-review-list rh-coverage-list">{data.report.targets.filter((t) => filter === 'all' || filter === 'missing' && t.preview === 'missing' || filter === 'planned' && t.implementation === 'planned' || filter === 'journey' && t.kind === 'journey' || filter === 'unread' && data.candidates.some((c) => c.id === t.id && !c.acknowledged)).map((t) => <li key={t.id}><button aria-pressed={selected === t.id} onClick={() => { if (t.id !== selected && (dirtyDraft || intent)) setQueuedTarget(t); else if (t.id !== selected) choose(t) }}><strong>{t.title}</strong><small>{t.id.startsWith('discovered.') ? 'Found in code · unconfirmed' : `Expected ${t.kind}`} · {t.implementation} · preview {t.preview}</small></button></li>)}</ul>
    {target && <section className="rh-coverage-detail"><h3>{target.title}</h3><p>{target.reason}</p><p className="rh-muted">Evidence: {target.verification}{target.missingEdges.length ? ` · ${target.missingEdges.length} undeclared transitions` : ''}</p>{target.component && <code>{target.component}</code>}
      {target.scenarios.length > 0 && <button onClick={() => focus(target.scenarios[0]!)}>Show first registered screen</button>}
      <button disabled={intent !== null} onClick={() => editIntent(target)}>Edit repository expectation</button>
      {!candidate && <button disabled={busy} onClick={() => void act({ ...base, operation: 'generate', id: selected })}>Scaffold proposal</button>}
      {candidate && <><p className="rh-muted">Candidate v{candidate.version} · {candidate.stale ? 'source changed; review required' : 'matches source revision'}</p><div className="rh-coverage-actions"><button disabled={busy || candidate.acknowledged} onClick={() => void act({ ...base, operation: 'acknowledge', id: selected })}>{candidate.acknowledged ? 'Acknowledged' : 'Acknowledge'}</button><button disabled={draft !== null} onClick={() => { setDraft({ ...base, id: selected, title: candidate.title, body: candidate.body, action: candidate.action }); setCaptured(null) }}>Edit prototype</button></div>
        {draft && <form onSubmit={async (event) => { event.preventDefault(); const result = await act({ ...draft, operation: 'candidate' }); if (result) setDraft((current) => current?.id === draft.id ? { ...current, source: result.source, expectedVersion: result.version } : current) }}><label className="rh-search">Heading<input required maxLength={160} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label><label className="rh-search">Description<textarea required maxLength={4000} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label><label className="rh-search">Action<input required maxLength={160} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} /></label><button disabled={busy}>Save prototype</button>{(draft.source !== data.source || draft.expectedVersion !== data.version) && <button type="button" onClick={() => setDraft({ ...draft, ...base })}>Use latest revision; retain edits</button>}</form>}
        {content && <section className="rh-generated-preview" aria-label="Synthetic proposal prototype"><small>Proposal only · synthetic input</small><h3>{content.title}</h3><p>{content.body}</p><form onSubmit={(event) => { event.preventDefault(); setCaptured(value) }}><label className="rh-search">Example input<input value={value} onChange={(e) => setValue(e.target.value)} /></label><button>{content.action}</button></form>{captured !== null && <p role="status">Captured locally: {captured || '(empty)'}. No app operation was performed.</p>}</section>}
        <div className="rh-coverage-actions"><button disabled={dirtyDraft} onClick={() => download(`${selected}.brief.md`, candidate.brief + `\n\nCurrent candidate v${candidate.version}\nSource: ${candidate.source}\n${candidate.title}\n${candidate.body}\nAction: ${candidate.action}\n`)}>Export brief</button><button disabled={dirtyDraft} onClick={() => download(`${selected}.candidate.tsx`, candidate.code)}>Export React candidate</button>{draft && <button onClick={() => setDraft(null)}>{dirtyDraft ? 'Discard prototype edits' : 'Use saved candidate'}</button>}</div><p className="rh-muted">Code export is an isolated scaffold, awaiting an agent implementation and validation. It has no application adapter.</p></>}
    </section>}
    {intent && <form onSubmit={async (event) => { event.preventDefault(); let parsed; try { parsed = JSON.parse(intent.text) } catch { setError('Expectation must be valid JSON. Draft retained.'); return } const result = await act({ ...intent, operation: 'intent', target: parsed }); if (result) { setIntent(null); setStatus('Repository expectation saved. Inventory will refresh automatically.') } }}><h3>Repository expectation</h3><p className="rh-muted">Writes the canonical coverage.json contract; it does not modify app behavior.</p><label className="rh-search">Expected screen, interaction or journey<textarea disabled={busy} className="rh-intent-editor" value={intent.text} onChange={(e) => setIntent({ ...intent, text: e.target.value })} /></label><button disabled={busy}>Save expectation</button><button type="button" onClick={() => setIntent(null)}>Cancel</button>{(intent.source !== data.source || intent.expectedVersion !== data.version) && <button type="button" onClick={() => setIntent({ ...intent, ...base, contractVersion: data.report.contractVersion })}>Use latest revision; retain edits</button>}</form>}
    {error && <p role="alert">{error}</p>}<p role="status">{status}</p>
    <details><summary>Detection limits</summary>{data.report.limits.map((limit) => <p key={limit}>{limit}</p>)}</details>
  </section>
}
