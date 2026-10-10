import { useEffect, useRef, useState } from 'react'
import { feedbackText, type FeedbackKind } from '@/copy/feedback'
import type { MapScreen } from './app-map'
import type { ReviewConfig, ReviewSnapshot } from './store'
import { readFixtureFields } from './journey'
import { captureScreen } from '@civic/shell/capture'
import { reviewApi } from './canvas'

export type Feedback = {
  id: string; kind: FeedbackKind; message: string; status: string; screenshot: string; reproduction: string; sourceStale?: boolean
  context: ReviewConfig & { screen?: string; viewport: { width: number; height: number }; state: { dialogs: string[]; tabs: string[]; fields: { label: string; value: string }[] } }
  anchor: { label: string; x: number; y: number; width: number; height: number }
  revision: ReviewSnapshot['revision']; resolution?: { evidence: string }
}
export function feedbackOnScreen(comment: Feedback, screen: MapScreen) {
  return comment.context.screen ? comment.context.screen === screen.id : comment.context.scenario === screen.scenario
}
type Capture = { requestId: string; context: Feedback['context']; anchor: Feedback['anchor']; snapshot: ReviewSnapshot; html: string }
type NoteDraft = { message: string; kind: FeedbackKind; capture: Capture }
const noteKey = 'rehearsal:review:draft:v1'

export function ReviewPanel({ selected, flowScreens, allScreens, frame, focus }: { selected: MapScreen | null; flowScreens: MapScreen[]; allScreens: MapScreen[]; frame: HTMLIFrameElement | null; focus: (screen: MapScreen) => void }) {
  const [comments, setComments] = useState<Feedback[]>([])
  const [scope, setScope] = useState('screen')
  const [statusFilter, setStatusFilter] = useState('all')
  const [opened, setOpened] = useState<string | null>(new URLSearchParams(location.search).get('feedback'))
  const [draft, setDraft] = useState<NoteDraft | null>(() => { try { return JSON.parse(localStorage.getItem(noteKey) ?? 'null') } catch { return null } })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [resolution, setResolution] = useState('')
  const [discard, setDiscard] = useState(false)
  const linkedReview = useRef(new URLSearchParams(location.search).get('feedback'))
  const refresh = () => reviewApi<Feedback[]>('feedback').then(setComments)
  useEffect(() => { refresh().catch((error) => setError(error.message)) }, [])
  useEffect(() => {
    try { if (draft) localStorage.setItem(noteKey, JSON.stringify(draft)); else localStorage.removeItem(noteKey) }
    catch { setError('Your unsent review could not be retained after reload. Keep this tab open until it saves.') }
  }, [draft])
  useEffect(() => {
    if (!draft) return
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [draft])
  const current = comments.find((comment) => comment.id === opened)
  const targetOf = (comment: Feedback) => allScreens.find((screen) => feedbackOnScreen(comment, screen))
  useEffect(() => {
    const linked = comments.find((comment) => comment.id === linkedReview.current)
    const target = linked && targetOf(linked)
    if (target) { linkedReview.current = null; focus(target) }
  }, [comments, allScreens])
  const begin = () => {
    if (!selected || !frame) return
    setError(''); setStatus('')
    try {
      const doc = frame.contentDocument, bridge = frame.contentWindow?.reviewPreview
      if (!doc || !bridge || !doc.querySelector('[role="dialog"],h1')) throw Error('The live screen is still loading. Wait and retry.')
      const runtime = frame.contentWindow?.towelJourney?.state()
      const capture: Capture = { requestId: crypto.randomUUID(), html: captureScreen(doc), snapshot: bridge.snapshot, anchor: { label: 'Whole screen', x: 0, y: 0, width: 1, height: 1 }, context: { ...bridge.config, scenario: selected.scenario, screen: selected.id, condition: doc.documentElement.dataset.reviewCondition as ReviewConfig['condition'] ?? bridge.config.condition, viewport: { width: 393, height: 852 }, state: { dialogs: [runtime?.title ?? selected.label], tabs: [], fields: runtime?.fields ?? readFixtureFields(doc) } } }
      setDraft({ message: '', kind: 'confusing', capture }); setOpened(null)
    } catch (caught) { setError((caught as Error).message) }
  }
  const submit = async () => {
    if (!draft?.message.trim() || pending) return
    setPending(true); setError('')
    try {
      const saved = await reviewApi<Feedback>('feedback', { ...draft.capture, message: draft.message.trim(), kind: draft.kind })
      setComments((rows) => [...rows.filter((row) => row.id !== saved.id), saved]); setOpened(saved.id); setDraft(null); setStatus('Review saved with its frozen screen and inputs.')
    } catch (caught) { setError((caught as Error).message) }
    finally { setPending(false) }
  }
  const filtered = comments.filter((comment) => (statusFilter === 'all' || (comment.status === 'resolved') === (statusFilter === 'resolved')) && (scope === 'all' || (scope === 'flow' ? flowScreens : selected ? [selected] : []).some((screen) => feedbackOnScreen(comment, screen))))
  const choose = (comment: Feedback) => { setOpened(comment.id); setResolution(''); const target = targetOf(comment); if (target) focus(target) }
  return <div className="rh-review-panel">
    <div className="rh-review-filters"><label>Show reviews<select value={scope} onChange={(e) => setScope(e.target.value)}><option value="screen">Selected screen</option><option value="flow">Selected flow</option><option value="all">All reviews</option></select></label><label>Status<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="resolved">Resolved</option></select></label></div>
    <button onClick={() => void refresh().catch((error) => setError(error.message))}>Refresh reviews</button>
    {error && <p role="alert" className="rh-alert">{error}</p>}<p role="status">{status}</p>
    {draft ? <form onSubmit={(event) => { event.preventDefault(); void submit() }}><h3>New review</h3><p className="rh-muted">Frozen {draft.capture.context.screen} · source {draft.capture.snapshot.revision.source.slice(0, 12)}. Navigation keeps this capture.</p><label>Kind<select value={draft.kind} disabled={pending} onChange={(e) => setDraft({ ...draft, kind: e.target.value as FeedbackKind })}>{Object.entries(feedbackText.kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>What should change?<textarea maxLength={4000} value={draft.message} disabled={pending} onChange={(e) => setDraft({ ...draft, message: e.target.value })} /></label><button type="submit" className="rh-primary" disabled={pending || !draft.message.trim()}>{pending ? 'Capturing and saving…' : 'Save review'}</button><button type="button" disabled={pending} onClick={() => setDiscard(true)}>Discard review…</button>{discard && <div className="rh-alert"><p>Discard this unsent review and its capture?</p><button type="button" onClick={() => { setDiscard(false); setDraft(null) }}>Discard review</button><button type="button" onClick={() => setDiscard(false)}>Keep writing</button></div>}</form> : <><button onClick={begin} disabled={!frame || !selected}>Capture screen & write review</button>{!frame && <p className="rh-muted">Play the selected screen to capture a review. Your existing run is kept while browsing.</p>}</>}
    <ul className="rh-review-list">{filtered.map((comment) => <li key={comment.id}><button aria-pressed={opened === comment.id} onClick={() => choose(comment)}><strong>{comment.message}</strong><small>{comment.status === 'resolved' ? 'Resolved' : 'Open'} · {targetOf(comment)?.label ?? comment.context.scenario}</small></button></li>)}</ul>
    {!filtered.length && <p className="rh-muted">No reviews in this selection.</p>}
    {current && <section className="rh-review-evidence"><div className="rh-inspector-title"><h3>Captured review</h3><button onClick={() => setOpened(null)}>Close review</button></div><p>{current.message}</p><p className="rh-muted">{current.context.screen ?? current.context.scenario} · {current.status === 'resolved' ? 'Resolved' : 'Open'} · source {current.revision.source.slice(0, 12)}</p>{current.sourceStale && <p className="rh-alert">This capture came from an earlier source.</p>}<div className="rh-review-image"><img src={current.screenshot} alt={`Frozen screen: ${current.anchor.label}`} /><div className="review-pin" style={{ left: `${current.anchor.x * 100}%`, top: `${current.anchor.y * 100}%`, width: `${current.anchor.width * 100}%`, height: `${current.anchor.height * 100}%` }} /></div><button disabled={!targetOf(current)} onClick={() => { const target = targetOf(current); if (target) focus(target) }}>Focus screen on canvas</button><p className="rh-muted">Focus preserves your run. This image and its inputs are historical evidence; the fixture does not replay them.</p><details><summary>Captured inputs ({current.context.state.fields.length})</summary><dl className="rh-fields">{current.context.state.fields.map((field, i) => <div key={i}><dt>{field.label}</dt><dd>{field.value || '(empty)'}</dd></div>)}</dl></details><p className="rh-muted">{current.context.persona} · {current.context.role} · {current.context.condition} · {current.context.viewport.width}px · {current.context.theme}</p>{current.resolution ? <p>Resolution evidence: {current.resolution.evidence}</p> : <form onSubmit={(event) => { event.preventDefault(); setPending(true); setError(''); void reviewApi<Feedback>(`feedback/${current.id}/resolve`, { evidence: resolution.trim() }).then((saved) => { setComments((rows) => rows.map((row) => row.id === saved.id ? saved : row)); setResolution(''); setStatus('Review resolved with evidence.') }).catch((error) => setError(error.message)).finally(() => setPending(false)) }}><label>Resolution evidence<input value={resolution} maxLength={2000} disabled={pending} onChange={(e) => setResolution(e.target.value)} placeholder="Passing check or correction receipt" /></label><button disabled={pending || !resolution.trim()}>Resolve with evidence</button></form>}</section>}
    <a href="/api/review/feedback" target="_blank" rel="noreferrer">Agent-readable feedback</a>
  </div>
}
