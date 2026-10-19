import { Alert, AlertDescription } from '@civic/shell/ui/alert'
import { Disclosure } from '@civic/shell/ui/disclosure'
import { Field, FieldLabel, FieldGroup } from '@civic/shell/ui/field'
import { Button } from '@civic/shell/ui/button'
import { Input } from '@civic/shell/ui/input'
import { NativeSelect } from '@civic/shell/ui/native-select'
import { Textarea } from '@civic/shell/ui/textarea'
import { useDesktopDraft } from './desktop-project-tabs'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@civic/shell/ui/empty'
import { MessageSquare } from '@civic/shell/icons'
import { useEffect, useRef, useState } from 'react'
import { feedbackText, type FeedbackKind } from './feedback-copy'
import type { MapScreen } from './app-map'
import type { ReviewConfig, ReviewSnapshot } from './adapter'
import { readFixtureFields } from './journey'
import { captureScreen } from '@civic/shell/capture'
import { reviewApi } from './review-api'
import { projectFetch } from './project-request'
import { pathId } from './journey-graph.mjs'
import { AgentDelivery, type Delivery } from './agent-delivery'
import type { ProjectProfile } from './adapter'
import { extension } from './extension'
import { fixtureURL } from './fixture-picture'
import { connectionStyle } from './connection-semantics'

export type ReviewTarget = { kind: 'app' | 'flow' | 'screen' | 'region' | 'path'; id: string; label: string; flow?: string; screen?: string; from?: string; to?: string; action?: string; when?: string | null; returnTo?: string | null; selector?: string }
type Anchor = { label: string; x: number; y: number; width: number; height: number }
type ElementTarget = { label: string; selector: string; tag: string; anchor: Anchor }
export type Feedback = {
  recording?: string
  id: string; kind: FeedbackKind; message: string; status: string; screenshot: string; reproduction: string; sourceStale?: boolean; target?: ReviewTarget
  evidence?: { kind: 'live' | 'fixture' | 'map'; fixtureSource?: string; viewport?: { width: number; height: number } }
  context: ReviewConfig & { screen?: string; viewport: { width: number; height: number }; state: { dialogs: string[]; tabs: string[]; fields: { label: string; value: string }[] } }
  anchor: Anchor; revision: ReviewSnapshot['revision']; resolution?: { evidence: string }
  deliveries?: Delivery[]
}
export function feedbackOnScreen(comment: Feedback, screen: MapScreen) {
  if (comment.target && !['screen', 'region'].includes(comment.target.kind)) return false
  return comment.context.screen ? comment.context.screen === screen.id : comment.context.scenario === screen.scenario
}
type Capture = { requestId: string; recording?: string; context: Feedback['context']; anchor: Anchor; snapshot: ReviewSnapshot; html?: string; target: ReviewTarget; evidence: NonNullable<Feedback['evidence']> }
type NoteDraft = { message: string; kind: FeedbackKind; capture: Capture; elements?: ElementTarget[]; image?: string }
const whole = { label: 'Whole target', x: 0, y: 0, width: 1, height: 1 }

function elementTargets(doc: Document, width: number, height: number): ElementTarget[] {
  return [...doc.querySelectorAll<HTMLElement>('button,input:not([type=password]):not([type=file]):not([type=hidden]),textarea,select,[role=tab],h1,h2,label')].flatMap((element) => {
    const rect = element.getBoundingClientRect()
    const left = Math.max(0, rect.left), top = Math.max(0, rect.top), right = Math.min(width, rect.right), bottom = Math.min(height, rect.bottom)
    if (right <= left || bottom <= top || element.closest('[inert]')) return []
    const label = (element.getAttribute('aria-label') ?? (element as HTMLInputElement).labels?.[0]?.textContent ?? element.textContent ?? element.tagName).trim().slice(0, 200) || element.tagName
    const path: string[] = []
    for (let node: Element | null = element; node && node.tagName !== 'HTML'; node = node.parentElement) {
      if (node.id) { path.unshift(`#${CSS.escape(node.id)}`); break }
      const siblings: Element[] = node.parentElement ? [...node.parentElement.children].filter((child) => child.tagName === node!.tagName) : []
      path.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`)
    }
    return [{ label, tag: element.tagName.toLowerCase(), selector: path.join(' > '), anchor: { label, x: left / width, y: top / height, width: (right - left) / width, height: (bottom - top) / height } }]
  }).slice(0, 150)
}

function FrozenAnnotation({ draft, update, disabled }: { draft: NoteDraft; update: (anchor: Anchor, element?: ElementTarget) => void; disabled: boolean }) {
  const container = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const [width, setWidth] = useState(280)
  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    observer.observe(container.current); return () => observer.disconnect()
  }, [])
  const { viewport } = draft.capture.context
  const anchor = draft.capture.anchor
  return <>
    <p className="rh-muted">Drag a rectangle, click a control, or select one below. This frozen evidence stays attached while you navigate.</p>
    <div ref={container} className="rh-annotation-preview" style={{ aspectRatio: `${viewport.width} / ${viewport.height}` }}>
      {draft.image ? <img src={draft.image} alt="Frozen synthetic starting screen" /> : <iframe title="Frozen annotation evidence" sandbox="allow-same-origin" srcDoc={draft.capture.html} onLoad={(event) => { event.currentTarget.contentDocument?.querySelectorAll<HTMLElement>('[data-review-scroll]').forEach((element) => { element.scrollTop = Number(element.dataset.reviewScroll) }) }} style={{ width: viewport.width, height: viewport.height, transform: `scale(${width / viewport.width})` }} />}
      <div className="rh-annotation-surface" aria-label="Drag to highlight a region in the frozen evidence" onPointerDown={(event) => {
        if (disabled || event.button !== 0) return
        const rect = event.currentTarget.getBoundingClientRect()
        pointer.current = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
        event.currentTarget.setPointerCapture(event.pointerId)
      }} onPointerCancel={() => { pointer.current = null }} onPointerUp={(event) => {
        const start = pointer.current; pointer.current = null
        if (!start || disabled) return
        const rect = event.currentTarget.getBoundingClientRect()
        const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
        if ((Math.abs(x - start.x) + Math.abs(y - start.y)) * rect.width < 8) {
          const element = draft.elements?.filter(({ anchor: a }) => x >= a.x && x <= a.x + a.width && y >= a.y && y <= a.y + a.height).sort((a, b) => a.anchor.width * a.anchor.height - b.anchor.width * b.anchor.height)[0]
          if (element) { update(element.anchor, element); return }
          update({ label: 'Selected point', x: Math.min(x, .98), y: Math.min(y, .98), width: .02, height: .02 }); return
        }
        update({ label: 'Selected region', x: Math.min(x, start.x), y: Math.min(y, start.y), width: Math.max(.001, Math.abs(x - start.x)), height: Math.max(.001, Math.abs(y - start.y)) })
      }} />
      <div className="rh-annotation-box" style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%`, width: `${anchor.width * 100}%`, height: `${anchor.height * 100}%` }} />
    </div>
    <Field><FieldLabel className="cv:grid cv:w-full cv:gap-2">Annotation target<NativeSelect className="cv:w-full" disabled={disabled} value={draft.capture.target?.selector ?? ''} onChange={(event) => { const element = draft.elements?.find((element) => element.selector === event.target.value); update(element?.anchor ?? whole, element) }}><option value="">Whole target / custom region</option>{draft.elements?.map((element) => <option key={element.selector} value={element.selector}>{element.label}{element.tag ? ` · ${element.tag}` : ''}</option>)}</NativeSelect></FieldLabel></Field>
    <Field><FieldLabel className="cv:grid cv:w-full cv:gap-2">Annotation label<Input maxLength={300} disabled={disabled} value={anchor.label} onChange={(event) => update({ ...anchor, label: event.target.value })} /></FieldLabel></Field>
    <Disclosure title={<>Set region with keyboard (%)</>}><div className="rh-region-fields">{(['x', 'y', 'width', 'height'] as const).map((key) => <Field key={key}><FieldLabel className="cv:grid cv:w-full cv:gap-2">{key}<Input type="number" min={key === 'width' || key === 'height' ? .1 : 0} max={100} step="any" disabled={disabled} value={Number((anchor[key] * 100).toFixed(2))} onChange={(event) => {
      const value = Number(event.target.value) / 100
      if (!Number.isFinite(value)) return
      const next = { ...anchor, label: 'Selected region', [key]: Math.max(key === 'width' || key === 'height' ? .001 : 0, Math.min(1, value)) }
      next.width = Math.min(next.width, 1 - next.x); next.height = Math.min(next.height, 1 - next.y)
      if (next.width > 0 && next.height > 0) update(next)
    }} /></FieldLabel></Field>)}</div></Disclosure>
  </>
}

export function ReviewPanel({ project, selected, flowScreens, allScreens, frame, target, canvas, fixture, focus, navigationReady }: {
  project: ProjectProfile
  selected: MapScreen | null; flowScreens: MapScreen[]; allScreens: MapScreen[]; frame: HTMLIFrameElement | null; target: ReviewTarget; canvas: HTMLElement | null
  fixture: { source: string; snapshot: ReviewSnapshot | null; viewport?: { width: number; height: number } }; focus: (target: ReviewTarget) => void; navigationReady: boolean
}) {
  const noteKey = extension.draftKey ?? `rehearsal:${project.key}:review:draft:v1`
  const [loaded, setLoaded] = useState(false)
  const [comments, setComments] = useState<Feedback[]>([])
  const [scope, setScope] = useState('selection')
  const [statusFilter, setStatusFilter] = useState('all')
  const [opened, setOpened] = useState<string | null>(new URLSearchParams(location.search).get('feedback'))
  const [draft, setDraft] = useState<NoteDraft | null>(() => { try { return JSON.parse(localStorage.getItem(noteKey) ?? 'null') } catch { return null } })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [resolution, setResolution] = useState('')
  const [discard, setDiscard] = useState(false)
  useDesktopDraft('review', Boolean(draft) || pending || Boolean(resolution))
  const linkedReview = useRef(new URLSearchParams(location.search).get('feedback'))
  const refresh = () => reviewApi<Feedback[]>('feedback').then(rows => { setComments(rows); setLoaded(true) })
  useEffect(() => { refresh().catch((error) => setError(error.message)) }, [])
  useEffect(() => {
    try { if (draft) localStorage.setItem(noteKey, JSON.stringify(draft)); else localStorage.removeItem(noteKey) }
    catch { setError('Your unsent review could not be retained after reload. Keep this tab open until it saves.') }
  }, [draft])
  useEffect(() => {
    if (!draft) return
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', protect); return () => window.removeEventListener('beforeunload', protect)
  }, [draft])
  const current = comments.find((comment) => comment.id === opened)
  const targetOf = (comment: Feedback): ReviewTarget | undefined => comment.target ?? (() => {
    const screen = allScreens.find((screen) => feedbackOnScreen(comment, screen))
    return screen && { kind: 'screen', id: screen.id, screen: screen.id, label: screen.label }
  })()
  useEffect(() => {
    const linked = comments.find((comment) => comment.id === linkedReview.current)
    const target = linked && targetOf(linked)
    if (target && allScreens.length && navigationReady) { linkedReview.current = null; focus(target) }
  }, [comments, allScreens, navigationReady])
  const begin = async () => {
    if (pending) return
    setPending(true); setError(''); setStatus('')
    try {
      const representative = allScreens.find((screen) => screen.id === target.screen) ?? selected ?? flowScreens[0] ?? allScreens[0]
      if (!representative) throw Error('Wait for the application inventory.')
      let snapshot: ReviewSnapshot, html: string | undefined, image: string | undefined, elements: ElementTarget[] = []
      let evidence: Capture['evidence'], config: ReviewConfig = { scenario: representative.scenario, persona: project.personas[0]!.id, role: project.roles[0]!.id, condition: project.conditions[0]!.id, theme: 'light', textScale: 1, width: 393 }
      let viewport = { width: 393, height: 852 }, state: Feedback['context']['state'] = { dialogs: [], tabs: [], fields: [] }
      let recording: string | undefined
      if (['screen', 'region'].includes(target.kind) && frame) {
        const doc = frame.contentDocument, bridge = frame.contentWindow?.reviewPreview
        if (!doc || !bridge || !doc.querySelector('[role="dialog"],h1')) throw Error('The live screen is still loading. Wait and retry.')
        const runtime = frame.contentWindow?.reviewPreview?.state?.() ?? frame.contentWindow?.guidedJourney?.state()
        if (bridge.recording && runtime?.screen !== representative.scenario) throw Error('The application reached another or unmapped screen. Focus its current screen before capturing a review.')
        snapshot = bridge.snapshot; html = captureScreen(doc); evidence = { kind: 'live' }
        config = { ...bridge.config, condition: bridge.recording ? bridge.config.condition : doc.documentElement.dataset.reviewCondition as ReviewConfig['condition'] ?? bridge.config.condition }
        viewport = { width: frame.clientWidth, height: frame.clientHeight }
        state = { dialogs: [runtime?.title ?? representative.label], tabs: [...doc.querySelectorAll('[role=tab][aria-selected=true]')].map((element) => element.textContent?.trim() || 'Tab'), fields: runtime?.fields ?? readFixtureFields(doc) }
        elements = elementTargets(doc, viewport.width, viewport.height)
        if (bridge.recording) recording = (await reviewApi<{ id: string }>('runs', await bridge.recording())).id
      } else if (['screen', 'region'].includes(target.kind)) {
        if (!fixture.source || !fixture.snapshot) throw Error('The starting screen snapshot is still preparing. Play the screen or wait and retry.')
        viewport = fixture.viewport ?? viewport
        config = { ...config, width: viewport.width, height: viewport.height }
        snapshot = fixture.snapshot; evidence = { kind: 'fixture', fixtureSource: fixture.source, ...(fixture.viewport ? { viewport } : {}) }
        image = fixtureURL(representative.id, fixture.source, fixture.viewport)
        const response = await projectFetch(image)
        if (!response.ok) throw Error('The starting screen snapshot is unavailable. Play this screen to capture it.')
      } else {
        if (!canvas) throw Error('The canvas is unavailable.')
        snapshot = await reviewApi<ReviewSnapshot>('index'); html = captureScreen(document, canvas); evidence = { kind: 'map' }
        viewport = { width: Math.max(200, Math.min(1920, canvas.clientWidth)), height: Math.max(200, Math.min(1600, canvas.clientHeight)) }
      }
      const capture: Capture = { requestId: crypto.randomUUID(), ...(recording ? { recording } : {}), ...(html ? { html } : {}), snapshot, target, evidence, anchor: whole, context: { ...config, scenario: representative.scenario, ...(target.screen ? { screen: target.screen } : {}), viewport, state } }
      setDraft({ message: '', kind: 'confusing', capture, elements, image }); setOpened(null)
    } catch (caught) { setError((caught as Error).message) }
    finally { setPending(false) }
  }
  const updateAnchor = (anchor: Anchor, element?: ElementTarget) => {
    if (!draft) return
    if (!draft.capture.target) { setDraft({ ...draft, capture: { ...draft.capture, anchor } }); return }
    const target = draft.capture.target ?? { kind: 'screen', id: draft.capture.context.screen!, label: draft.capture.context.screen!, screen: draft.capture.context.screen }
    const { selector: _selector, ...base } = target
    const region = anchor.x !== 0 || anchor.y !== 0 || anchor.width !== 1 || anchor.height !== 1
    setDraft({ ...draft, capture: { ...draft.capture, anchor, target: { ...base, kind: ['screen', 'region'].includes(base.kind) ? region ? 'region' : 'screen' : base.kind, ...(element ? { selector: element.selector } : {}) } } })
  }
  const submit = async () => {
    if (!draft?.message.trim() || !draft.capture.anchor.label.trim() || pending) return
    setPending(true); setError('')
    try {
      const saved = await reviewApi<Feedback>('feedback', { ...draft.capture, message: draft.message.trim(), kind: draft.kind })
      setComments((rows) => [...rows.filter((row) => row.id !== saved.id), saved]); setOpened(saved.id); setDraft(null); setStatus('Review saved with its target and frozen evidence.')
    } catch (caught) { setError((caught as Error).message) }
    finally { setPending(false) }
  }
  const filtered = comments.filter((comment) => {
    if (statusFilter !== 'all' && (comment.status === 'resolved') !== (statusFilter === 'resolved')) return false
    if (scope === 'all') return true
    if (scope === 'flow') return !!target.flow && comment.target?.flow === target.flow || flowScreens.some((screen) => feedbackOnScreen(comment, screen))
    return comment.target ? comment.target.id === target.id && (comment.target.kind === target.kind || ['screen', 'region'].includes(comment.target.kind) && ['screen', 'region'].includes(target.kind)) : !!selected && feedbackOnScreen(comment, selected)
  })
  const choose = (comment: Feedback) => { setOpened(comment.id); setResolution(''); const target = targetOf(comment); if (target) focus(target) }
  const pathAction = target.kind === 'path' ? allScreens.find(screen => screen.id === target.from)?.edges.find(edge => edge.destination === target.to && edge.action === target.action) : undefined
  return <div className="rh-review-panel">
    <section className="rh-review-target"><small>{target.kind === 'path' ? 'Selected path' : `Selected ${target.kind}`}</small><strong>{target.label}</strong>{target.action && <p>{target.action}</p>}{pathAction && <small>{connectionStyle(pathAction).label}{pathAction.interaction ? '' : ' · inferred from label'}</small>}{target.when && <p>When: {target.when}</p>}{target.returnTo && <p>Return: {target.returnTo}</p>}</section>
    {!draft && target.kind !== 'app' && <Disclosure title={<>Choose a path or branch</>}><div className="rh-review-paths">{(selected && target.kind !== 'flow' ? [selected] : flowScreens).flatMap((screen) => screen.edges.map((edge) => <Button variant="ghost" className="cv:h-auto cv:w-full cv:block cv:text-left cv:whitespace-normal" key={pathId(screen.id, edge.destination, edge.action)} onClick={() => focus({ kind: 'path', id: pathId(screen.id, edge.destination, edge.action), label: edge.action, from: screen.id, to: edge.destination, action: edge.action })}>{screen.label} → {allScreens.find((screen) => screen.id === edge.destination)?.label ?? edge.destination}<small>{edge.action}{edge.when ? ` · ${edge.when}` : ''}</small></Button>))}</div></Disclosure>}
    <div className="rh-review-filters"><Field><FieldLabel className="cv:grid cv:w-full cv:gap-2">Show reviews<NativeSelect className="cv:w-full" value={scope} onChange={(e) => setScope(e.target.value)}><option value="selection">Selected target</option><option value="flow">Selected flow</option><option value="all">All reviews</option></NativeSelect></FieldLabel></Field><Field><FieldLabel className="cv:grid cv:w-full cv:gap-2">Status<NativeSelect className="cv:w-full" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="resolved">Resolved</option></NativeSelect></FieldLabel></Field></div>
    <Button variant="outline" onClick={() => void refresh().catch((error) => setError(error.message))}>Refresh reviews</Button>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<p role="status">{status}</p>
    {draft ? <form onSubmit={(event) => { event.preventDefault(); void submit() }}><FieldGroup><h3>New review</h3><p className="rh-muted">Frozen {draft.capture.target?.label ?? draft.capture.context.screen} · {draft.capture.evidence?.kind ?? 'live'} evidence · source {draft.capture.snapshot.revision.source.slice(0, 12)}.</p>{draft.capture.evidence?.kind === 'fixture' && <p className="rh-muted">Synthetic starting state. Inputs from an earlier run are not included; play a screen to capture its current inputs.</p>}<FrozenAnnotation draft={draft} update={updateAnchor} disabled={pending} /><Field><FieldLabel className="cv:grid cv:w-full cv:gap-2">Kind<NativeSelect className="cv:w-full" value={draft.kind} disabled={pending} onChange={(e) => setDraft({ ...draft, kind: e.target.value as FeedbackKind })}>{Object.entries(feedbackText.kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></FieldLabel></Field><Field><FieldLabel className="cv:grid cv:w-full cv:gap-2">What should change?<Textarea maxLength={4000} value={draft.message} disabled={pending} onChange={(e) => setDraft({ ...draft, message: e.target.value })} /></FieldLabel></Field><Button variant="default" type="submit"  disabled={pending || !draft.message.trim() || !draft.capture.anchor.label.trim()}>{pending ? 'Capturing and saving…' : 'Save review'}</Button><Button variant="outline" type="button" disabled={pending} onClick={() => setDiscard(true)}>Discard review…</Button>{discard && <Alert><AlertDescription>Discard this unsent review and its capture?</AlertDescription><Button variant="outline" type="button" onClick={() => { setDiscard(false); setDraft(null) }}>Discard review</Button><Button variant="outline" type="button" onClick={() => setDiscard(false)}>Keep writing</Button></Alert>}</FieldGroup></form> : <><Button variant="default" onClick={() => void begin()} disabled={pending}>{pending ? 'Freezing evidence…' : 'Comment on selection'}</Button><p className="rh-muted">Select a flow, screen, or arrow. Use App in the breadcrumb to comment on the entire journey.</p></>}
    <ul className="rh-review-list">{filtered.map((comment) => <li key={comment.id}><Button variant="ghost" className="cv:h-auto cv:w-full cv:block cv:text-left cv:whitespace-normal" aria-pressed={opened === comment.id} onClick={() => choose(comment)}><strong>{comment.message}</strong><small>{comment.status === 'resolved' ? 'Resolved' : 'Open'} · {comment.target?.label ?? comment.context.screen ?? comment.context.scenario}</small></Button></li>)}</ul>
    {!loaded && !error && <p role="status">Loading reviews…</p>}{loaded && !filtered.length && !error && <Empty role="status"><EmptyHeader><EmptyMedia variant="icon"><MessageSquare aria-hidden="true" /></EmptyMedia><EmptyTitle>No reviews for this selection</EmptyTitle><EmptyDescription>Select a screen or path, then use Comment on selection to save feedback with evidence.</EmptyDescription></EmptyHeader></Empty>}
    {current && <section className="rh-review-evidence"><div className="rh-inspector-title"><h3>Captured review</h3><Button variant="outline" onClick={() => setOpened(null)}>Close review</Button></div><p>{current.message}</p><p className="rh-muted">{current.target?.label ?? current.context.screen ?? current.context.scenario} · {current.status === 'resolved' ? 'Resolved' : 'Open'} · source {current.revision.source.slice(0, 12)}</p>{current.sourceStale && <Alert variant="destructive"><AlertDescription>Source changed since this capture. An agent must check the current implementation.</AlertDescription></Alert>}<div className="rh-review-image"><img src={current.screenshot} alt={`Frozen evidence: ${current.anchor.label}`} /><div className="rh-annotation-box" style={{ left: `${current.anchor.x * 100}%`, top: `${current.anchor.y * 100}%`, width: `${current.anchor.width * 100}%`, height: `${current.anchor.height * 100}%` }} /></div><Button variant="outline" disabled={!targetOf(current)} onClick={() => { const target = targetOf(current); if (target) focus(target) }}>Focus target on canvas</Button><p className="rh-muted">Focus preserves your run. The screenshot is historical evidence.</p>{current.recording && <p><a href={`/api/review/runs/${current.recording}`} download>Download recorded run</a> · <a href={`/review-frame.html?recording=${current.recording}`} target="_blank" rel="noreferrer">Replay in a new preview</a></p>}<Disclosure title={<>Captured inputs ({current.context.state.fields.length})</>}><dl className="rh-fields">{current.context.state.fields.map((field, i) => <div key={i}><dt>{field.label}</dt><dd>{field.value || '(empty)'}</dd></div>)}</dl></Disclosure><a href={`/api/review/feedback/${current.id}/handoff`} download>Download agent brief</a><Button variant="outline" onClick={() => {
      void projectFetch(`/api/review/feedback/${current.id}/handoff`).then(async (response) => { if (!response.ok) throw Error('The agent brief could not be loaded.'); await navigator.clipboard.writeText(await response.text()); setStatus('Agent brief copied. Give it to the agent working on this correction.') }).catch((error) => setError(error.message))
    }}>Copy agent brief</Button><AgentDelivery key={current.id} review={current} saved={(saved) => setComments((rows) => rows.map((row) => row.id === saved.id ? saved : row))} />{current.resolution ? <p>Resolution evidence: {current.resolution.evidence}</p> : <form onSubmit={(event) => { event.preventDefault(); setPending(true); setError(''); void reviewApi<Feedback>(`feedback/${current.id}/resolve`, { evidence: resolution.trim() }).then((saved) => { setComments((rows) => rows.map((row) => row.id === saved.id ? saved : row)); setResolution(''); setStatus('Review resolved with evidence.') }).catch((error) => setError(error.message)).finally(() => setPending(false)) }}><FieldGroup><Field><FieldLabel className="cv:grid cv:w-full cv:gap-2">Resolution evidence<Input value={resolution} maxLength={2000} disabled={pending} onChange={(e) => setResolution(e.target.value)} placeholder="Passing check or correction receipt" /></FieldLabel></Field><Button variant="outline" type="submit" disabled={pending || !resolution.trim()}>Resolve with evidence</Button></FieldGroup></form>}</section>}
    <a href="/api/review/feedback" target="_blank" rel="noreferrer">Agent-readable feedback</a>
  </div>
}
