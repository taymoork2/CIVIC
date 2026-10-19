import { useEffect, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from 'react'
import project from 'virtual:civic-project'
import { projectFetch } from './project-request'
import { DiscoverySetup, type Discovery } from './discovery-setup'
import { Check, ChevronDown, GitBranch, Search, SearchX, FolderOpen, Settings2, Pencil, Monitor, Layers, X, SquareArrowOutUpRight } from '@civic/shell/icons'
import { Button } from '@civic/shell/ui/button'
import { IconButton } from '@civic/shell/ui/icon-button'
import { Input } from '@civic/shell/ui/input'
import { NativeSelect } from '@civic/shell/ui/native-select'
import { Dialog, DialogContent, DialogTitle } from '@civic/shell/ui/dialog'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@civic/shell/ui/empty'
import { Skeleton } from '@civic/shell/ui/skeleton'
import { Alert, AlertDescription } from '@civic/shell/ui/alert'
import { projectShortcut, projectWindowHref, preferredConnection, versionCaption, versionDetails, versionChoices, type AppVersion, type DraftScreen } from './project-choice'
import { SourceBrowser } from './source-browser'
import { VersionChanges, type VersionChange } from './version-changes'
import { HistoryList, HistoryMeta, historyOrder, type VersionHistory } from './version-history'
import { VersionRow } from './version-row'
import './project-picker.css'

type App = { id: string; name: string }
type Connection = { key: string; name: string; sourceName?: string; refreshRequired?: boolean; root: string; manifest: string; app: App; kind: string; design?: { id: string }; version?: { history?: VersionHistory }; workspace?: string; workspaceName?: string; preview?: boolean; available: boolean; error?: string }
type Connections = { active: string; projects: Connection[]; apps: (App & { connections: Connection[]; versions: AppVersion<Connection>[] })[]; workspaceErrors: string[]; canOpenWindow?: boolean }
const versionLabel = (kind: string) => ({ design: 'Design reference', live: 'Running app', isolated: 'Test instance' })[kind] ?? 'Branch checkout'
const versionIcon = (kind: string) => ({ design: Pencil, live: Monitor, isolated: Layers })[kind] ?? GitBranch
async function request<T>(input?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await projectFetch('/api/review/projects', { ...(input ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) } : {}), signal })
  const value = await response.json()
  if (!response.ok) throw Error(value.error ?? 'Project request failed')
  return value
}

export type ProjectPickerHandle = { open: (mode: 'work' | 'sources' | 'existing' | 'new') => void }
export function ProjectPicker({ blocked, activeRun, selectedScreen, focusScreen, onSearch, searchOpen, ref }: { blocked: boolean; activeRun: boolean; selectedScreen?: DraftScreen; focusScreen: (id: string) => void; onSearch: () => void; searchOpen: boolean; ref?: Ref<ProjectPickerHandle> }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'work' | 'sources' | 'existing' | 'new'>('work')
  const [connections, setConnections] = useState<Connections | null>(null)
  const [name, setName] = useState('')
  const [root, setRoot] = useState('')
  const [manifest, setManifest] = useState('')
  const [source, setSource] = useState('src')
  const [busy, setBusy] = useState(false)
  const [loadingConnections, setLoadingConnections] = useState(true)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ key: string; name: string; preview: boolean } | null>(null)
  const [discovery, setDiscovery] = useState<Discovery | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [appId, setAppId] = useState('')
  const [version, setVersion] = useState('')
  const [versionQuery, setVersionQuery] = useState('')
  const [expandedVersion, setExpandedVersion] = useState('')
  const [draftScreens, setDraftScreens] = useState<Record<string, DraftScreen[]>>({})
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({})
  const [loadingScreens, setLoadingScreens] = useState(false)
  const [changes, setChanges] = useState<Record<string, VersionChange>>({})
  const [changeError, setChangeError] = useState('')
  const [browseAppId, setBrowseAppId] = useState(project.app?.id ?? project.id)
  const currentApp = connections?.apps.find(app => app.id === browseAppId)
  const canOpenWindow = connections?.canOpenWindow && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  const target = browseAppId === (project.app?.id ?? project.id) ? selectedScreen : undefined
  const versions = versionChoices(currentApp?.versions ?? [], draftScreens, target, connections?.active)
  const chosen = versions.flatMap(item => item.previews).find(item => item.id === version)
  const chosenLocation = chosen?.row.kind === 'live' ? 'Live app · read only' : chosen?.row.kind === 'isolated' ? 'Test copy · isolated data' : 'Local preview'
  const previewCount = versions.reduce((count, item) => count + item.previews.length, 0)
  const visibleVersions = historyOrder(versionChoices(currentApp?.versions ?? [], draftScreens, target, connections?.active, versionQuery)).slice(0, 10)
  const versionSections = [
    { title: 'Branches', icon: GitBranch, items: visibleVersions.filter(item => item.kind === 'implementation') },
    { title: 'Running & test instances', icon: Monitor, items: visibleVersions.filter(item => item.kind === 'instance') },
    { title: 'Design', icon: Pencil, items: visibleVersions.filter(item => item.kind === 'design') },
  ]
  const currentName = connections?.projects.find(row => !row.workspace && row.key === project.key)?.sourceName ?? (error ? 'Version unavailable' : 'Loading version…')
  const currentVersion = connections?.apps.find(app => app.id === (project.app?.id ?? project.id))?.versions.find(item => item.connections.some(row => !row.workspace && row.key === project.key))
  const currentKind = connections?.projects.find(row => !row.workspace && row.key === project.key)?.kind ?? 'implementation'
  const CurrentIcon = versionIcon(currentKind)
  const caption = { ...versionCaption(currentName), ...(currentVersion ? { name: currentVersion.name } : {}) }
  const comparisonPreviews = visibleVersions.filter(item => !item.current || item.preview.row.refreshRequired).map(item => item.preview).filter(item => item.screen)
  const comparisonRequest = JSON.stringify({ scenario: target?.id, baseVersion: currentVersion?.id, candidates: comparisonPreviews.map(item => ({ id: item.id, key: item.row.key, workspace: item.row.workspace, scenario: item.screen!.id, version: currentApp?.versions.find(version => version.connections.includes(item.row))?.id })) })
  const appInput = () => { const app = connections?.apps.find(app => app.id === appId); return app ? { app: { id: app.id, name: app.name } } : {} }
  useEffect(() => { try { localStorage.setItem(`civic:${project.app?.id ?? project.id}:work`, JSON.stringify({ key: project.key })) } catch {} }, [])
  const hasConnections = connections !== null
  useEffect(() => {
    if (!open && hasConnections) return
    setLoadingConnections(true); setError('')
    void request<Connections>().then(setConnections).catch((error) => setError(error.message)).finally(() => setLoadingConnections(false))
  }, [open, hasConnections])
  useEffect(() => {
    if (!open || mode !== 'work' || !currentApp) return
    let cancelled = false
    const missing = currentApp.connections.filter(row => row.available && !draftScreens[`${row.workspace ?? ''}:${row.key}`])
    if (!missing.length) { setLoadingScreens(false); return }
    setLoadingScreens(true)
    void Promise.allSettled(missing.map(row => request<DraftScreen[]>({ action: 'scenarios', key: row.key, workspace: row.workspace }))).then(results => {
      if (cancelled) return
      const screens: Record<string, DraftScreen[]> = {}, errors: Record<string, string> = {}
      results.forEach((result, index) => { const row = missing[index]!, id = `${row.workspace ?? ''}:${row.key}`; screens[id] = result.status === 'fulfilled' ? result.value : []; if (result.status === 'rejected') errors[id] = 'Preview inventory unavailable. Close and reopen the project picker to retry.' })
      setDraftScreens(current => ({ ...current, ...screens })); setDraftErrors(current => ({ ...current, ...errors })); setLoadingScreens(false)
    })
    return () => { cancelled = true }
  }, [open, mode, currentApp, draftScreens])
  useEffect(() => {
    if (!open || mode !== 'work' || loadingScreens) return
    const input = JSON.parse(comparisonRequest)
    if (!input.scenario || !input.candidates.length) return
    let cancelled = false
    const controller = new AbortController()
    setChanges({}); setChangeError('')
    const pending = setTimeout(() => { void request<{ comparisons: VersionChange[] }>({ ...input, action: 'changes' }, controller.signal).then(result => {
      if (!cancelled) setChanges(Object.fromEntries(result.comparisons.map(item => [item.id, item])))
    }).catch(() => { if (!cancelled) setChangeError('Changes could not be loaded. Reopen the picker to retry.') }) }, 150)
    return () => { cancelled = true; clearTimeout(pending); controller.abort() }
  }, [open, mode, loadingScreens, comparisonRequest])
  const close = () => setOpen(false)
  const start = (next: 'existing' | 'new', connectedAppId = '') => { setMode(next); setError(''); setCreated(null); setDiscovery(null); setName(''); setRoot(''); setManifest(''); setSource('src'); setAppId(connectedAppId) }
  const add = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (mode === 'existing') {
        const result = await request<{ connection?: { key: string; name: string; preview: boolean }; discovery?: Discovery }>({ action: 'discover', root, manifest, source, ...appInput() })
        if (result.discovery) { setDiscovery(result.discovery); if (!name.trim()) setName(root.split('/').filter(Boolean).at(-1) ?? 'Connected app') }
        if (result.connection) { setCreated(result.connection); setConnections(await request()) }
      } else { setCreated(await request({ action: 'add', kind: mode, name, root, manifest, source })); setConnections(await request()) }
    }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  const createConnection = async (input: Record<string, unknown>) => {
    setBusy(true); setError('')
    try { setCreated(await request({ ...input, name, ...appInput() })); setConnections(await request()); setDiscovery(null) }
    catch (error) { if (input.action !== 'generate') setError((error as Error).message); throw error }
    finally { setBusy(false) }
  }
  const select = async (key: string, workspace?: string, scenario?: string) => {
    if (!workspace && key === connections?.active && !connections.projects.find(row => !row.workspace && row.key === key)?.refreshRequired) { if (scenario) focusScreen(scenario); close(); return }
    setBusy(true); setError('')
    try {
      const result = await request<{ redirect?: string }>({ action: 'select', key, workspace })
      const row = connections?.projects.find(row => row.key === key && row.workspace === workspace)
      if (row) { try { localStorage.setItem(`civic:${row.app.id}:work`, JSON.stringify({ key, workspace })) } catch {} }
      const destination = new URL(result.redirect ?? '/review', location.origin)
      if (scenario) { destination.searchParams.set('scenario', scenario); destination.searchParams.set('play', '1') }
      if (result.redirect) { location.assign(destination.href); return }
      history.replaceState(null, '', destination.pathname + destination.search)
      // A restart rotates the review session; reopen the entry before polling its index.
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        try {
          await fetch('/review', { cache: 'no-store' })
          const response = await fetch('/api/review/index', { cache: 'no-store' })
          if (response.ok && (await response.json()).project.key === key) { location.assign(destination.href); return }
        } catch { /* The same local port is briefly unavailable during restart. */ }
      }
      throw Error('The connection was saved, but restart did not finish. Reload the review to retry.')
    } catch (error) { setError((error as Error).message); setBusy(false) }
  }
  const canSwitch = !blocked && (!activeRun || acknowledged)
  const openPicker = () => {
    setMode('work'); setBrowseAppId(project.app?.id ?? project.id); setVersion(''); setExpandedVersion(''); setCreated(null); setDiscovery(null); setAcknowledged(false); setError(''); setDraftScreens({}); setDraftErrors({}); setChanges({}); setChangeError(''); setVersionQuery(''); setLoadingScreens(false); setOpen(true)
  }
  const chooseApp = (app: Connections['apps'][number]) => {
    setBrowseAppId(app.id); setVersion(''); setExpandedVersion(''); setVersionQuery(''); setChanges({}); setChangeError('')
  }
  type Preview = (typeof versions)[number]['preview']
  const isCurrent = (item: Preview) => !item.row.workspace && item.row.key === connections?.active && (!target || item.screen?.id === target.id)
  const choosePreview = (item: Preview) => {
    if (isCurrent(item) && !item.row.refreshRequired) close()
    else if (activeRun) setVersion(item.id)
    else void select(item.row.key, item.row.workspace, item.screen?.id)
  }
  const previewOption = (item: Preview, label: string, description: string) => {
    const current = isCurrent(item), details = versionDetails(item.row.sourceName ?? versionLabel(item.row.kind))
    const SourceIcon = versionIcon(item.row.kind)
    return <div className="civic-preview-option" aria-current={current ? 'true' : undefined}>
      <SourceIcon className="civic-version-source-icon" role="img" aria-label={versionLabel(item.row.kind)} /><span className="civic-version-text"><strong>{label}</strong><span className="civic-version-meta"><span>{description}</span>{details.revision && <code>{details.revision.slice(0, 8)}</code>}{details.edited && <span>Local changes</span>}{item.row.refreshRequired && <span>Update available</span>}</span></span>
      {current && !item.row.refreshRequired ? <span className="civic-version-viewing"><Check aria-hidden="true" />Viewing</span> : <Button variant={version === item.id ? 'secondary' : 'outline'} size="sm" aria-label={`${item.row.refreshRequired ? 'Update' : 'Open'} ${label} preview`} disabled={busy || loadingConnections || blocked || !item.row.available || !item.row.preview} onClick={() => choosePreview(item)}>{item.row.refreshRequired ? 'Update' : 'Open'}</Button>}
    </div>
  }
  const openCommand = () => { setOpen(false); onSearch() }
  useImperativeHandle(ref, () => ({ open: next => { if (busy) return; openPicker(); if (next === 'sources') setMode('sources'); else if (next !== 'work') start(next) } }))
  const content = <>
      <header><div><DialogTitle>{mode === 'work' ? 'Projects & versions' : mode === 'sources' ? `${project.app?.name ?? project.name} · Connections` : mode === 'existing' ? 'Connect an existing app' : 'Start a new project'}</DialogTitle></div><div className="civic-project-header-actions">{mode === 'work' && <Button variant="ghost" size="sm" onClick={openCommand}><Search aria-hidden="true" />Search<kbd>⌘K</kbd></Button>}<IconButton icon={X} label="Close project picker" disabled={busy} onClick={close} /></div></header>
      {error && <Alert variant="destructive" className="rh-project-error"><AlertDescription>{error}</AlertDescription></Alert>}
      {mode === 'work' ? <div className="civic-project-workspace"><nav className="civic-project-nav" aria-label="Projects"><span className="civic-project-nav-label">Projects</span>{connections?.apps.map(app => {
        const connection = app.connections.find(row => !row.workspace && row.key === connections.active && row.available) ?? preferredConnection(app.connections.filter(row => row.preview))
        return <div key={app.id} className="civic-project-nav-row"><Button variant="ghost" className="cv:min-w-0 cv:flex-1 cv:justify-start" aria-current={browseAppId === app.id ? 'true' : undefined} disabled={busy} onClick={() => chooseApp(app)}><FolderOpen aria-hidden="true" /><span>{app.name}</span>{app.id === (project.app?.id ?? project.id) && <span className="civic-project-open-mark" title="Open project">●</span>}</Button>{canOpenWindow && connection && <Button variant="ghost" size="icon-sm" nativeButton={false} disabled={busy} aria-label={`Open ${app.name} in a new window`} title={`Open ${app.name} in a new window`} render={<a href={projectWindowHref(connection.key, connection.workspace)} target="_blank" rel="noopener noreferrer" />}><SquareArrowOutUpRight aria-hidden="true" /></Button>}</div>
      })}<div className="civic-project-nav-actions"><Button variant="ghost" size="sm" className="cv:justify-start" onClick={() => start('existing')} disabled={busy}>Connect app</Button><Button variant="ghost" size="sm" className="cv:justify-start" onClick={() => start('new')} disabled={busy}>New project</Button></div></nav><section className="civic-project-versions" aria-label={`${currentApp?.name ?? 'Project'} versions`}><div className="civic-project-version-heading"><h3>{currentApp?.name ?? 'Loading project…'}</h3><p>{target ? `Versions of ${target.label}` : 'All screens and components'}</p></div>
        <div className="civic-version-search"><Input type="search" aria-label="Search versions" value={versionQuery} onChange={event => { setVersionQuery(event.target.value); setVersion(''); setExpandedVersion('') }} placeholder="Find a branch, build or design…" />{previewCount > 10 && <small>Up to 10 matches · search to find more</small>}</div>
        <div className="civic-version-scroll" role="region" aria-label="Available versions" tabIndex={0}>
        {!loadingScreens && versionSections.filter(section => section.items.length).map(({ title, icon: Icon, items }) => <section className="civic-version-section" key={title} aria-label={title}><h3><Icon aria-hidden="true" />{title}</h3><HistoryList className="rh-version-options" items={items.map(item => {
          const label = item.kind === 'design' && item.preview.screen ? item.preview.screen.label : item.name
          const expanded = expandedVersion === item.id
          const comparing = Boolean(target && (!item.current || item.preview.row.refreshRequired))
          const description = comparing ? changes[item.preview.id]?.summary ?? (changeError ? 'Comparison unavailable' : 'Comparing changes…') : item.preview.row.kind === 'isolated' ? 'Isolated test copy' : item.preview.row.kind === 'live' ? 'Currently running · read only' : item.description ?? (item.kind === 'design' ? 'Design reference' : 'Local code preview')
          const history = item.preview.row.version?.history ?? item.history
          const SourceIcon = versionIcon(item.preview.row.kind)
          return { id: item.id, label, history, marker: <SourceIcon />, current: item.current, content: <VersionRow id={item.id} label={label} expanded={expanded} current={item.current} disabled={busy} toggle={() => setExpandedVersion(expanded ? '' : item.id)} summary={<><strong>{label}</strong><span className="civic-version-meta"><span className={comparing ? 'civic-change-summary' : undefined}>{description === 'Branch draft' ? 'Branch checkout' : description}</span>{versionDetails(item.preview.row.sourceName ?? '').edited && <span>Local changes</span>}{item.preview.row.refreshRequired && <span>Update available</span>}</span>{history && <HistoryMeta history={history} />}</>}>
            {comparing && (changeError ? <p role="status">{changeError}</p> : <VersionChanges change={changes[item.preview.id]} scope={target!.label} />)}
            <ul className="civic-version-previews" aria-label={`Previews for ${label}`}>{item.previews.slice(0, 10).map(preview => {
              const location = preview.row.kind === 'live' ? 'Live app' : preview.row.kind === 'isolated' ? 'Test copy' : versionDetails(preview.row.sourceName ?? preview.row.name).name
              return <li key={preview.id}>{previewOption(preview, `${location}${preview.screen?.state ? ` · ${preview.screen.state}` : ''}`, preview.row.kind === 'live' ? 'Read only' : preview.row.kind === 'isolated' ? 'Isolated data' : preview.row.workspaceName ?? 'Local worktree')}</li>
            })}</ul>
          </VersionRow> }
        })} /></section>)}
        {loadingConnections || loadingScreens ? <div className="civic-picker-loading" role="status"><Skeleton className="cv:h-12 cv:w-full" /><Skeleton className="cv:h-12 cv:w-full" /><p>Loading previews…</p></div> : !error && !visibleVersions.length ? <Empty role="status"><EmptyHeader><EmptyMedia variant="icon"><SearchX aria-hidden="true" /></EmptyMedia><EmptyTitle>No preview available</EmptyTitle><EmptyDescription>{versionQuery ? 'Try another search.' : 'Connect a version with a preview for this screen.'}</EmptyDescription></EmptyHeader>{versionQuery && <EmptyContent><Button variant="outline" onClick={() => setVersionQuery('')}>Clear search</Button></EmptyContent>}</Empty> : null}
        {blocked && <p role="status">Save edits and finish pending captures before switching versions.</p>}
        {target && !loadingScreens && versions.length > 0 && !versions.some(item => item.kind === 'design') && <p className="rh-project-copy">No design draft is registered for this item yet.</p>}

        {Object.entries(draftErrors).map(([key, message]) => <p key={key} role="status">{message}</p>)}
        {connections?.workspaceErrors.map(message => <p key={message} role="status" className="rh-project-copy">{message}</p>)}
        </div><div className="civic-version-footer">{activeRun && version && chosen ? <section className="civic-version-confirm"><p>Open <strong>{versions.find(item => item.previews.some(preview => preview.id === chosen.id))?.name ?? versionDetails(chosen.row.sourceName ?? versionLabel(chosen.row.kind)).name}</strong>{chosen.screen ? ` · ${chosen.screen.label}` : ''}?</p><p>{chosenLocation}. Saved evidence stays with its version.</p><div><Button variant="ghost" disabled={busy} onClick={() => setVersion('')}>Cancel</Button><Button disabled={busy || blocked} onClick={() => void select(chosen.row.key, chosen.row.workspace, chosen.screen?.id)}>{busy ? 'Opening…' : 'Open version'}</Button></div></section> : <div className="civic-version-footer-actions">{browseAppId === (project.app?.id ?? project.id) ? <Button variant="ghost" size="sm" aria-label="Manage sources" disabled={busy} onClick={() => setMode('sources')}><Settings2 aria-hidden="true" />Manage connections</Button> : <span>Choose a version to open this project.</span>}</div>}</div>
      </section></div> : mode === 'sources' ? <><SourceBrowser connect={row => { start('existing', project.app?.id ?? project.id); setRoot(row.path ?? ''); setSource(row.source ?? 'src'); setName(row.title) }} /><div className="rh-project-actions"><Button variant="outline" onClick={() => setMode('work')}>Back to versions</Button><Button variant="outline" onClick={() => start('existing', project.app?.id ?? project.id)}>Add local folder</Button></div>
      </> : created ? <section className="rh-project-result">
        <h3>{created.name} is ready</h3><p>{created.preview ? 'Your preview connection is ready to test. Play its real screens and check the declared paths; generated navigation is synthetic until verified.' : 'Your source inventory is connected. Screens, paths and personas need a scenario registry and synthetic adapter before they can be played.'}</p>
        <dl><dt>App folder</dt><dd>{connections?.projects.find((row) => row.key === created.key)?.root}</dd><dt>Project manifest</dt><dd>{connections?.projects.find((row) => row.key === created.key)?.manifest}</dd></dl>
        <p className="rh-project-copy">{mode === 'new' ? 'This starter has a note-writing journey, a review branch and synthetic state. Adapt its source files to build your app.' : 'The app checkout has not been changed. Connection files belong to CIVIC.'}</p>
        <div className="rh-project-actions"><Button variant="outline" onClick={() => { setMode('work'); setCreated(null) }} disabled={busy}>Back to versions</Button><Button variant="default" disabled={busy || !canSwitch} onClick={() => void select(created.key)}>{busy ? 'Opening…' : 'Open connected work'}</Button></div>
      </section> : discovery ? <DiscoverySetup discovery={discovery} name={name} setName={setName} busy={busy} back={() => setDiscovery(null)} generate={(input) => createConnection({ ...(input as Record<string, unknown>), action: 'generate' })} inventory={() => void createConnection({ action: 'add', kind: 'existing', root, source, manifest }).catch(() => {})} /> : <form onSubmit={(event) => void add(event)}>
        <p className="rh-project-copy">{mode === 'existing' ? 'Connect a folder on the machine running the CIVIC review. A phone can select that host’s folders, not its own.' : 'Create a local starter with four screens, a branching journey and captured inputs. No account or backend is required.'}</p>
        {mode === 'existing' && <label>App folder<Input aria-label="App folder" autoFocus required value={root} onChange={(event) => setRoot(event.target.value)} placeholder="/absolute/path/to/your-app" autoComplete="off" /><small>Read-only source checkout. Keep product work in its own branch or worktree.</small></label>}
        {mode === 'existing' && <label>App<NativeSelect className="cv:w-full" value={appId} onChange={event => setAppId(event.target.value)}><option value="">Create a separate app</option>{connections?.apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</NativeSelect><small>Add another checkout or worktree under an existing app.</small></label>}
        <label>{mode === 'existing' ? 'Name for an unconfigured app' : 'Project name'}<Input autoFocus={mode === 'new'} required={mode === 'new'} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="My project" /></label>
        {mode === 'existing' && <><label>Manifest path <span>(optional)</span><Input aria-label="Manifest path" value={manifest} onChange={(event) => setManifest(event.target.value)} placeholder="civic.project.json" /><small>Relative to the app folder. Existing manifests supply their own name, personas and adapter. Only connect app code you trust.</small></label><label>Source folder <span>(when there is no manifest)</span><Input aria-label="Source folder" value={source} onChange={(event) => setSource(event.target.value)} placeholder="src" /><small>Relative to the app folder. CIVIC will identify code candidates; it won’t invent a complete user journey.</small></label></>}
        <div className="rh-project-actions"><Button variant="outline" type="button" onClick={() => setMode('work')} disabled={busy}>Back</Button><Button variant="default" type="submit" disabled={busy}>{busy ? 'Preparing…' : mode === 'existing' ? 'Discover screens' : 'Create project'}</Button></div>
      </form>}
      {mode !== 'work' && <footer><p>Saved reviews and recordings stay with their versions.</p>{mode !== 'sources' && (blocked ? <p role="status">Save proposal edits and finish or retry pending captures before switching.</p> : activeRun && created && <label className="rh-project-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />Start a fresh preview. Keep saved evidence.</label>)}</footer>}
  </>
  return <>
      <Button ref={trigger} variant="ghost" className="rh-project-trigger cv:grid cv:h-11 cv:gap-x-2 cv:gap-y-0.5 cv:px-2 cv:py-1" aria-haspopup="dialog" aria-expanded={open} onClick={openPicker} title={`Project · ${project.app?.name ?? project.name}\n${versionLabel(currentKind)} · ${currentName}`}>
        <span className="rh-project-name cv:leading-tight">{project.app?.name ?? project.name}</span><ChevronDown className="cv:size-3.5" aria-hidden="true" /><span className="rh-project-version cv:leading-4"><CurrentIcon className="cv:size-3" role="img" aria-label={versionLabel(currentKind)} /><span>{caption.name}</span>{caption.revision && <small>{caption.revision}</small>}</span>
      </Button>
    <Dialog open={open} onOpenChange={value => { if (!value && !busy) close() }}><DialogContent onKeyDown={event => { if (mode === 'work' && !busy && projectShortcut(event.nativeEvent)) { event.preventDefault(); openCommand() } }} showCloseButton={false} finalFocus={searchOpen ? false : trigger} className={`rh-project-dialog cv:p-0 cv:max-w-[calc(100vw-2rem)] cv:sm:max-w-[calc(100vw-2rem)] ${mode === 'work' ? 'civic-project-modal cv:flex cv:flex-col cv:w-[920px]' : 'cv:block cv:w-[640px]'}`}>{open && content}</DialogContent></Dialog>
  </>
}
