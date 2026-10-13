import { useEffect, useState } from 'react'
import { reviewApi } from './review-api'
import type { Feedback } from './review-panel'

type Destination = { id: string; label: string; provider: 'codex' | 'claude'; sessionId: string; cwd: string; host: string }
export type Delivery = { id: string; destination: Destination; status: 'pending' | 'accepted' | 'completed' | 'failed' | 'unknown'; detail: string; turnId?: string; result?: string; replyTo?: string; message?: string; acceptedAt?: number }

export function AgentDelivery({ review, saved }: { review: Feedback; saved: (review: Feedback) => void }) {
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [selection, setSelection] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [reply, setReply] = useState('')
  const load = () => reviewApi<Destination[]>('agents').then(setDestinations).catch((error) => setError(error.message))
  useEffect(() => { void load() }, [])
  const active = review.deliveries?.some((delivery) => ['pending', 'accepted'].includes(delivery.status))
  useEffect(() => {
    if (!active) return
    let alive = true
    const timer = setInterval(() => {
      void reviewApi<Feedback[]>('feedback').then((rows) => { const row = rows.find((row) => row.id === review.id); if (alive && row) saved(row) }).catch((error) => { if (alive) setError(error.message) })
    }, 2000)
    return () => { alive = false; clearInterval(timer) }
  }, [active, review.id])
  const destination = destinations.find((target) => target.id === selection)
  const blocked = review.status === 'resolved' || review.deliveries?.some((delivery) => delivery.status !== 'failed' || delivery.acceptedAt)
  const latest = review.deliveries?.at(-1)
  const send = async (destination: string, followup?: Delivery) => {
    setPending(true); setError('')
    try {
      saved(await reviewApi<Feedback>(`feedback/${review.id}/send`, { requestId: crypto.randomUUID(), destination, ...(followup ? { replyTo: followup.id, message: reply.trim() } : {}) }))
      setReply('')
    } catch (error) {
      setError((error as Error).message)
      // A lost HTTP response may follow a successful send. Recover its receipt before another attempt.
      try { const rows = await reviewApi<Feedback[]>('feedback'); const row = rows.find((row) => row.id === review.id); if (row) saved(row) } catch { setError('Could not check delivery. Reload this review before sending again.') }
    } finally { setPending(false) }
  }
  return <section className="rh-agent-delivery" aria-label="Send saved review to an agent">
    <h4>Send to agent</h4>
    <label>Agent destination<select value={selection} disabled={pending || blocked} onChange={(event) => setSelection(event.target.value)}><option value="">Choose a destination…</option>{destinations.map((target) => <option key={target.id} value={target.id}>{target.label} · {target.provider} · {target.host}</option>)}</select></label>
    {destination && <><p className="rh-muted">{destination.cwd}<br />Session: {destination.sessionId}</p><p className="rh-muted">{destination.provider === 'codex' ? 'Append to this Codex thread through its configured app server. Busy threads are refused.' : 'Resume this idle Claude Code session. Running sessions are refused; unattended permission prompts are denied.'} Sending can start agent work and use its account quota.</p></>}
    {!destinations.length && <p className="rh-muted">No destinations configured. Add this machine or an SSH host and its session to .review-data/agents.json. Reload destinations after setup.</p>}
    <button type="button" onClick={() => { setError(''); void load() }} disabled={pending}>Reload destinations</button>
    <button type="button" className="rh-primary" disabled={!destination || pending || blocked} onClick={() => {
      if (!destination || pending) return
      void send(destination.id)
    }}>{pending ? 'Saving dispatch…' : 'Send saved review'}</button>
    {error && <p role="alert" className="rh-alert">{error}</p>}
    {review.deliveries?.map((delivery) => <div key={delivery.id} role="status"><strong>{delivery.status} · {delivery.destination.label}</strong>{delivery.message && <p>You: {delivery.message}</p>}<p>{delivery.detail}</p><small>Session {delivery.destination.sessionId}{delivery.turnId ? ` · Turn ${delivery.turnId}` : ''}</small>{delivery.result && <details open><summary>Agent reply</summary><p style={{ whiteSpace: 'pre-wrap' }}>{delivery.result}</p></details>}</div>)}
    {latest && (latest.status === 'completed' || latest.status === 'failed' && (latest.acceptedAt || latest.replyTo)) && review.status !== 'resolved' && <form onSubmit={(event) => { event.preventDefault(); if (reply.trim() && !pending) void send(latest.destination.id, latest) }}><label>Reply to agent<textarea value={reply} maxLength={4000} disabled={pending} onChange={(event) => setReply(event.target.value)} placeholder="Clarify the request or ask for verification evidence" /></label><button type="submit" disabled={pending || !reply.trim()}>Send follow-up</button><p className="rh-muted">Continues {latest.destination.label} in the same session with this review’s evidence.</p></form>}
    {!!review.deliveries?.length && <p className="rh-muted">Delivery does not resolve this review. Check the correction and attach evidence below.</p>}
  </section>
}
