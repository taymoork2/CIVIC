import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { feedbackText, type FeedbackKind } from '@/copy/feedback'
import type { ReviewConfig, ReviewSnapshot } from './store'
import '@/app.css'
import '@/generated/tokens.css'
import '@civic/canvas/styles/review.css'
import { projectFetch } from '@civic/canvas/project-request'

type Scenario = { id: string; label: string; journey: string; renderer: string; component: string; design: string[]; checks: string[]; preview: string; implementation: string; designCoverage: string; reference: string; behavior: string; native: string; device: string; edges?: { action: string; destination: string; effect: string }[] }
type Index = { validation: { path: string; status: string }; revision: { head: string; source: string; capturedAt: string }; design: { project: string; hashes: Record<string, string | null>; reconciliation: string }; scenarios: Scenario[]; surfaces: { id: string; name: string; path: string; kind: string; scenarios: string[] }[]; limits: string[] }
type Anchor = { label: string; x: number; y: number; width: number; height: number; locator?: { role: string; name: string } }
type State = { dialogs: string[]; tabs: string[]; fields: { label: string; value: string }[] }
type Feedback = { sourceStale?: boolean; id: string; kind: FeedbackKind; message: string; context: ReviewConfig & { viewport: { width: number; height: number }; state: State }; anchor: Anchor; screenshot: string; reproduction: string; status: string; resolution?: { evidence: string }; revision: Index['revision']; annotationId?: string; sharedError?: string }
// CIVIC's shared store, read through the review server (decision 0007): every line, and each annotation with its work requests.
type SharedLine = { id: string; title: string; type: string; head: string; status: string }
type SharedRequest = { id: string; status: string; title: string }
type Shared = { current: string; lines: SharedLine[]; annotations: { annotation: { id: string; title: string; comment: string; seenOn: { line: string; revision: string } }; requests: SharedRequest[] }[] }
const requestStatus: Record<string, string> = { open: 'Open', claimed: 'Claimed by an agent', 'fix-ready': 'Fix ready for review', resolved: 'Resolved', reopened: 'Reopened' }
const screenAnchor: Anchor = { label: 'Whole screen', x: 0, y: 0, width: 1, height: 1 }
const initial = () => {
  const p = new URLSearchParams(location.search)
  return { scenario: p.get('scenario') ?? 'intake.pack.type', persona: p.get('persona') === 'parent' ? 'parent' : p.get('persona') === 'student' ? 'student' : 'single', role: p.get('role') === 'member' ? 'member' : 'owner', condition: ['save-error', 'offline', 'missing-care'].includes(p.get('condition') ?? '') ? p.get('condition') : 'normal', theme: p.get('theme') === 'dark' ? 'dark' : 'light', textScale: p.get('scale') === '2' ? 2 : 1, width: [320, 393, 1024].includes(Number(p.get('width'))) ? Number(p.get('width')) : 393 } as ReviewConfig
}
const search = (config: ReviewConfig) => new URLSearchParams({ view: 'review', scenario: config.scenario, persona: config.persona, role: config.role, condition: config.condition, theme: config.theme, scale: String(config.textScale), width: String(config.width) })
const noteKey = (config: ReviewConfig) => `laundered-review:note:${search(config)}`
async function api<T>(path: string, input?: unknown): Promise<T> {
  const response = await projectFetch(`/api/review/${path}`, input === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Review request failed. Retry.')
  return result
}
function labelOf(element: Element): string {
  const input = element as HTMLInputElement
  return element.getAttribute('aria-label') ?? input.labels?.[0]?.textContent?.trim() ?? element.textContent?.trim().slice(0, 200) ?? element.id ?? element.tagName
}
const implicitRoles: Record<string, string> = { BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox', H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading' }
/** The element's ARIA role and accessible name, so CIVIC can find it again by exact locator on another revision (D37). */
function locatorOf(element: Element): Anchor['locator'] {
  const input = element as HTMLInputElement
  const role = element.getAttribute('role') ?? (element.tagName === 'A' && element.hasAttribute('href') ? 'link' : element.tagName === 'INPUT' ? ({ checkbox: 'checkbox', radio: 'radio', button: 'button', submit: 'button' } as Record<string, string>)[input.type] ?? 'textbox' : implicitRoles[element.tagName])
  const name = labelOf(element).replace(/\s+/g, ' ').trim()
  return role && /^[a-z]{2,40}$/.test(role) && name ? { role, name: name.slice(0, 300) } : undefined
}
function visible(element: Element) { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && !element.closest('[inert]') }
function capture(doc: Document) {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement
  const liveNodes = [...doc.querySelectorAll<HTMLElement>('*')]
  const clonedNodes = [...clone.querySelectorAll<HTMLElement>('*')]
  liveNodes.forEach((element, i) => { if (element.scrollTop > 0) clonedNodes[i - 1]?.setAttribute('data-review-scroll', String(element.scrollTop)) })
  clone.querySelectorAll('script, iframe, link, noscript, style').forEach((element) => element.remove())
  const originals = [...doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')]
  const copies = [...clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')]
  originals.forEach((element, index) => {
    const copy = copies[index]!
    if (element.tagName === 'INPUT') { const input = element as HTMLInputElement; copy.setAttribute('value', input.type === 'password' ? '' : input.value); if (input.checked) copy.setAttribute('checked', ''); else copy.removeAttribute('checked') }
    else if (element.tagName === 'TEXTAREA') copy.textContent = element.value
    else [...copy.querySelectorAll('option')].forEach((option) => { if (option.value === element.value) option.setAttribute('selected', ''); else option.removeAttribute('selected') })
  })
  const css = [...doc.styleSheets].map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join('\n').replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (_match, _quote, url) => `url("${new URL(url, sheet.href ?? doc.baseURI).href}")`)).join('\n')
  const style = doc.createElement('style'); style.textContent = css
  clone.querySelector('head')!.append(style)
  const base = doc.createElement('base'); base.href = doc.baseURI; clone.querySelector('head')!.prepend(base)
  const state: State = { dialogs: [...doc.querySelectorAll('[role="dialog"]')].filter(visible).map((element) => element.querySelector('h1,h2,[data-slot="sheet-title"]')?.textContent?.trim() ?? element.getAttribute('aria-label') ?? 'Task drawer'), tabs: [...doc.querySelectorAll('[role="tab"][aria-selected="true"]')].filter(visible).map(labelOf), fields: originals.filter((element) => visible(element) && element.type !== 'password').map((element) => ({ label: labelOf(element) || element.id || 'Field', value: element.tagName === 'INPUT' && ['checkbox', 'radio'].includes(element.type) ? String((element as HTMLInputElement).checked) : element.value })) }
  return { html: '<!doctype html>' + clone.outerHTML, state }
}

function Workspace() {
  const [index, setIndex] = useState<Index | null>(null)
  const [config, setConfig] = useState(initial)
  const [queued, setQueued] = useState<ReviewConfig | null>(null)
  const [resetQueued, setResetQueued] = useState(false)
  const [restart, setRestart] = useState(0)
  const [query, setQuery] = useState('')
  const [comments, setComments] = useState<Feedback[]>([])
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<FeedbackKind>('confusing')
  const [anchor, setAnchor] = useState<Anchor>(screenAnchor)
  const [annotating, setAnnotating] = useState(false)
  const [targets, setTargets] = useState<Element[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('')
  const [resolution, setResolution] = useState('')
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [shared, setShared] = useState<Shared | null>(null)
  const [lens, setLens] = useState('')
  const frame = useRef<HTMLIFrameElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const request = useRef<{ requestId: string; message: string; kind: FeedbackKind; context: unknown; anchor: Anchor; html: string; snapshot: ReviewSnapshot } | null>(null)
  const current = index?.scenarios.find((scenario) => scenario.id === config.scenario)
  // The shared store is optional: a server without the civic CLI still reviews as before.
  const refreshShared = () => api<Shared>('shared').then(setShared, () => setShared(null))
  const refresh = () => Promise.all([api<Feedback[]>('feedback').then(setComments), refreshShared()])
  const handOff = async (comment: Feedback) => {
    try { await api('hand-off', { annotationIds: [comment.annotationId], ask: comment.message }); await refreshShared(); setStatus('Handed to agents as a work request. Any worktree can claim it with civic claim.') }
    catch (caught) { setError((caught as Error).message) }
  }
  const requestsFor = (annotationId?: string) => shared?.annotations.find((entry) => entry.annotation.id === annotationId)?.requests ?? []
  useEffect(() => { Promise.all([api<Index>('index').then(setIndex), refresh()]).catch((error) => setError(error.message)) }, [])
  useEffect(() => { document.documentElement.dataset.theme = config.theme; try { const saved = JSON.parse(localStorage.getItem(noteKey(config)) ?? 'null'); setNote(saved?.message ?? ''); setKind(saved?.kind ?? 'confusing'); setAnchor(saved?.anchor ?? screenAnchor) } catch { setNote(''); setAnchor(screenAnchor) } }, [config])
  const persistNote = (message: string, nextKind = kind, nextAnchor = anchor) => {
    try { if (message) localStorage.setItem(noteKey(config), JSON.stringify({ message, kind: nextKind, anchor: nextAnchor })); else localStorage.removeItem(noteKey(config)) }
    catch { setError('Unsent feedback could not be kept after reload. Leave this tab open and retry.') }
  }
  const pin = (next: Anchor) => { setAnchor(next); persistNote(note, kind, next); request.current = null }
  const change = (next: ReviewConfig, reset = false) => { if (!pending) { setQueued(next); setResetQueued(reset) } }
  const apply = () => {
    if (!queued) return
    if (resetQueued) frame.current?.contentWindow?.reviewPreview?.restart()
    history.replaceState(null, '', `/review?${search(queued)}`)
    setConfig(queued); setQueued(null); setRestart((value) => value + 1); setAnnotating(false); setAnchor(screenAnchor); setStatus(resetQueued ? 'Preview restarted with fresh synthetic records.' : 'Preview changed. Saved synthetic records are retained.'); request.current = null
  }
  const toggleAnnotations = () => {
    const doc = frame.current?.contentDocument
    setTargets(doc ? [...doc.querySelectorAll('button, input, textarea, select, [role="tab"], label')].filter(visible) : [])
    setAnnotating((value) => !value)
  }
  const fromElement = (element: Element) => {
    const rect = element.getBoundingClientRect()
    const width = frame.current!.clientWidth, height = frame.current!.clientHeight
    const x = Math.max(0, Math.min(1, rect.left / width)), y = Math.max(0, Math.min(1, rect.top / height))
    const locator = locatorOf(element)
    return { label: labelOf(element) || 'Selected element', ...(locator ? { locator } : {}), x, y, width: Math.max(0.001, (Math.min(width, rect.right) - Math.max(0, rect.left)) / width), height: Math.max(0.001, (Math.min(height, rect.bottom) - Math.max(0, rect.top)) / height) }
  }
  const submit = async () => {
    if (!note.trim() || pending) return
    setPending(true); setError(null); setStatus('')
    try {
      if (request.current === null) {
        const doc = frame.current?.contentDocument
        if (!doc?.querySelector('[role="dialog"], h1')) throw new Error('Preview is still loading. Wait and retry.')
        const snapshot = capture(doc)
        const rendered = frame.current?.contentWindow?.reviewPreview?.snapshot
        if (!rendered) throw new Error('Preview source receipt unavailable. Reload and retry.')
        request.current = { requestId: crypto.randomUUID(), message: note.trim(), kind, context: { ...config, condition: doc.documentElement.dataset.reviewCondition ?? config.condition, viewport: { width: frame.current!.clientWidth, height: frame.current!.clientHeight }, state: snapshot.state }, anchor, html: snapshot.html, snapshot: rendered }
      }
      await api('feedback', request.current)
      localStorage.removeItem(noteKey(config)); setNote(''); request.current = null; await refresh(); setStatus('Feedback saved with screenshot and state.'); setAnnotating(false)
    } catch (caught) { setError((caught as Error).message) }
    finally { setPending(false) }
  }
  const filtered = index?.scenarios.filter((scenario) => `${scenario.label} ${scenario.journey} ${scenario.component} ${scenario.preview} ${scenario.reference}`.toLowerCase().includes(query.toLowerCase())) ?? []
  const groups = [...new Set(filtered.map((scenario) => scenario.journey))]
  return <main className="review-workspace">
    <header><h1>CIVIC · Review</h1><a href={`/review?scenario=${encodeURIComponent(config.scenario)}`}>Storyboard</a><p className="review-note">Laundry App · synthetic records · local authenticated evidence</p></header>
    <div className="review-controls">
      <label>Persona<NativeSelect aria-label="Persona" value={config.persona} onChange={(e) => change({ ...config, persona: e.target.value as ReviewConfig['persona'] })}><option value="single">Single adult</option><option value="student">Student / new household</option><option value="parent">Parent / family</option></NativeSelect></label>
      <label>Role<NativeSelect aria-label="Role" value={config.role} onChange={(e) => change({ ...config, role: e.target.value as ReviewConfig['role'] })}><option value="owner">Owner</option><option value="member">Member</option></NativeSelect></label>
      <label>Condition<NativeSelect aria-label="Condition" value={config.condition} onChange={(e) => change({ ...config, condition: e.target.value as ReviewConfig['condition'] })}><option value="normal">Normal saves</option><option value="save-error">Save failure</option><option value="offline">Offline simulation</option><option value="missing-care">Missing care evidence</option></NativeSelect></label>
      <label>Appearance<NativeSelect aria-label="Appearance" value={config.theme} onChange={(e) => change({ ...config, theme: e.target.value as ReviewConfig['theme'] })}><option value="light">Light</option><option value="dark">Dark</option></NativeSelect></label>
      <label>Preview size<NativeSelect aria-label="Preview size" value={config.width} onChange={(e) => change({ ...config, width: Number(e.target.value) })}><option value={393}>Phone · 393</option><option value={320}>Small phone · 320</option><option value={1024}>Desktop · 1024</option></NativeSelect></label>
      <label>Text<NativeSelect aria-label="Text" value={config.textScale} onChange={(e) => change({ ...config, textScale: Number(e.target.value) as 1 | 2 })}><option value={1}>Default</option><option value={2}>Enlarged · 2×</option></NativeSelect></label>
      <Button variant="outline" onClick={() => change({ ...config }, true)} disabled={pending}>Restart scenario</Button>
    </div>
    {queued ? <section className="review-comment" aria-label="Restart confirmation"><h2>Restart this preview?</h2><p>Unsaved preview changes will be discarded. {resetQueued ? 'Saved synthetic records for this persona and condition will reset.' : 'Saved synthetic records are retained; a different persona, role or condition uses its own dataset.'} Feedback already saved remains. Unsent notes are kept with their original scenario.</p><div className="review-controls"><Button onClick={apply}>Restart preview</Button><Button variant="outline" onClick={() => setQueued(null)}>Keep reviewing</Button></div></section> : null}
    {error ? <p role="alert">{error}</p> : null}<p role="status">{status}</p>
    <div className="review-columns">
      <nav className="review-navigator" aria-label="Scenario navigator"><label>Find a scenario<Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Journey, component, missing…" /></label>
        {groups.map((group) => <section key={group}><h2>{group}</h2>{filtered.filter((scenario) => scenario.journey === group).map((scenario) => <Button key={scenario.id} variant={scenario.id === config.scenario ? 'secondary' : 'unstyled'} onClick={() => change({ ...config, scenario: scenario.id })}>{scenario.label} {scenario.preview === 'visual-or-partial' ? '· partial' : ''}</Button>)}</section>)}
        {index && filtered.length === 0 ? <p>No matching scenarios.</p> : null}
      </nav>
      <section className="review-stage" aria-label="Scenario review"><h2>{current?.label ?? config.scenario}</h2><p className="review-note">{current?.preview ?? 'Loading inventory…'} · source components · native {current?.native ?? 'unverified'}</p>
        <div className="review-controls"><Button variant="outline" onClick={toggleAnnotations} disabled={pending}>{annotating ? 'Resume interaction' : 'Pin feedback'}</Button><Button variant="outline" onClick={() => { frame.current?.contentWindow?.reviewPreview?.retryWrites(); setStatus('Preview writes enabled. Your open draft is kept; press Save again.') }}>Retry writes</Button><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(new URL(`/review?${search(config)}`, location.origin).href); setStatus('Scenario link copied without credentials.') } catch { setError('Clipboard unavailable. Copy this page’s address.') } }}>Copy scenario link</Button></div>
        <div className="review-frame-scroll"><div className="review-frame-wrap" style={{ width: config.width }}>
          <iframe key={restart} ref={frame} title="Working synthetic preview" src={`/review-frame.html?${search(config)}`} />
          {annotating ? <div className="review-annotation" aria-label="Select element or drag a region; keyboard target selection is below" onPointerDown={(e) => { const rect = e.currentTarget.getBoundingClientRect(); pointer.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerUp={(e) => { const start = pointer.current; if (!start) return; const rect = e.currentTarget.getBoundingClientRect(); const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left)), y = Math.max(0, Math.min(rect.height, e.clientY - rect.top)); if (Math.abs(x - start.x) + Math.abs(y - start.y) < 8) { const element = frame.current?.contentDocument?.elementFromPoint(x, y); if (element) pin(fromElement(element)) } else pin({ label: 'Selected region', x: Math.min(x, start.x) / rect.width, y: Math.min(y, start.y) / rect.height, width: Math.max(0.001, Math.abs(x - start.x) / rect.width), height: Math.max(0.001, Math.abs(y - start.y) / rect.height) }); pointer.current = null; request.current = null }} /> : null}
          {annotating && anchor.label !== 'Whole screen' ? <div className="review-pin" style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%`, width: `${anchor.width * 100}%`, height: `${anchor.height * 100}%` }} /> : null}
        </div></div>
        {annotating ? <label>Keyboard feedback target<NativeSelect value={targets.findIndex((element) => labelOf(element) === anchor.label)} onChange={(e) => { const target = targets[Number(e.target.value)]; target?.scrollIntoView({ block: 'center', behavior: 'instant' }); pin(target ? fromElement(target) : screenAnchor) }}><option value={-1}>Whole screen</option>{targets.map((target, i) => <option key={i} value={i}>{labelOf(target) || `Control ${i + 1}`}</option>)}</NativeSelect></label> : null}
        <form className="review-feedback-form" onSubmit={(e) => { e.preventDefault(); void submit() }}><label>{feedbackText.kindLabel}<NativeSelect value={kind} disabled={pending} onChange={(e) => { setKind(e.target.value as FeedbackKind); persistNote(note, e.target.value as FeedbackKind); request.current = null }}>{Object.entries(feedbackText.kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></label><label>Comment on {anchor.label}<Textarea aria-label={`Comment on ${anchor.label}`} value={note} maxLength={4000} disabled={pending} onChange={(e) => { setNote(e.target.value); persistNote(e.target.value); request.current = null }} /></label><Button type="submit" disabled={pending || !note.trim()}>{pending ? 'Capturing and saving…' : 'Save feedback'}</Button><p className="review-note">Stores a synthetic preview screenshot, visible draft fields, drawer/tab, source and design revisions. Password fields are excluded.</p></form>
        <Button variant="outline" onClick={() => setEvidenceOpen(!evidenceOpen)}>Design, implementation and validation links</Button>
        {evidenceOpen && current && index ? <section className="review-evidence"><p>Design: {current.designCoverage}. Reference: {current.reference}.</p><p>Behavior: {current.behavior}. Device: {current.device}.</p><p>Validation receipt: {index.validation.status}. <a href={`/api/review/evidence?file=${encodeURIComponent(index.validation.path)}`} target="_blank" rel="noreferrer">Local check receipt</a></p><p>{index.design.reconciliation}</p><a href={`/api/review/evidence?file=${encodeURIComponent(current.component)}`} target="_blank" rel="noreferrer">Web component · {current.component}</a>{current.design.map((path) => <a key={path} href={`/api/review/evidence?file=${encodeURIComponent(`design:${path}`)}`} target="_blank" rel="noreferrer">Canonical design · {path}</a>)}{current.checks.map((path) => <a key={path} href={`/api/review/evidence?file=${encodeURIComponent(path)}`} target="_blank" rel="noreferrer">Scoped check source · {path}</a>)}<p>App {index.revision.head.slice(0, 12)} · input {index.revision.source.slice(0, 12)}</p><h2>Related states using this component</h2>{index.scenarios.filter((scenario) => scenario.component === current.component).map((scenario) => <a key={scenario.id} href={`/review?${search({ ...config, scenario: scenario.id })}`} onClick={(e) => { e.preventDefault(); change({ ...config, scenario: scenario.id }) }}>{scenario.label}</a>)}{current.edges?.map((edge) => <p key={edge.destination}>{edge.action} → <a href={`/review?${search({ ...config, scenario: edge.destination })}`} onClick={(e) => { e.preventDefault(); change({ ...config, scenario: edge.destination }) }}>{edge.destination}</a> · {edge.effect}</p>)}</section> : null}
        <Button variant="outline" onClick={() => setInventoryOpen(!inventoryOpen)}>Surface inventory and coverage gaps</Button>
        {inventoryOpen && index ? <section className="review-evidence"><p>{index.surfaces.length} source-discovered routes/sheet presenters; {index.scenarios.length} named preview entries. Neither count proves complete journey coverage.</p>{index.limits.map((limit) => <p key={limit}>{limit}</p>)}{index.surfaces.filter((surface) => surface.scenarios.length === 0).map((surface) => <p key={surface.id}>Review entry missing: {surface.name} · {surface.path}</p>)}<a href="/api/review/index" target="_blank" rel="noreferrer">Agent-readable connected index</a></section> : null}
        <h2>Saved feedback</h2><a href="/api/review/feedback" target="_blank" rel="noreferrer">Agent-readable feedback and screenshot links</a>
        {comments.filter((comment) => comment.context.scenario === config.scenario).map((comment) => <article className="review-comment" key={comment.id}><p>{comment.message}</p><p className="review-note">{feedbackText.kinds[comment.kind]} · {comment.status} · {comment.anchor.label} · {comment.context.persona}/{comment.context.role} · {comment.revision.head.slice(0, 12)}</p><p className="review-note">Input {comment.revision.source.slice(0, 12)} · {comment.sourceStale ? 'source changed after this preview opened' : 'revision captured with this preview'}</p><div className="review-frame-wrap" style={{ width: '100%' }}><img src={comment.screenshot} alt={`Captured preview: ${comment.anchor.label}`} /><div className="review-pin" style={{ left: `${comment.anchor.x * 100}%`, top: `${comment.anchor.y * 100}%`, width: `${comment.anchor.width * 100}%`, height: `${comment.anchor.height * 100}%` }} /></div><a href={comment.reproduction}>Reopen scenario and compare with original capture</a>{comment.annotationId && shared ? (requestsFor(comment.annotationId).length > 0 ? <p className="review-note">Work request: {requestsFor(comment.annotationId).map((request) => requestStatus[request.status] ?? request.status).join(', ')}</p> : <Button variant="outline" onClick={() => void handOff(comment)}>Hand to agent</Button>) : comment.sharedError ? <p className="review-note">{comment.sharedError}</p> : null}{comment.resolution ? <p>Resolution evidence: {comment.resolution.evidence}</p> : <><label>Resolution evidence<Input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Passing check or correction receipt" /></label><Button variant="outline" disabled={!resolution.trim()} onClick={async () => { try { await api(`feedback/${comment.id}/resolve`, { evidence: resolution }); await refresh(); setResolution('') } catch (caught) { setError((caught as Error).message) } }}>Resolve with evidence</Button></>}</article>)}
        {shared ? <section className="review-evidence" aria-label="Across lines of work"><h2>Across lines of work</h2><p className="review-note">Notes from every worktree and branch of this repository, from CIVIC's shared store. You are on {shared.current}.</p><label>Line<NativeSelect aria-label="Line" value={lens} onChange={(e) => setLens(e.target.value)}><option value="">All lines</option>{shared.lines.map((line) => <option key={line.id} value={line.id}>{line.title} · {line.type} · {line.head.slice(0, 7)}</option>)}</NativeSelect></label>{shared.annotations.filter((entry) => !lens || entry.annotation.seenOn.line === lens).map((entry) => <p key={entry.annotation.id}>{entry.annotation.title} · {entry.annotation.seenOn.line} at {entry.annotation.seenOn.revision.slice(0, 7)}{entry.requests.length > 0 ? ` · ${entry.requests.map((request) => requestStatus[request.status] ?? request.status).join(', ')}` : ''}</p>)}</section> : null}
      </section>
    </div>
  </main>
}
// The canvas opens this older workspace only with ?legacy=1.
createRoot(document.getElementById('review-root')!).render(<Workspace />)
