import { useState } from 'react'

export type Discovery = { id: string; sourceHash: string; scanned: number; truncated: boolean; limits: string[]; candidates: { id: string; file: string; export: string; label: string; kind: string; available: boolean; reason: string; captureFields: string[] }[]; edges: Edge[]; unmapped: { from: string; href: string; action: string }[] }
type Edge = { from: string; to: string; action: string; when?: string; returnTo?: string }
export function DiscoverySetup({ discovery, name, setName, busy, back, generate, inventory }: { discovery: Discovery; name: string; setName: (name: string) => void; busy: boolean; back: () => void; generate: (input: unknown) => Promise<void>; inventory: () => void }) {
  const [selected, setSelected] = useState(() => discovery.candidates.filter((row) => row.available).map((row) => row.id))
  const [journey, setJourney] = useState('Discovered journey')
  const [edges, setEdges] = useState(discovery.edges)
  const [overrides, setOverrides] = useState<Record<string, { label: string; captureFields: string[]; props: string }>>({})
  const [error, setError] = useState('')
  const change = (id: string, patch: Partial<{ label: string; captureFields: string[]; props: string }>) => {
    const row = discovery.candidates.find((row) => row.id === id)!
    setOverrides((prior) => ({ ...prior, [id]: { ...(prior[id] ?? { label: row.label, captureFields: row.captureFields, props: '{}' }), ...patch } }))
  }
  const submit = async () => {
    setError('')
    try {
      const values = Object.fromEntries(Object.entries(overrides).filter(([id]) => selected.includes(id)).map(([id, value]) => [id, { ...value, props: JSON.parse(value.props) }]))
      await generate({ discovery: discovery.id, sourceHash: discovery.sourceHash, selected, journey, overrides: values, edges: edges.filter((edge) => selected.includes(edge.from) && selected.includes(edge.to)) })
    } catch (error) { setError((error as Error).message) }
  }
  const label = (id: string) => overrides[id]?.label ?? discovery.candidates.find((row) => row.id === id)?.label ?? id
  const options = selected.map((id) => <option key={id} value={id}>{label(id)}</option>)
  const ordered = [...discovery.candidates].sort((a, b) => (selected.includes(a.id) ? selected.indexOf(a.id) : selected.length) - (selected.includes(b.id) ? selected.indexOf(b.id) : selected.length))
  return <section className="rh-discovery">
    <h3>Choose screens and paths</h3><p className="rh-project-copy">Found {discovery.candidates.length} candidates in {discovery.scanned} files{discovery.truncated ? ' · scan limit reached' : ''}. Confirm an isolated preview, then generate its registry and adapter here.</p>
    {error && <p role="alert" className="rh-project-error">{error}</p>}
    <label>Project name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></label>
    <label>Journey name<input value={journey} onChange={(event) => setJourney(event.target.value)} maxLength={120} /></label>
    {discovery.candidates.length ? <ul className="rh-discovery-screens">{ordered.map((row) => <li key={row.id}>
      <label className="rh-discovery-select"><input type="checkbox" aria-label={`Include ${row.label}`} checked={selected.includes(row.id)} disabled={busy || !row.available} onChange={(event) => setSelected((prior) => event.target.checked ? [...prior, row.id] : prior.filter((id) => id !== row.id))} /><span><strong>{label(row.id)}</strong><small>{row.file}{row.export ? ` · ${row.export}` : ''}</small></span></label>
      <p>{row.reason}</p>
      {row.available && selected.includes(row.id) && <details><summary>Screen setup</summary><label>Screen name<input aria-label={`Name for ${row.label}`} value={overrides[row.id]?.label ?? row.label} maxLength={160} onChange={(event) => change(row.id, { label: event.target.value })} /></label><label>Capture field labels<input aria-label={`Capture fields for ${row.label}`} value={(overrides[row.id]?.captureFields ?? row.captureFields).join(', ')} onChange={(event) => change(row.id, { captureFields: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /><small>Use accessible labels. Passwords, files and hidden fields are excluded.</small></label>{row.kind === 'react' && <label>Synthetic preview props<textarea aria-label={`Preview props for ${row.label}`} value={overrides[row.id]?.props ?? '{}'} onChange={(event) => change(row.id, { props: event.target.value })} spellCheck={false} /><small>A JSON object passed to the real component. Missing providers or dependencies fail visibly in Play.</small></label>}<div className="rh-discovery-order"><button disabled={busy || selected.indexOf(row.id) === 0} onClick={() => setSelected((prior) => { const next = [...prior], at = next.indexOf(row.id); [next[at - 1], next[at]] = [next[at]!, next[at - 1]!]; return next })}>Move earlier</button><span>Step {selected.indexOf(row.id) + 1}</span></div></details>}
    </li>)}</ul> : <p>No isolated screens were found. Choose another source folder, or keep an inventory connection.</p>}
    <h3>Paths</h3><p className="rh-project-copy">Local links and form destinations are candidates. Add or edit actions to describe branches and returns. Conditions are notes; the preview uses native form validation and synthetic navigation.</p>
    {edges.map((edge, index) => <fieldset key={index} className="rh-discovery-edge"><legend>Path {index + 1}</legend><div><label>From<select aria-label={`Path ${index + 1} from`} value={edge.from} onChange={(event) => setEdges((prior) => prior.map((row, at) => at === index ? { ...row, from: event.target.value } : row))}>{options}</select></label><label>To<select aria-label={`Path ${index + 1} to`} value={edge.to} onChange={(event) => setEdges((prior) => prior.map((row, at) => at === index ? { ...row, to: event.target.value } : row))}>{options}</select></label></div><label>Action label<input aria-label={`Path ${index + 1} action`} value={edge.action} maxLength={160} onChange={(event) => setEdges((prior) => prior.map((row, at) => at === index ? { ...row, action: event.target.value } : row))} /></label><details><summary>Condition and return</summary><label>Condition<input value={edge.when ?? ''} maxLength={1000} onChange={(event) => setEdges((prior) => prior.map((row, at) => at === index ? { ...row, when: event.target.value } : row))} /></label><label>Return context<input value={edge.returnTo ?? ''} maxLength={1000} onChange={(event) => setEdges((prior) => prior.map((row, at) => at === index ? { ...row, returnTo: event.target.value } : row))} /></label></details><button disabled={busy} onClick={() => setEdges((prior) => prior.filter((_row, at) => at !== index))}>Remove path</button></fieldset>)}
    <button disabled={busy || selected.length < 2} onClick={() => setEdges((prior) => [...prior, { from: selected[0]!, to: selected[1]!, action: '', when: '', returnTo: '' }])}>Add path</button>
    {discovery.unmapped.length > 0 && <details className="rh-discovery-unmapped"><summary>{discovery.unmapped.length} unresolved destinations</summary><ul>{discovery.unmapped.map((link, index) => <li key={index}>{label(link.from)}: {link.action} → {link.href}</li>)}</ul></details>}
    <p className="rh-project-copy">Generated files belong to Rehearsal. Source code and local input state are used in isolation; app scripts, auth and production writes are not connected.</p>
    <div className="rh-project-actions"><button onClick={back} disabled={busy}>Back</button><button onClick={inventory} disabled={busy}>Keep inventory only</button><button className="rh-primary" onClick={() => void submit()} disabled={busy || !selected.length || !name.trim()}>{busy ? 'Generating…' : 'Generate preview'}</button></div>
  </section>
}
