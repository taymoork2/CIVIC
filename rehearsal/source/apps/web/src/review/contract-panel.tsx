import { useEffect, useState } from 'react'
import type { MapScreen } from './app-map'
import { reviewApi } from './canvas'
import { alignment, contractDimensions, coverage, type ScenarioEvidence } from './contract'
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
    {open.length > 0 && <button onClick={openReviewPane}>Open {open.length} review{open.length === 1 ? '' : 's'}</button>}
    <p className="rh-muted">Approved adaptations, accepted limitations and adoption need recorded decisions, which this build does not store yet.</p>
  </div>
}
