import { Disclosure } from '@civic/shell/ui/disclosure'
export type VersionChange = {
  id: string
  status: 'same' | 'changed' | 'unavailable'
  summary: string
  states: { added: string[]; removed: string[] }
  actions: { added: string[]; removed: string[] }
  text: { added: string[]; removed: string[]; totalAdded?: number; totalRemoved?: number }
  fixtureChanged: boolean
  stylesChanged: boolean
  eventsChanged: boolean
  totalChanges: number
  changes: { file: string; name: string; kind: string; change: string; before: string; after: string; truncated: boolean }[]
  limits: string[]
  basis: string
}

export function VersionChanges({ change, scope }: { change?: VersionChange; scope: string }) {
  if (!change) return <p role="status">Comparing this {scope} with the current preview…</p>
  const groups = [
    { name: 'Text added', items: change.text.added }, { name: 'Text removed', items: change.text.removed },
    { name: 'State added', items: change.states.added }, { name: 'State removed', items: change.states.removed },
    { name: 'Action added', items: change.actions.added }, { name: 'Action removed', items: change.actions.removed },
  ]
  return <section className="civic-version-changes" aria-label={`Changes to ${scope}`}>
    <p>Changes to <strong>{scope}</strong> from the current version.</p>
    {change.status === 'same' && <p>The selected export, local dependencies and registered states match.</p>}
    {groups.some(group => group.items.length) && <ul>{groups.flatMap(group => group.items.map(item => <li key={`${group.name}:${item}`}><strong>{group.name}:</strong> {item}</li>))}</ul>}
    {(change.text.totalAdded ?? 0) > change.text.added.length && <p>Showing {change.text.added.length} of {change.text.totalAdded} added text labels.</p>}
    {(change.text.totalRemoved ?? 0) > change.text.removed.length && <p>Showing {change.text.removed.length} of {change.text.totalRemoved} removed text labels.</p>}
    {change.stylesChanged && <p>Layout or styling code changed.</p>}
    {change.eventsChanged && <p>Interaction-handler code changed.</p>}
    {change.fixtureChanged && <p>Preview inputs or route changed.</p>}
    {change.changes.length > 0 && <Disclosure className="civic-source-changes" title={<>Source changes · {change.totalChanges}</>}>
      {change.totalChanges > change.changes.length && <p>Showing {change.changes.length} of {change.totalChanges} changed source units.</p>}
      {change.changes.map(item => <Disclosure key={`${item.file}#${item.name}`} title={<>{item.name} · {item.change}</>}><p className="civic-source-path">{item.file}{item.truncated ? ' · excerpt' : ''}</p><p>Current</p><pre tabIndex={0} aria-label={`Current source for ${item.name}`}><code>{item.before || 'Not present'}</code></pre><p>This version</p><pre tabIndex={0} aria-label={`Candidate source for ${item.name}`}><code>{item.after || 'Not present'}</code></pre></Disclosure>)}
    </Disclosure>}
    {change.limits.map(limit => <p key={limit} role="status">{limit}</p>)}
    <p className="civic-change-basis">{change.basis}</p>
  </section>
}
