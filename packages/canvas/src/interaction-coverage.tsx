import { Button } from '@civic/shell/ui/button'
import { Input } from '@civic/shell/ui/input'
import { NativeSelect } from '@civic/shell/ui/native-select'
import { useMemo, useState } from 'react'
import type { InteractionControl, InteractionState } from './runtime-dom'
import { projectFetch } from './project-request'

type Control = InteractionControl & { declared: boolean; execution: string; verified: boolean; gaps: string[]; evidence: { run: string; step: number; to: string; failed: boolean; verified: boolean }[] }
type State = Omit<InteractionState, 'controls'> & { id: string; label: string; declared: boolean; gaps: string[]; controls: Control[] }
export type InteractionReport = { states: State[]; unvisited: { id: string; label: string }[]; unseenPaths: { from: string; to: string; action: string }[]; stale: number; summary: { states: number; controls: number; missingScenarios: number; unrecorded: number; verified: number }; limits: string[]; behavior?: { at: string; checks: { title: string; outcome: string; assertions?: string[]; error?: string; run?: string }[] } | null; scan: { status: string; completed: number; total: number; current?: string; limited?: boolean; states?: number; actions?: number; errors: { scenario: string | null; message: string }[] } }
export type InteractionExpectation = { id: string; title: string; kind: string; scenarios: string[]; acceptance: string[]; state?: string; control?: { tag: string; name: string; index?: number } }

export function InteractionCoverage({ report, source, focus, expect }: { report: InteractionReport & { canVerify?: boolean }; source: string; focus: (id: string) => void; expect: (target: InteractionExpectation) => void }) {
  const [filter, setFilter] = useState('gaps'), [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const groups = useMemo(() => {
    const groups = new Map<string, { state: State; control: Control }[]>()
    for (const state of report.states) for (const control of state.controls) {
      const key = JSON.stringify([control.tag, control.role, control.name, control.destination])
      groups.set(key, [...(groups.get(key) ?? []), { state, control }])
    }
    return [...groups].sort((a, b) => (a[1][0]!.control.name || 'Unnamed control').localeCompare(b[1][0]!.control.name || 'Unnamed control'))
  }, [report.states])
  const scan = async (action = 'scan') => {
    setBusy(true); setMessage('')
    try {
      const response = await projectFetch('/api/review/interactions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, source }) })
      const result = await response.json()
      if (!response.ok) throw Error(result.error)
      setMessage('Discovery started. Results and progress update automatically.')
    } catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  const declare = (state: State, control?: Control) => expect({ id: `${control ? 'interaction' : 'state'}.${state.id.slice(0, 32)}${control ? '.' + state.controls.indexOf(control) : ''}`, title: `${state.label}${control ? ' · ' + (control.name || 'Unnamed control') : ' · observed state'}`.slice(0, 160), kind: control ? 'interaction' : 'screen', scenarios: [state.scenario], state: state.id, ...(control ? { control: { tag: control.tag, name: control.name, index: control.index } } : {}), acceptance: [control ? 'Describe the expected result, retained state and failure behavior for this control.' : 'Describe the conditions that produce this state and its expected behavior.'] })
  const matches = ({ control }: { control: Control }) => (filter === 'all' || filter === 'gaps' && control.gaps.length > 0 || filter === 'missing' && !control.declared || filter === 'unrecorded' && control.execution === 'unrecorded' || filter === 'verified' && control.verified) && (control.name || 'Unnamed control').toLowerCase().includes(query.toLowerCase())
  return <section className="rh-interaction-coverage" aria-label="Observed interaction coverage">
    <h3>Actual interactions</h3>
    <p>Discover controls from the running app, then compare their states with scenarios and saved execution evidence.</p>
    <div className="cv:flex cv:flex-wrap cv:gap-2"><Button variant="outline" disabled={busy || report.scan.status === 'running'} onClick={() => void scan()}>{report.scan.status === 'running' ? `Scanning ${report.scan.completed} / ${report.scan.total} · ${report.scan.current ?? ''}` : 'Scan registered screens'}</Button>
    <Button variant="outline" disabled={busy || report.scan.status === 'running'} onClick={() => void scan('explore')}>Explore menus and dialogs</Button>
    {report.canVerify && <Button variant="outline" disabled={busy || report.scan.status === 'running'} onClick={() => void scan('verify')}>Verify isolated write flows</Button>}</div>
    <p role="status">{report.scan.status === 'complete' ? `Scan finished · ${report.scan.completed} screens inspected` : report.scan.status === 'partial' || report.scan.status === 'failed' ? `Scan ${report.scan.status} · ${report.scan.completed} / ${report.scan.total} screens` : message}</p>
    {report.scan.errors.map((error, i) => <p key={i} role="alert">{error.scenario ?? 'Discovery'}: {error.message}</p>)}
    {report.scan.limited && <p role="status">Exploration reached its time, depth or state limit. Unreached branches remain coverage gaps.</p>}
    {report.scan.states !== undefined && <p>{report.scan.states} states explored · {report.scan.actions ?? 0} recorded actions</p>}
    {report.behavior && <section aria-label="Isolated behavior checks"><h4>Isolated behavior checks</h4>{report.behavior.checks.map((check, i) => <article key={i}><strong>{check.outcome} · {check.title}</strong>{check.assertions?.map(assertion => <p key={assertion}>{assertion}</p>)}{check.error && <p role="alert">{check.error}</p>}{check.run && <a href={`/api/review/runs/${check.run}`} target="_blank" rel="noreferrer">Execution recording</a>}</article>)}<small>Checked {report.behavior.at}. These assertions do not verify every control on the screen.</small></section>}
    <dl className="rh-interaction-totals"><div><dt>Observed states</dt><dd>{report.summary.states}</dd></div><div><dt>Controls across states</dt><dd>{report.summary.controls}</dd></div><div><dt>Missing interaction scenarios</dt><dd>{report.summary.missingScenarios}</dd></div><div><dt>Without recorded execution</dt><dd>{report.summary.unrecorded}</dd></div><div><dt>Passing replay evidence</dt><dd>{report.summary.verified}</dd></div></dl>
    <details><summary>State coverage · {report.states.filter(state => !state.declared).length} undeclared states</summary>
      {report.states.map(state => <article key={state.id}><strong>{state.label} · {state.viewport.width} × {state.viewport.height}</strong><small>{state.persona} / {state.role} / {state.condition} · {state.controls.length} controls{state.landmarks.length ? ` · ${state.landmarks.join(', ')}` : ''}</small><p>{state.gaps.join(' · ') || 'State expectation registered; execution evidence is checked per control.'}</p><Button variant="outline" onClick={() => focus(state.scenario)}>Show screen</Button> <Button variant="outline" onClick={() => declare(state)}>Draft state expectation</Button></article>)}
    </details>
    {report.unvisited.length > 0 && <details><summary>{report.unvisited.length} screens not observed</summary>{report.unvisited.map(row => <Button variant="ghost" className="cv:h-auto cv:block cv:whitespace-normal" key={row.id} onClick={() => focus(row.id)}>{row.label}</Button>)}</details>}
    {report.unseenPaths.length > 0 && <details><summary>{report.unseenPaths.length} declared paths not found in observed controls</summary><ul>{report.unseenPaths.map((row, index) => <li key={index}>{row.from} → {row.to}: {row.action}</li>)}</ul><p>These paths need inspection; absence from an observed state does not prove the path is broken.</p></details>}
    <label className="rh-search">Search observed interactions<Input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <label className="rh-search">Interaction coverage<NativeSelect className="cv:w-full" value={filter} onChange={event => setFilter(event.target.value)}><option value="gaps">All coverage gaps</option><option value="missing">Missing scenarios</option><option value="unrecorded">Not recorded</option><option value="verified">Passing replay evidence</option><option value="all">All observed interactions</option></NativeSelect></label>
    <p>{groups.length} interaction groups · repeated names and destinations share one group; each state keeps its own evidence.</p>
    {groups.filter(([, members]) => members.some(matches)).map(([key, members]) => <details key={key} className="rh-interaction-group"><summary>{members[0]!.control.name || 'Unnamed control'} <small>{members[0]!.control.role} · {members.length} occurrences · {members.filter(row => !row.control.declared).length} without scenario · {members.filter(row => row.control.execution === 'unrecorded').length} unrecorded</small></summary>
      {members.filter(matches).map(({ state, control }) => <article key={state.id + ':' + control.index}><strong>{state.label} · {state.viewport.width} × {state.viewport.height}</strong><small>{state.persona} / {state.role} / {state.condition} · control {control.index + 1} of {control.count}</small><p>{control.gaps.join(' · ') || 'Scenario registered and passing replay evidence available.'}</p><Button variant="outline" onClick={() => focus(state.scenario)}>Show screen</Button> <Button variant="outline" onClick={() => declare(state, control)}>Draft interaction expectation</Button>{control.evidence.map(row => <p key={`${row.run}:${row.step}`}><a href={`/api/review/runs/${row.run}`} target="_blank" rel="noreferrer">Recording · step {row.step}</a> · {row.failed ? 'operation failed' : row.verified ? 'replay passed' : 'observed execution; behavior unverified'}</p>)}</article>)}
    </details>)}
    {!report.states.length && <p>No runtime inventory yet. Scan the registered screens or open a live preview.</p>}
    {report.stale > 0 && <p>{report.stale} observations from older source revisions are excluded.</p>}
    <details><summary>Interaction discovery limits</summary>{report.limits.map(limit => <p key={limit}>{limit}</p>)}</details>
  </section>
}
