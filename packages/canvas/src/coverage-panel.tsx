import { Button } from '@civic/shell/ui/button'
import { Input } from '@civic/shell/ui/input'
import { NativeSelect } from '@civic/shell/ui/native-select'
import { Textarea } from '@civic/shell/ui/textarea'
import { useDesktopDraft } from './desktop-project-tabs'
import { notifications } from '@civic/shell/ui/notifications'
import { useEffect, useRef, useState } from 'react'
import type { MapScenario } from './app-map'
import type { ReviewSnapshot } from './adapter'
import { reviewApi, ReviewRequestError } from './review-api'
import { InteractionCoverage, type InteractionReport, type InteractionExpectation } from './interaction-coverage'

type Target = InteractionExpectation & { component?: string; implementation: string; preview: string; verification: string; reason: string; missingEdges: string[] }
type Candidate = { id: string; version: number; source: string; title: string; body: string; action: string; brief: string; code: string; stale: boolean; targetPresent: boolean; acknowledged: boolean }
type Coverage = { version: number; automatic: boolean; source: string; fixtureSource: string; report: { contractVersion: number; targets: Target[]; limits: string[] }; candidates: Candidate[]; interactions?: InteractionReport }
type Draft = { id: string; title: string; body: string; action: string; source: string; expectedVersion: number }

export function useCoverage(onIndex: (index: ReviewSnapshot & { scenarios: MapScenario[]; fixtureSource: string; connection?: { applicationRoot: string } }) => void) {
  const [data, setData] = useState<Coverage | null>(null)
  const [error, setError] = useState('')
  const callback = useRef(onIndex); callback.current = onIndex
  const lastSource = useRef('')
  const mutation = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        if (document.visibilityState !== 'hidden' && window.civicDesktop?.isActive() !== false) {
          const version = mutation.current
          const options = { signal: controller.signal, fallback: 'Coverage update unavailable. Previous state and drafts are retained.' }
          const results = await Promise.allSettled([
            reviewApi<ReviewSnapshot & { scenarios: MapScenario[]; fixtureSource: string }>('index', undefined, options),
            reviewApi<Coverage>('coverage', undefined, options),
          ])
          const conflict = results.find(result => result.status === 'rejected' && result.reason instanceof ReviewRequestError && result.reason.status === 409)
          if (conflict?.status === 'rejected') throw conflict.reason
          const [inventory, coverage] = results
          if (inventory.status === 'rejected') throw inventory.reason
          if (coverage.status === 'rejected') throw coverage.reason
          const index = inventory.value, next = coverage.value
          if (index.revision.source !== next.source) throw Error('Inventory changed while loading. Retrying; previous drafts are retained.')
          if (version === mutation.current) {
            const changed = lastSource.current !== next.source
            if (lastSource.current && changed) notifications.add({ id: 'source-updated', title: 'Source updated', description: 'Refreshing snapshots. Your live draft is unchanged.', timeout: 4000, priority: 'low' })
            lastSource.current = next.source
            setData(next); if (changed) callback.current(index); setError('')
          }
        }
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof ReviewRequestError && caught.status === 409 ? 'The active project changed in another tab. Reload this tab; previous drafts are retained.' : (caught as Error).message) }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5000)
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [])
  const update = async (input: Record<string, unknown>) => {
    mutation.current++
    const result = await reviewApi<Coverage>('coverage', input, { fallback: 'Coverage could not be saved. Your draft is retained.' })
    mutation.current++; setData(result); return result as Coverage
  }
  return { data, error, update }
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
  useDesktopDraft('coverage', dirtyDraft || Boolean(intent) || busy)
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
  const editIntent = (t?: InteractionExpectation & { component?: string }) => setIntent({ ...base, contractVersion: data.report.contractVersion, text: JSON.stringify(t ? { id: t.id, title: t.title, kind: t.kind, ...(t.component ? { component: t.component } : {}), ...(t.state ? { state: t.state } : {}), ...(t.control ? { control: t.control } : {}), scenarios: t.scenarios, acceptance: t.acceptance } : { id: 'journey.new-journey', title: 'New journey', kind: 'journey', scenarios: [], acceptance: ['Describe the expected behavior.'] }, null, 2) })
  return <section className="rh-coverage-panel" aria-label="Coverage bridge">
    {data.interactions && <InteractionCoverage report={data.interactions} source={data.source} focus={focus} expect={target => { if (dirtyDraft || intent) { setError('Save or cancel the current expectation or prototype draft before drafting another.'); return }; editIntent(target) }} />}
    <p className="rh-muted">Expected behavior ↔ repository. Generated proposals stay separate from the app.</p>
    <label className="rh-coverage-switch"><input type="checkbox" checked={data.automatic} disabled={busy} onChange={(event) => void act({ ...base, operation: 'automatic', enabled: event.target.checked })} /> Automatically draft new gaps</label>
    <p className="rh-muted">Local scaffolds include a brief, editable prototype and React candidate. No AI provider is connected. Acknowledging clears the notification; it does not resolve coverage.</p>
    {bridge.error && <p role="alert">{bridge.error}</p>}
    {queuedTarget && <section className="rh-coverage-detail"><h3>Discard unpublished coverage edits?</h3><p>Opening {queuedTarget.title} replaces these coverage edits. Your app draft stays intact.</p><Button variant="outline" onClick={() => setQueuedTarget(null)}>Keep editing</Button><Button variant="outline" onClick={() => choose(queuedTarget)}>Discard edits and open</Button></section>}
    <label className="rh-search">Show<NativeSelect className="cv:w-full" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All expectations and discoveries</option><option value="missing">Missing previews</option><option value="planned">Planned features</option><option value="journey">Journeys</option><option value="unread">New proposals</option></NativeSelect></label>
    <Button variant="outline" disabled={intent !== null} onClick={() => editIntent()}>Add expectation</Button>
    <ul className="rh-review-list rh-coverage-list">{data.report.targets.filter((t) => filter === 'all' || filter === 'missing' && t.preview === 'missing' || filter === 'planned' && t.implementation === 'planned' || filter === 'journey' && t.kind === 'journey' || filter === 'unread' && data.candidates.some((c) => c.id === t.id && !c.acknowledged)).map((t) => <li key={t.id}><Button variant="ghost" className="cv:h-auto cv:block cv:whitespace-normal" aria-pressed={selected === t.id} onClick={() => { if (t.id !== selected && (dirtyDraft || intent)) setQueuedTarget(t); else if (t.id !== selected) choose(t) }}><strong>{t.title}</strong><small>{t.id.startsWith('discovered.') ? 'Found in code · unconfirmed' : `Expected ${t.kind}`} · {t.implementation} · preview {t.preview}</small></Button></li>)}</ul>
    {target && <section className="rh-coverage-detail"><h3>{target.title}</h3><p>{target.reason}</p><p className="rh-muted">Evidence: {target.verification}{target.missingEdges.length ? ` · ${target.missingEdges.length} undeclared transitions` : ''}</p>{target.component && <code>{target.component}</code>}
      {target.scenarios.length > 0 && <Button variant="outline" onClick={() => focus(target.scenarios[0]!)}>Show first registered screen</Button>}
      <Button variant="outline" disabled={intent !== null} onClick={() => editIntent(target)}>Edit repository expectation</Button>
      {!candidate && <Button variant="outline" disabled={busy} onClick={() => void act({ ...base, operation: 'generate', id: selected })}>Scaffold proposal</Button>}
      {candidate && <><p className="rh-muted">Candidate v{candidate.version} · {candidate.stale ? 'source changed; review required' : 'matches source revision'}</p><div className="rh-coverage-actions"><Button variant="outline" disabled={busy || candidate.acknowledged} onClick={() => void act({ ...base, operation: 'acknowledge', id: selected })}>{candidate.acknowledged ? 'Acknowledged' : 'Acknowledge'}</Button><Button variant="outline" disabled={draft !== null} onClick={() => { setDraft({ ...base, id: selected, title: candidate.title, body: candidate.body, action: candidate.action }); setCaptured(null) }}>Edit prototype</Button></div>
        {draft && <form onSubmit={async (event) => { event.preventDefault(); const result = await act({ ...draft, operation: 'candidate' }); if (result) setDraft((current) => current?.id === draft.id ? { ...current, source: result.source, expectedVersion: result.version } : current) }}><label className="rh-search">Heading<Input required maxLength={160} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label><label className="rh-search">Description<Textarea required maxLength={4000} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label><label className="rh-search">Action<Input required maxLength={160} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} /></label><Button variant="outline" type="submit" disabled={busy}>Save prototype</Button>{(draft.source !== data.source || draft.expectedVersion !== data.version) && <Button variant="outline" type="button" onClick={() => setDraft({ ...draft, ...base })}>Use latest revision; retain edits</Button>}</form>}
        {content && <section className="rh-generated-preview" aria-label="Synthetic proposal prototype"><small>Proposal only · synthetic input</small><h3>{content.title}</h3><p>{content.body}</p><form onSubmit={(event) => { event.preventDefault(); setCaptured(value) }}><label className="rh-search">Example input<Input value={value} onChange={(e) => setValue(e.target.value)} /></label><Button variant="outline" type="submit">{content.action}</Button></form>{captured !== null && <p role="status">Captured locally: {captured || '(empty)'}. No app operation was performed.</p>}</section>}
        <div className="rh-coverage-actions"><Button variant="outline" disabled={dirtyDraft} onClick={() => download(`${selected}.brief.md`, candidate.brief + `\n\nCurrent candidate v${candidate.version}\nSource: ${candidate.source}\n${candidate.title}\n${candidate.body}\nAction: ${candidate.action}\n`)}>Export brief</Button><Button variant="outline" disabled={dirtyDraft} onClick={() => download(`${selected}.candidate.tsx`, candidate.code)}>Export React candidate</Button>{draft && <Button variant="outline" onClick={() => setDraft(null)}>{dirtyDraft ? 'Discard prototype edits' : 'Use saved candidate'}</Button>}</div><p className="rh-muted">Code export is an isolated scaffold, awaiting an agent implementation and validation. It has no application adapter.</p></>}
    </section>}
    {intent && <form onSubmit={async (event) => { event.preventDefault(); let parsed; try { parsed = JSON.parse(intent.text) } catch { setError('Expectation must be valid JSON. Draft retained.'); return } const result = await act({ ...intent, operation: 'intent', target: parsed }); if (result) { setIntent(null); setStatus('Repository expectation saved. Inventory will refresh automatically.') } }}><h3>Repository expectation</h3><p className="rh-muted">Writes the canonical coverage.json contract; it does not modify app behavior.</p><label className="rh-search">Expected screen, interaction or journey<Textarea disabled={busy} className="rh-intent-editor" value={intent.text} onChange={(e) => setIntent({ ...intent, text: e.target.value })} /></label><Button variant="outline" type="submit" disabled={busy}>Save expectation</Button><Button variant="outline" type="button" onClick={() => setIntent(null)}>Cancel</Button>{(intent.source !== data.source || intent.expectedVersion !== data.version) && <Button variant="outline" type="button" onClick={() => setIntent({ ...intent, ...base, contractVersion: data.report.contractVersion })}>Use latest revision; retain edits</Button>}</form>}
    {error && <p role="alert">{error}</p>}<p role="status">{status}</p>
    <details><summary>Detection limits</summary>{data.report.limits.map((limit) => <p key={limit}>{limit}</p>)}</details>
  </section>
}
