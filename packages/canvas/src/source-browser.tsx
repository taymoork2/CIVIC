import { Button } from '@civic/shell/ui/button'
import { Input } from '@civic/shell/ui/input'
import { useEffect, useState, type FormEvent } from 'react'
import { projectFetch } from './project-request'
import { HistoryList, HistoryMeta, type VersionHistory } from './version-history'
import { GitBranch, GitPullRequest, Pencil } from '@civic/shell/icons'

type Source = { id: string; type: string; title: string; detail: string; path?: string; source?: string; url?: string; revision?: string; connected?: boolean; history?: VersionHistory }
type Sources = { items: Source[]; total: number; offset: number; limit: number; hasMore: boolean; hiddenInactive: number; providers: { name: string; status: string; message: string }[] }
async function request(input: unknown, signal?: AbortSignal) {
  const response = await projectFetch('/api/review/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal })
  const result = await response.json()
  if (!response.ok) throw Error(result.error ?? 'Source discovery unavailable')
  return result
}
const typeLabel = (type: string) => ({ worktree: 'Worktree', branch: 'Branch', 'pull-request': 'Pull request', design: 'Design snapshot', figma: 'Figma' })[type] ?? 'Source'

export function SourceBrowser({ connect }: { connect: (source: Source) => void }) {
  const [data, setData] = useState<Sources | null>(null)
  const [query, setQuery] = useState(''), [inactive, setInactive] = useState(false), [offset, setOffset] = useState(0)
  const [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [linking, setLinking] = useState(false), [url, setURL] = useState(''), [saving, setSaving] = useState(false)
  const sourceItems = data?.items.filter(row => !(row.type === 'pull-request' && row.history?.key && data.items.some(other => ['worktree', 'branch'].includes(other.type) && other.history?.key === row.history?.key))) ?? []
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    const timer = setTimeout(() => {
      void request({ action: 'source-versions', query, inactive, offset }, controller.signal).then(setData).catch(error => { if (!controller.signal.aborted) { setData(null); setError(error.message) } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, inactive, offset, refresh])
  const link = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try { await request({ action: 'link-figma', url }); setURL(''); setLinking(false); setOffset(0); setRefresh(value => value + 1) }
    catch (error) { setError((error as Error).message) }
    finally { setSaving(false) }
  }
  return <section className="rh-source-browser" aria-label="Project sources">
    <p>Discover active work from this app’s repositories and linked designs. Existing reviews are kept.</p>
    <label>Search sources<Input type="search" aria-label="Search sources" maxLength={120} value={query} onChange={event => { setQuery(event.target.value); setOffset(0) }} placeholder="Branch, PR, worktree or design…" /></label>
    <div className="rh-source-controls"><label><input type="checkbox" checked={inactive} onChange={event => { setInactive(event.target.checked); setOffset(0) }} />Include inactive work</label><Button variant="outline" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</Button></div>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Checking sources…</p> : data && <>
      <p role="status">{data.total ? `${data.offset + 1}–${Math.min(data.offset + 10, data.total)} of ${data.total} sources` : 'No matching sources.'}{!inactive && data.hiddenInactive > 0 && ` · ${data.hiddenInactive} inactive hidden`}</p>
      <HistoryList className="rh-source-results" items={sourceItems.map(row => ({ id: row.id, label: row.title, history: row.history, marker: row.type === 'pull-request' ? <GitPullRequest /> : ['figma', 'design'].includes(row.type) ? <Pencil /> : <GitBranch />, content: <>
        <small data-history-anchor>{typeLabel(row.type)}{row.connected ? ' · Preview connected' : ''}</small>
        <strong>{row.title}</strong><span>{row.detail}</span>
        <HistoryMeta history={row.history} />
        {row.type !== 'pull-request' && row.history?.key && data.items.filter(pr => pr.type === 'pull-request' && pr.history?.key === row.history?.key).map(pr => <div key={pr.id} className="civic-history-pr"><a href={pr.url} target="_blank" rel="noreferrer">{pr.title} ↗</a><HistoryMeta history={pr.history} /></div>)}
        {row.revision && <small>Revision {row.revision.slice(0, 8)}</small>}
        {row.path && <details><summary>Folder</summary><code>{row.path}</code></details>}
        <div>{row.path && !row.connected && <Button variant="outline" onClick={() => connect(row)}>Connect preview</Button>}{row.url && <a href={row.url} target="_blank" rel="noreferrer">{row.type === 'figma' ? 'Open in Figma' : 'Open on GitHub'} ↗</a>}</div>
      </> }))} />
      {(data.offset > 0 || data.hasMore) && <nav aria-label="Source pages"><Button variant="outline" disabled={data.offset === 0} onClick={() => setOffset(value => Math.max(0, value - 10))}>Previous</Button><Button variant="outline" disabled={!data.hasMore} onClick={() => setOffset(value => value + 10)}>Next 10</Button></nav>}
      <ul className="rh-source-status">{data.providers.map((provider, index) => <li key={index}><strong>{provider.name}</strong> · {provider.message}</li>)}</ul>
    </>}
    {linking ? <form onSubmit={event => void link(event)}><label>Figma file link<Input type="url" aria-label="Figma file link" value={url} onChange={event => setURL(event.target.value)} required placeholder="https://www.figma.com/design/…" /></label><div className="rh-project-actions"><Button variant="outline" type="button" onClick={() => setLinking(false)} disabled={saving}>Cancel</Button><Button variant="outline" type="submit" disabled={saving}>{saving ? 'Linking…' : 'Link file'}</Button></div></form> : <Button variant="outline" onClick={() => setLinking(true)}>Link Figma file</Button>}
  </section>
}
