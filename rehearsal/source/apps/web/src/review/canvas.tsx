import { useEffect, useRef, useState } from 'react'
import nodes from './towel-journey.json'
import type { IntakePresentation } from '@/closet/add-clothes'
import type { Proposal, JourneyState, JourneyVisit } from './journey'
import { captureScreen } from './capture'

export async function reviewApi<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/review/${path}`, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Review request failed. Your draft is kept.')
  return result
}
const emptyProposal = (): Proposal => ({ id: crypto.randomUUID(), version: 0, title: 'Towel exploration', edits: {}, updatedAt: '', source: '' })
const boot = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const runKey = 'rehearsal:towel:visits:v1'

// The app canvas owns navigation; this session keeps the same iframe across screen transitions.
export function useTowelSession(selectionId: string | null) {
  const [state, setState] = useState<JourneyState | null>(null)
  const [mode, setMode] = useState<'play' | 'edit'>('play')
  const [proposal, setProposal] = useState<Proposal>(emptyProposal)
  const [edits, setEdits] = useState<IntakePresentation>({})
  const [candidate, setCandidate] = useState(false)
  const [visits, setVisits] = useState<JourneyVisit[]>(() => { try { return JSON.parse(sessionStorage.getItem(runKey) ?? '[]') } catch { return [] } })
  const [queued, setQueued] = useState<string | null>(null)
  const [start, setStart] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [branch, setBranch] = useState(boot.get('branch') === 'pre-owned' ? 'pre-owned' : 'new')
  const [queuedBranch, setQueuedBranch] = useState(branch)
  const [property, setProperty] = useState<'screen' | 'action'>('screen')
  const frame = useRef<HTMLIFrameElement>(null)
  const follow = useRef(true)
  const sourceRef = useRef('')
  const run = useRef(crypto.randomUUID())
  const failedCaptures = useRef(new Map<string, unknown>())
  const current = state?.screen ?? start ?? 'type'
  const selected = selectionId && nodes.some((node) => node.id === selectionId) ? selectionId : current
  const active = nodes.find((node) => node.id === current)
  const selection = nodes.find((node) => node.id === selected)
  const lastMapped = useRef(nodes[0]!)
  if (active) lastMapped.current = active
  const currentNode = active ?? lastMapped.current
  const dirtyProposal = JSON.stringify(edits) !== JSON.stringify(proposal.edits)
  const staleProposal = Boolean(proposal.source && source && proposal.source !== source)
  const selectedEdit = edits[selected] ?? {}
  const snapshots = new Map(visits.filter((visit) => visit.capture && visit.source === source).map((visit) => [visit.from, visit]))
  useEffect(() => {
    reviewApi<Proposal[]>('proposals').then((rows) => { const last = rows.at(-1); if (last) { setProposal(last); setEdits(last.edits) } }).catch((error) => setError(error.message))
    reviewApi<{ revision: { source: string } }>('index').then((data) => { setSource(data.revision.source); sourceRef.current = data.revision.source }).catch((error) => setError(error.message))
  }, [])
  useEffect(() => {
    try { sessionStorage.setItem(runKey, JSON.stringify(visits.slice(-60))) } catch { setError('Run history could not be retained in this tab. Keep it open until captures finish.') }
  }, [visits])
  useEffect(() => {
    frame.current?.contentWindow?.towelJourney?.setPresentation(candidate || mode === 'edit' ? edits : {}, candidate ? proposal.version : null)
  }, [edits, mode, candidate, proposal.version])
  const captureVisit = async (visit: JourneyVisit, input: unknown) => {
    try {
      const receipt = await reviewApi<{ screenshot: string }>('capture', input)
      failedCaptures.current.delete(visit.id)
      setVisits((rows) => rows.map((row) => row.id === visit.id ? { ...row, capture: receipt.screenshot, captureError: undefined } : row))
    } catch (caught) {
      failedCaptures.current.set(visit.id, input)
      setVisits((rows) => rows.map((row) => row.id === visit.id ? { ...row, captureError: (caught as Error).message } : row))
    }
  }
  const attach = () => {
    const win = frame.current?.contentWindow
    if (!win) return
    const receive = (event: Event) => {
      const next = (event as CustomEvent<JourneyState>).detail
      setState(next)
    }
    const transition = (event: Event) => {
      const detail = (event as CustomEvent<{ from: string; to: string; state: JourneyState; fields: JourneyState['fields']; action: string }>).detail
      if (!detail.state || detail.from === detail.to) return
      const visit: JourneyVisit = { id: crypto.randomUUID(), runId: run.current, source: win.towelJourney?.snapshot.revision.source ?? sourceRef.current, from: detail.from, to: detail.to, draft: structuredClone(detail.state.draft), fields: detail.fields, action: detail.action.slice(0, 160), at: new Date().toISOString(), proposalVersion: detail.state.proposalVersion }
      setVisits((rows) => [...rows.slice(-59), visit])
      const doc = frame.current?.contentDocument
      const snapshot = win.towelJourney?.snapshot
      if (doc && snapshot) {
        const node = nodes.find((node) => node.id === detail.from)
        const input = { requestId: visit.id, kind: 'other', message: `Towel transition ${detail.from} → ${detail.to}`, anchor: { label: 'Whole screen', x: 0, y: 0, width: 1, height: 1 }, snapshot, html: captureScreen(doc), context: { scenario: node?.scenario ?? 'intake.towel.care', persona: 'single', role: 'owner', condition: boot.get('condition') ?? 'normal', theme: 'light', textScale: 1, viewport: { width: 393, height: 852 }, state: { dialogs: [detail.state.title || detail.from], tabs: [], fields: detail.fields } } }
        void captureVisit(visit, input)
      }
    }
    win.addEventListener('journey-state', receive)
    win.addEventListener('journey-transition', transition)
    const existing = win.towelJourney?.state(); if (existing) { setState(existing) }
    win.towelJourney?.setPresentation(candidate || mode === 'edit' ? edits : {}, candidate ? proposal.version : null)
    win.addEventListener('pagehide', () => { win.removeEventListener('journey-state', receive); win.removeEventListener('journey-transition', transition) }, { once: true })
  }
  const update = (key: 'title' | 'action' | 'color', value: string) => {
    setEdits((old) => { const edit = { ...old[selected] }; if (value.trim()) edit[key] = value; else delete edit[key]; return { ...old, [selected]: edit } })
    setCandidate(true)
  }
  const save = async (play = false) => {
    setSaving(true); setError('')
    try {
      const saved = await reviewApi<Proposal>('proposals', { ...proposal, edits, source: sourceRef.current, expectedVersion: proposal.version })
      setProposal(saved); setEdits(saved.edits); setCandidate(true); setStatus(`Proposal v${saved.version} saved. ${play ? 'Playing your candidate.' : 'Ready to test.'}`)
      if (play) setMode('play')
    } catch (caught) { setError((caught as Error).message) }
    finally { setSaving(false) }
  }
  const play = () => { if (dirtyProposal || mode === 'edit' && staleProposal) void save(true); else setMode('play') }
  const jump = () => {
    if (!queued) return
    run.current = crypto.randomUUID()
    setBranch(queuedBranch); setStart(queued); setState(null); setGeneration((value) => value + 1); setQueued(null); follow.current = true; setStatus('Jumped to a fixture. No preceding path was traversed.')
  }
  const startNode = nodes.find((node) => node.id === start) ?? nodes[0]!
  const src = `/review-frame.html?scenario=${startNode.scenario}&journey=towel&care=${start?.split(':')[1] ?? 'wash'}&branch=${branch}&condition=${boot.get('condition') ?? 'normal'}`

  const requestStart = (id: string) => {
    if (!start) { setStart(id); follow.current = true }
    else if (id !== current) { setQueuedBranch(branch); setQueued(id) }
  }
  useEffect(() => {
    if (!state?.dirty && !dirtyProposal) return
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [state?.dirty, dirtyProposal])
  const notices = <>    {error && <div className="rh-alert" role="alert">{error} <button onClick={async () => { try { const rows = await reviewApi<Proposal[]>('proposals'); const latest = rows.find((row) => row.id === proposal.id); if (latest) { setProposal(latest); setEdits(latest.edits); setError(''); setStatus('Latest proposal loaded; your run is kept.') } } catch (caught) { setError((caught as Error).message) } }}>Load latest proposal</button></div>}
    <p className="rh-status" role="status">{status}</p>
    {queued && <section className="rh-confirm" aria-label="Start here confirmation"><h2>Start a new run here?</h2><p>This replaces the open application draft with a fixture. Captured visits and proposal edits are kept.</p><label>Ownership branch<select value={queuedBranch} onChange={(e) => setQueuedBranch(e.target.value)}><option value="new">Newly owned</option><option value="pre-owned">Pre-owned</option></select></label><button disabled={state?.pending} onClick={jump}>Start here</button><button onClick={() => setQueued(null)}>Keep this run</button></section>}
</>
  const inspector = <>        {staleProposal && <p className="rh-alert">Proposal v{proposal.version} was saved against an earlier source. Review its edits before saving a new version. Testing it does not approve or adopt it.</p>}
        {mode === 'edit' ? <><p>Changes to {selection?.label ?? current} in <strong>{proposal.title}</strong>.</p><div className="rh-mode"><button aria-pressed={property === 'screen'} onClick={() => setProperty('screen')}>Screen heading</button><button aria-pressed={property === 'action'} onClick={() => setProperty('action')}>Primary action</button></div>{property === 'screen' ? <label>Heading<input maxLength={160} value={selectedEdit.title ?? ''} placeholder={selected === current ? state?.title : 'Keep app heading'} onChange={(e) => update('title', e.target.value)} /></label> : <><label>Action label<input maxLength={160} value={selectedEdit.action ?? ''} placeholder={selected === current ? state?.action : 'Keep app label'} onChange={(e) => update('action', e.target.value)} /></label><label>Button color<input type="color" value={selectedEdit.color ?? '#174bf5'} onChange={(e) => update('color', e.target.value)} /></label></>}<p className="rh-muted">This screen only. Empty copy restores the app value. Behavior and validation stay with the real component.</p><button className="rh-primary" disabled={saving || !dirtyProposal && !staleProposal} onClick={() => void save()}>{saving ? 'Saving…' : 'Save proposal'}</button><button disabled={saving} onClick={play}>{dirtyProposal || staleProposal ? 'Save & play candidate' : 'Play candidate'}</button><button onClick={() => { setEdits(proposal.edits); setStatus('Unpublished edits reverted; your run is kept.') }}>Revert unpublished edits</button></> : <><p>{candidate ? `Testing proposal ${dirtyProposal ? 'draft' : `v${proposal.version}`}` : 'Testing the baseline'}</p><button disabled={!proposal.version} onClick={() => { setCandidate(!candidate); setStatus('') }}>{candidate ? 'Use baseline' : `Test proposal v${proposal.version}`}</button><p className="rh-muted">Source {source.slice(0, 12)} · Web · 393px · Synthetic</p><a href="/api/review/proposals" target="_blank" rel="noreferrer">Agent-readable proposals</a><a href="/api/review/evidence?file=apps%2Fweb%2Fsrc%2Fcloset%2Fadd-clothes.tsx" target="_blank" rel="noreferrer">Real component source</a><p>{state?.pending ? 'Application operation pending' : state?.dirty ? 'Application draft has changes' : 'Application draft unchanged'}</p>{state?.error && <p role="alert">{state.error}</p>}<button onClick={() => { frame.current?.contentWindow?.reviewPreview?.retryWrites(); setStatus('Writes enabled; your draft is kept. Retry Save in the app.') }}>Retry writes</button></>}
        <details open><summary>Current run inputs</summary>{state?.fields.length ? <dl className="rh-fields">{state.fields.map((field, i) => <div key={i}><dt>{field.label}</dt><dd>{field.value === '' ? '(empty)' : field.value}</dd></div>)}</dl> : <p>No visible input fields.</p>}</details>
        <details><summary>Run history ({visits.length})</summary><ol className="rh-history">{visits.map((visit) => <li key={visit.id}><strong>{visit.from} → {visit.to}</strong><span>{visit.action}</span><small>{visit.proposalVersion === null ? 'Baseline' : `Proposal v${visit.proposalVersion}`} · {new Date(visit.at).toLocaleTimeString()}</small>{visit.capture ? <a href={visit.capture} target="_blank" rel="noreferrer">Frozen screen</a> : <span>{visit.captureError ?? 'Capturing image…'}</span>}{visit.captureError && failedCaptures.current.has(visit.id) && <button onClick={() => void captureVisit(visit, failedCaptures.current.get(visit.id))}>Retry capture</button>}<details><summary>Captured inputs</summary><dl className="rh-fields">{visit.fields.map((field, i) => <div key={i}><dt>{field.label}</dt><dd>{field.value || '(empty)'}</dd></div>)}</dl></details></li>)}</ol></details>
</>
  return { state, mode, setMode, candidate, dirtyProposal, proposal, saving, visits, snapshots, current, active, currentNode, frame, follow, runId: run.current, running: start !== null, generation, src, attach, play, requestStart, setProperty, notices, inspector }
}
