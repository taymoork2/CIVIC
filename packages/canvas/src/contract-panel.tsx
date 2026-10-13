import { useEffect, useState } from 'react'
import type { MapScreen } from './app-map'
import { reviewApi } from './review-api'
import { alignment, contractDimensions, coverage, type ScenarioEvidence } from '@civic/shell/contract'
import { feedbackOnScreen, type Feedback } from './review-panel'

const owners = ['Design', 'Engineering', 'QA'] as const
const toneLabel = { proven: 'Proven', partial: 'Partial', missing: 'Missing' }

/** Three-way Product Contract for the selected screen, or portfolio confidence when nothing is selected. */
export function ContractPanel({ selected, scenarios, openReviewPane }: { selected: MapScreen | null; scenarios: ScenarioEvidence[]; openReviewPane: () => void }) {
  const [reviews, setReviews] = useState<Feedback[]>([])
  const [error, setError] = useState('')
  useEffect(() => { reviewApi<Feedback[]>('feedback').then(setReviews).catch((caught) => setError((caught as Error).message)) }, [selected?.id])
  if (!selected) return <div className="rh-contract">
    <p>Registered screens with each contract dimension proven. Nothing here is inferred from screenshots or fixture jumps.</p>
    <ul className="rh-contract-rows">{coverage(scenarios).map((row) => <li key={row.label}><span>{row.label}<small>{row.owner}</small></span><meter min={0} max={row.total || 1} value={row.proven} aria-label={`${row.label}: ${row.proven} of ${row.total} proven`} /><small>{row.proven}/{row.total} proven{row.partial ? ` · ${row.partial} partial` : ''}</small></li>)}</ul>
    <p className="rh-muted">Select a screen to see its contract.</p>
  </div>
  const scenario = scenarios.find((entry) => entry.id === selected.scenario)
  if (!scenario) return <p className="rh-muted">This screen has no registered scenario evidence.</p>
  const dimensions = contractDimensions(scenario)
  const open = reviews.filter((review) => review.status !== 'resolved' && feedbackOnScreen(review, selected))
  const state = alignment(dimensions, open.length)
  return <div className="rh-contract">
    <p className={`rh-alignment is-${state === 'Aligned' ? 'aligned' : state === 'Unreviewed drift' ? 'drift' : 'unknown'}`}><strong>{state}</strong>{state === 'Unreviewed drift' ? `${open.length} open review${open.length === 1 ? '' : 's'} without a decision.` : state === 'Aligned' ? 'Every dimension has current evidence.' : 'Missing or stale evidence prevents an alignment judgment.'}</p>
    {error && <p role="alert" className="rh-alert">{error}</p>}
    {owners.map((owner) => <section key={owner} aria-label={`${owner} evidence`}><h3>{owner}</h3><dl className="rh-fields">{dimensions.filter((dimension) => dimension.owner === owner).map((dimension) => <div key={dimension.label}><dt>{dimension.label}</dt><dd><span className={`rh-tone is-${dimension.tone}`}>{toneLabel[dimension.tone]}</span> {['missing', 'unverified', 'present'].includes(dimension.value) ? '' : dimension.value}</dd></div>)}</dl></section>)}
    <CivicGraph scenario={selected.scenario} />
    {open.length > 0 && <button onClick={openReviewPane}>Open {open.length} review{open.length === 1 ? '' : 's'}</button>}
    <p className="rh-muted">Approved adaptations, accepted limitations and adoption need recorded decisions, which this build does not store yet.</p>
  </div>
}

interface ScreenFacts {
  graph: string
  journeys: { id: string; title: string }[]
  paths: { action?: string; toTitle?: string; unmapped?: string; status: string; counts: boolean }[]
  evidence: { id: string; title: string; outcome: 'pass' | 'fail' | 'finding'; finding?: string; source: { revision: string }; stale?: string }[]
  findings: { key: string; kind: string; summary: string; baselined: boolean; blocks: boolean }[]
  /** Older CIVIC builds send no design frames. */
  design?: { file: string; tool: string; name: string; version: string; frames: { node: string; name: string }[] }[]
}

/** What CIVIC's graph says about this screen: run evidence, the design frames beside it and the gate's findings (decision 0004). */
function CivicGraph({ scenario }: { scenario: string }) {
  const [state, setState] = useState<{ scenario: string; facts?: ScreenFacts | null; error?: string } | null>(null)
  useEffect(() => {
    let current = true
    reviewApi<{ facts: ScreenFacts | null }>(`civic-screen?scenario=${encodeURIComponent(scenario)}`)
      .then(({ facts }) => { if (current) setState({ scenario, facts }) })
      .catch((caught) => { if (current) setState({ scenario, error: (caught as Error).message }) })
    return () => { current = false }
  }, [scenario])
  if (!state || state.scenario !== scenario) return <section aria-label="CIVIC graph"><h3>CIVIC graph</h3><p className="rh-muted">Loading…</p></section>
  if (state.error) return <section aria-label="CIVIC graph"><h3>CIVIC graph</h3><p className="rh-muted">{state.error}</p></section>
  const facts = state.facts
  if (!facts) return <section aria-label="CIVIC graph"><h3>CIVIC graph</h3><p className="rh-muted">This screen isn't in a CIVIC graph yet.</p></section>
  const failing = facts.evidence.filter((item) => item.outcome === 'fail')
  const passing = facts.evidence.filter((item) => item.outcome === 'pass')
  const revisions = [...new Set(facts.evidence.map((item) => item.source.revision.slice(0, 12)))]
  const stale = [...new Set(facts.evidence.flatMap((item) => item.stale ? [item.stale] : []))]
  return <section aria-label="CIVIC graph"><h3>CIVIC graph</h3>
    <dl className="rh-fields">
      <div><dt>Run evidence</dt><dd>{facts.evidence.length === 0 ? <span className="rh-tone is-missing">Missing</span> : <><span className={`rh-tone ${failing.length ? 'is-failing' : 'is-proven'}`}>{failing.length ? 'Failing' : 'Passing'}</span>{passing.length} passed, {failing.length} failed{revisions.length ? ` at ${revisions.join(', ')}` : ''}{stale.length > 0 && <small>Stale: {stale.join('; ')}. Recapture before relying on it.</small>}</>}</dd></div>
      <div><dt>Design</dt><dd>{!facts.design?.length ? 'No design frame names this screen' : facts.design.map((item) => `${item.frames.length} frame${item.frames.length === 1 ? '' : 's'} in ${item.name} (${item.tool}, ${item.version.slice(0, 10)})`).join('; ')}{facts.design?.length ? <small>Design intent, shown beside the runs and never counted as evidence.</small> : null}</dd></div>
      <div><dt>Paths on</dt><dd>{facts.paths.length === 0 ? 'None declared' : facts.paths.map((path) => `${path.action ?? 'Path'} → ${path.toTitle ?? path.unmapped}${path.counts ? '' : ` (${path.status})`}`).join('; ')}</dd></div>
    </dl>
    {facts.design?.some((item) => item.frames.length > 0) && <ul className="rh-civic-list" aria-label="Design frames">{facts.design.flatMap((item) => item.frames.map((frame) => <li key={`${item.file}:${frame.node}`}>{frame.name}</li>))}</ul>}
    {failing.length > 0 && <ul className="rh-civic-list" aria-label="Failing tests">{failing.map((item) => <li key={item.id}>{item.title}{item.finding ? <small>{item.finding}</small> : null}</li>)}</ul>}
    {facts.findings.length > 0 && <ul className="rh-civic-list" aria-label="Gate findings">{facts.findings.map((item) => <li key={item.key}><strong>{item.kind}</strong> {item.summary}<small>{item.baselined ? 'Held by the baseline: known, not blocking.' : item.blocks ? 'New: blocks civic check.' : 'Advisory: reported, not blocking.'}</small></li>)}</ul>}
    <p className="rh-muted">From {facts.graph}.</p>
  </section>
}
