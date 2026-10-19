import { SidebarFooter, SidebarGroupLabel } from '@civic/shell/ui/sidebar'
import { Checkbox } from '@civic/shell/ui/checkbox'
import { FieldGroup, Field, FieldLabel } from '@civic/shell/ui/field'
import { Disclosure } from '@civic/shell/ui/disclosure'
import { useEffect, useImperativeHandle, useRef, useState, type FormEvent, type Ref, type RefObject } from 'react'
import project from 'virtual:civic-project'
import { useProjectVersions, requestProjects as request, type Connections } from './use-project-versions'
import { DiscoverySetup, type Discovery } from './discovery-setup'
import { Check, ChevronDown, GitBranch, Search, SearchX, FolderOpen, Settings2, Pencil, Monitor, Layers, X, ArrowUpRight } from '@civic/shell/icons'
import { Button } from '@civic/shell/ui/button'
import { IconButton } from '@civic/shell/ui/icon-button'
import { Input } from '@civic/shell/ui/input'
import { NativeSelect } from '@civic/shell/ui/native-select'
import { Dialog, DialogContent, DialogTitle } from '@civic/shell/ui/dialog'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@civic/shell/ui/empty'
import { Skeleton } from '@civic/shell/ui/skeleton'
import { Alert, AlertDescription } from '@civic/shell/ui/alert'
import { projectShortcut, projectWindowHref, preferredConnection, versionCaption, versionDetails, checkoutGroup, type DraftScreen } from './project-choice'
import { readinessFor, type ConnectionReadiness } from './connection-readiness'
import { SourceBrowser } from './source-browser'
import { VersionChanges } from './version-changes'
import { HistoryList, HistoryMeta } from './version-history'
import { VersionRow } from './version-row'

const versionLabel = (kind: string) => ({ design: 'Design reference', live: 'Running app', isolated: 'Test instance' })[kind] ?? 'Branch checkout'
const versionIcon = (kind: string) => ({ design: Pencil, live: Monitor, isolated: Layers })[kind] ?? GitBranch

export type ProjectPickerHandle = { open: (mode: 'work' | 'sources' | 'existing' | 'new') => void }
export function ProjectPicker({ blocked, activeRun, selectedScreen, focusScreen, onSearch, searchOpen, ref, hideTrigger = false, returnFocus, tabDirty = false, readiness: activeReadiness }: { blocked: boolean; activeRun: boolean; selectedScreen?: DraftScreen; focusScreen: (id: string) => void; onSearch: () => void; searchOpen: boolean; ref?: Ref<ProjectPickerHandle>; hideTrigger?: boolean; returnFocus?: RefObject<HTMLButtonElement | null>; tabDirty?: boolean; readiness?: ConnectionReadiness }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'work' | 'sources' | 'existing' | 'new'>('work')
  const [name, setName] = useState('')
  const [root, setRoot] = useState('')
  const [manifest, setManifest] = useState('')
  const [source, setSource] = useState('src')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ key: string; name: string; preview: boolean } | null>(null)
  const [discovery, setDiscovery] = useState<Discovery | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [appId, setAppId] = useState('')
  const [version, setVersion] = useState('')
  const [versionQuery, setVersionQuery] = useState('')
  const [expandedVersion, setExpandedVersion] = useState('')
  const [offset, setOffset] = useState(0), [refresh, setRefresh] = useState('')
  const [browseAppId, setBrowseAppId] = useState(project.app?.id ?? project.id)
  const target = browseAppId === (project.app?.id ?? project.id) ? selectedScreen : undefined
  const versionsData = useProjectVersions({ open, mode, browseAppId, target, versionQuery, expandedVersion, offset, refresh, setError })
  const { connections, loadingConnections, loadingScreens, page, details, pageError, detailError, changes, changeError, pageRequest, versions, previewCount } = versionsData
  const currentApp = connections?.apps.find(app => app.id === browseAppId)
  const canOpenWindow = connections?.canOpenWindow && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  const chosen = versions.flatMap(item => item.previews).find(item => item.id === version)
  const chosenLocation = chosen?.row.kind === 'live' ? 'Live app · read only' : chosen?.row.kind === 'isolated' ? 'Test copy · isolated data' : 'Local preview'
  const visibleVersions = versions
  const versionSections = [
    { title: 'Branches', icon: GitBranch, items: visibleVersions.filter(item => item.kind === 'implementation') },
    { title: 'Running & test instances', icon: Monitor, items: visibleVersions.filter(item => item.kind === 'instance') },
    { title: 'Design', icon: Pencil, items: visibleVersions.filter(item => item.kind === 'design') },
  ]
  const currentConnection = connections?.projects.find(row => !row.workspace && row.key === project.key)
  const currentName = currentConnection?.sourceName ?? (currentConnection?.error || error ? 'Version unavailable' : 'Loading version…')
  const currentKind = currentConnection?.kind ?? 'implementation'
  const CurrentIcon = versionIcon(currentKind)
  const caption = { ...versionCaption(currentName), ...(currentConnection?.version?.name ? { name: currentConnection.version.name } : {}) }
  useEffect(() => {
    void window.civicDesktop?.register({ appId: project.app?.id ?? project.id, name: (project.app?.name ?? project.name).slice(0, 240), key: project.key, version: caption.name.slice(0, 240), dirty: tabDirty }).catch(error => setError(error.message))
  }, [caption.name, tabDirty])
  const appInput = () => { const app = connections?.apps.find(app => app.id === appId); return app ? { app: { id: app.id, name: app.name } } : {} }
  useEffect(() => { try { localStorage.setItem(`civic:${project.app?.id ?? project.id}:work`, JSON.stringify({ key: project.key })) } catch {} }, [])
  const close = () => setOpen(false)
  const start = (next: 'existing' | 'new', connectedAppId = '') => { setMode(next); setError(''); setCreated(null); setDiscovery(null); setName(''); setRoot(''); setManifest(''); setSource('src'); setAppId(connectedAppId) }
  const add = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (mode === 'existing') {
        const result = await request<{ connection?: { key: string; name: string; preview: boolean }; discovery?: Discovery }>({ action: 'discover', root, manifest, source, ...appInput() })
        if (result.discovery) { setDiscovery(result.discovery); if (!name.trim()) setName(root.split('/').filter(Boolean).at(-1) ?? 'Connected app') }
        if (result.connection) { setCreated(result.connection); await versionsData.reloadConnections() }
      } else { setCreated(await request({ action: 'add', kind: mode, name, root, manifest, source })); await versionsData.reloadConnections() }
    }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  const createConnection = async (input: Record<string, unknown>) => {
    setBusy(true); setError('')
    try { setCreated(await request({ ...input, name, ...appInput() })); await versionsData.reloadConnections(); setDiscovery(null) }
    catch (error) { if (input.action !== 'generate') setError((error as Error).message); throw error }
    finally { setBusy(false) }
  }
  const select = async (key: string, workspace?: string, scenario?: string) => {
    if (!workspace && key === connections?.active && !connections.projects.find(row => !row.workspace && row.key === key)?.refreshRequired) { if (scenario) focusScreen(scenario); close(); return }
    setBusy(true); setError('')
    try {
      const target = connections?.projects.find(row => row.key === key && row.workspace === workspace)
      if (window.civicDesktop && target && !target.refreshRequired) {
        await window.civicDesktop.openProject({ appId: target.app.id, name: target.app.name, key, workspace, scenario })
        setBusy(false); close(); return
      }
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
    setMode('work'); setBrowseAppId(project.app?.id ?? project.id); setVersion(''); setExpandedVersion(''); setCreated(null); setDiscovery(null); setAcknowledged(false); setError(''); versionsData.reset(); setOffset(0); setVersionQuery(''); setOpen(true)
  }
  const chooseApp = (app: Connections['apps'][number]) => {
    setBrowseAppId(app.id); setVersion(''); setExpandedVersion(''); setVersionQuery(''); setOffset(0); versionsData.clearChanges()
  }
  type Preview = (typeof versions)[number]['preview']
  const isCurrent = (item: Preview) => !item.row.workspace && item.row.key === connections?.active && (!target || item.screen?.id === target.id)
  const choosePreview = (item: Preview) => {
    if (isCurrent(item) && !item.row.refreshRequired) close()
    else if (activeRun && (!window.civicDesktop || item.row.refreshRequired)) setVersion(item.id)
    else void select(item.row.key, item.row.workspace, item.screen?.id)
  }
  const previewOption = (item: Preview, label: string, description: string, revision?: string) => {
    const current = isCurrent(item), details = versionDetails(item.row.sourceName ?? versionLabel(item.row.kind))
    const health = readinessFor(!item.row.workspace && item.row.key === project.key && activeReadiness && activeReadiness.state !== 'unchecked' ? activeReadiness : item.row.readiness)
    const healthLabel = { unchecked: 'Not opened', checking: 'Opening…', ready: 'Preview opened', stale: 'Earlier revision', failed: 'Preview unavailable', unsupported: 'No preview adapter' }[health.state]
    const SourceIcon = versionIcon(item.row.kind)
    return <div className="civic-preview-option" data-readiness={health.state} aria-current={current ? 'true' : undefined}>
      <SourceIcon className="civic-version-source-icon" role="img" aria-label={versionLabel(item.row.kind)} /><span className="civic-version-text"><strong>{label}</strong><span className="civic-version-meta"><span>{description}</span><span title={health.reason}>{healthLabel}</span>{details.revision && !revision?.startsWith(details.revision) && <code>{details.revision.slice(0, 8)}</code>}{details.edited && <span>Local changes</span>}{item.row.refreshRequired && <span>Update available</span>}</span></span>
      {current && !item.row.refreshRequired ? <span className="civic-version-viewing"><Check aria-hidden="true" />Viewing</span> : <Button variant={version === item.id ? 'secondary' : 'outline'} size="sm" aria-label={`${item.row.refreshRequired ? 'Update' : 'Open'} ${label} preview`} disabled={busy || loadingConnections || (blocked && !window.civicDesktop) || !item.row.available || !item.row.preview} onClick={() => choosePreview(item)}>{item.row.refreshRequired ? 'Update' : 'Open'}</Button>}
    </div>
  }
  const openCommand = () => { setOpen(false); onSearch() }
  useImperativeHandle(ref, () => ({ open: next => { if (busy) return; openPicker(); if (next === 'sources') setMode('sources'); else if (next !== 'work') start(next) } }))
  const content = <>
      <header><div><DialogTitle>{mode === 'work' ? 'Projects & versions' : mode === 'sources' ? `${project.app?.name ?? project.name} · Connections` : mode === 'existing' ? 'Connect an existing app' : 'Start a new project'}</DialogTitle></div><div className="civic-project-header-actions">{mode === 'work' && <Button variant="ghost" size="sm" onClick={openCommand}><Search aria-hidden="true" />Search<kbd>⌘K</kbd></Button>}<IconButton icon={X} label="Close project picker" disabled={busy} onClick={close} /></div></header>
      {error && <Alert variant="destructive" className="rh-project-error"><AlertDescription>{error}</AlertDescription></Alert>}
      {mode === 'work' ? <div className="civic-project-workspace"><nav className="civic-project-nav" aria-label="Projects"><SidebarGroupLabel className="cv:max-[600px]:hidden">Projects</SidebarGroupLabel>{connections?.apps.map(app => {
        const connection = app.connections.find(row => !row.workspace && row.key === connections.active && row.available) ?? preferredConnection(app.connections.filter(row => row.preview))
        return <div key={app.id} className="civic-project-nav-row"><Button variant="ghost" className="cv:min-w-0 cv:flex-1 cv:justify-start cv:hover:bg-foreground/8 cv:dark:hover:bg-foreground/8 cv:aria-[current=true]:hover:bg-primary/15 cv:aria-[current=true]:hover:text-primary" aria-current={browseAppId === app.id ? 'true' : undefined} disabled={busy} onClick={() => chooseApp(app)}><FolderOpen aria-hidden="true" /><span>{app.name}</span>{app.id === (project.app?.id ?? project.id) && <span className="civic-project-open-mark" title="Open project">●</span>}</Button>{canOpenWindow && connection && <Button variant="ghost" size="icon-sm" className="cv:rounded-lg cv:hover:bg-foreground/8 cv:dark:hover:bg-foreground/8" nativeButton={false} disabled={busy} aria-label={`Open ${app.name} in a new window`} title={`Open ${app.name} in a new window`} render={<a href={projectWindowHref(connection.key, connection.workspace)} target="_blank" rel="noopener noreferrer" />}><ArrowUpRight className="cv:size-3.5" aria-hidden="true" /></Button>}</div>
      })}<SidebarFooter className="civic-project-nav-actions cv:max-[600px]:flex-row cv:max-[600px]:py-1"><Button variant="ghost" size="sm" className="cv:justify-start" onClick={() => start('existing')} disabled={busy}>Connect app</Button><Button variant="ghost" size="sm" className="cv:justify-start" onClick={() => start('new')} disabled={busy}>New project</Button></SidebarFooter></nav><section className="civic-project-versions" aria-label={`${currentApp?.name ?? 'Project'} versions`}><div className="civic-project-version-heading"><p>{target ? `Versions of ${target.label}` : 'All screens and components'}</p></div>
        <div className="civic-version-search"><Input type="search" aria-label="Search versions" value={versionQuery} maxLength={120} onChange={event => { setVersionQuery(event.target.value); setVersion(''); setExpandedVersion(''); setOffset(0) }} placeholder="Find a branch, build or design…" /></div>
        <div className="civic-version-scroll" role="region" aria-label="Available versions" tabIndex={0}>
        {!loadingScreens && versionSections.filter(section => section.items.length).map(({ title, icon: Icon, items }) => <section className="civic-version-section" key={title} aria-label={title}><h3><Icon aria-hidden="true" />{title}</h3><HistoryList className="rh-version-options" items={items.map(item => {
          const group = checkoutGroup(item)
          const label = item.kind === 'design' && item.preview.screen ? item.preview.screen.label : group.label
          const expanded = expandedVersion === item.id
          const comparing = Boolean(target && (!item.current || item.preview.row.refreshRequired))
          const description = comparing ? changes[item.preview.id]?.summary ?? (changeError ? 'Comparison unavailable' : 'Comparing changes…') : item.preview.row.kind === 'isolated' ? 'Isolated test copy' : item.preview.row.kind === 'live' ? 'Currently running · read only' : item.description ?? (item.kind === 'design' ? 'Design reference' : 'Local code preview')
          const history = item.preview.row.version?.history ?? item.history
          const SourceIcon = versionIcon(item.preview.row.kind)
          return { id: item.id, label, history, marker: <SourceIcon />, current: item.current, content: <VersionRow id={item.id} label={label} expanded={expanded} current={item.current} disabled={busy} toggle={() => setExpandedVersion(expanded ? '' : item.id)} summary={<><strong>{label}</strong><span className="civic-version-meta"><span className={comparing ? 'civic-change-summary' : undefined}>{group.shared && !comparing ? `${group.branches.length} branch checkouts` : description === 'Branch draft' ? 'Branch checkout' : description}</span>{versionDetails(item.preview.row.sourceName ?? '').edited && <span>Local changes</span>}{item.preview.row.refreshRequired && <span>Update available</span>}</span>{group.shared && !expanded && <span className="civic-version-meta">{group.branches.join(' · ')}</span>}{history && <HistoryMeta history={history} />}</>}>
            {comparing && (changeError ? <p role="status">{changeError}</p> : <VersionChanges change={changes[item.preview.id]} scope={target!.label} />)}
            {!details[item.id] ? <p role="status">{detailError || 'Loading previews…'}{detailError && <Button variant="ghost" size="sm" onClick={() => { setExpandedVersion(''); setRefresh(crypto.randomUUID()) }}>Retry</Button>}</p> : <ul className="civic-version-previews" aria-label={`Previews for ${label}`}>{item.previews.slice(0, 10).map(preview => {
              const location = preview.row.kind === 'live' ? 'Live app' : preview.row.kind === 'isolated' ? 'Test copy' : group.branches.length === 1 && item.previews.length === 1 ? 'Local checkout' : versionDetails(preview.row.sourceName ?? preview.row.name).name
              return <li key={preview.id}>{previewOption(preview, `${location}${preview.screen?.state ? ` · ${preview.screen.state}` : ''}`, preview.row.kind === 'live' ? 'Read only' : preview.row.kind === 'isolated' ? 'Isolated data' : preview.row.workspaceName ?? 'Local worktree', history?.revision)}</li>
            })}</ul>}
          </VersionRow> }
        })} /></section>)}
        {loadingConnections || loadingScreens ? <div className="civic-picker-loading" role="status"><Skeleton className="cv:h-12 cv:w-full" /><Skeleton className="cv:h-12 cv:w-full" /><p>Loading previews…</p></div> : pageError ? <Alert variant="destructive"><AlertDescription>{pageError}<Button variant="ghost" size="sm" onClick={() => setRefresh(crypto.randomUUID())}>Retry</Button></AlertDescription></Alert> : !error && !visibleVersions.length ? <Empty role="status"><EmptyHeader><EmptyMedia variant="icon"><SearchX aria-hidden="true" /></EmptyMedia><EmptyTitle>No preview available</EmptyTitle><EmptyDescription>{versionQuery ? 'Try another search.' : 'Connect a version with a preview for this screen.'}</EmptyDescription></EmptyHeader>{versionQuery && <EmptyContent><Button variant="outline" onClick={() => setVersionQuery('')}>Clear search</Button></EmptyContent>}</Empty> : null}
        {!loadingScreens && page?.scope === pageRequest && (offset > 0 || page.hasMore) && <nav className="rh-project-actions" aria-label="Version pages"><Button variant="ghost" size="sm" disabled={offset === 0} onClick={() => { setOffset(value => Math.max(0, value - 10)); setExpandedVersion('') }}>Previous</Button><span>{offset + 1}–{Math.min(offset + page.limit, previewCount)} of {previewCount}</span><Button variant="ghost" size="sm" disabled={!page.hasMore} onClick={() => { setOffset(value => value + 10); setExpandedVersion('') }}>Next</Button></nav>}
        {blocked && !window.civicDesktop && <p role="status">Save edits and finish pending captures before switching versions.</p>}
        {target && !loadingScreens && versions.length > 0 && !versions.some(item => item.kind === 'design') && <p className="rh-project-copy">No design draft is registered for this item yet.</p>}

        {page?.scope === pageRequest && page.errors.length > 0 && <Disclosure className="civic-source-changes" title={<>{page.errors.length} previews unavailable</>}>{page.errors.map(message => <p key={message} role="status">{message}</p>)}<Button variant="ghost" size="sm" onClick={() => setRefresh(crypto.randomUUID())}>Retry unavailable previews</Button></Disclosure>}
        {Boolean(connections?.workspaceErrors.length) && <Disclosure className="civic-source-changes" title={<>{connections!.workspaceErrors.length} previews unavailable</>}>{connections!.workspaceErrors.map(message => <p key={message} className="rh-project-copy">{message}</p>)}</Disclosure>}
        </div><div className="civic-version-footer">{activeRun && version && chosen ? <section className="civic-version-confirm"><p>Open <strong>{versions.find(item => item.previews.some(preview => preview.id === chosen.id))?.name ?? versionDetails(chosen.row.sourceName ?? versionLabel(chosen.row.kind)).name}</strong>{chosen.screen ? ` · ${chosen.screen.label}` : ''}?</p><p>{chosenLocation}. Saved evidence stays with its version.</p><div><Button variant="ghost" disabled={busy} onClick={() => setVersion('')}>Cancel</Button><Button disabled={busy || blocked} onClick={() => void select(chosen.row.key, chosen.row.workspace, chosen.screen?.id)}>{busy ? 'Opening…' : 'Open version'}</Button></div></section> : <div className="civic-version-footer-actions">{browseAppId === (project.app?.id ?? project.id) ? <Button variant="ghost" size="sm" aria-label="Manage sources" disabled={busy} onClick={() => setMode('sources')}><Settings2 aria-hidden="true" />Manage connections</Button> : <span>Choose a version to open this project.</span>}</div>}</div>
      </section></div> : mode === 'sources' ? <><SourceBrowser connect={row => { start('existing', project.app?.id ?? project.id); setRoot(row.path ?? ''); setSource(row.source ?? 'src'); setName(row.title) }} /><div className="rh-project-actions"><Button variant="outline" onClick={() => setMode('work')}>Back to versions</Button><Button variant="outline" onClick={() => start('existing', project.app?.id ?? project.id)}>Add local folder</Button></div>
      </> : created ? <section className="rh-project-result">
        <h3>{created.name} connected</h3><p>{created.preview ? 'The preview is configured. Open it to check that it starts; generated navigation remains synthetic until verified.' : 'Your source inventory is connected. Screens, paths and personas need a scenario registry and synthetic adapter before they can be played.'}</p>
        <dl><dt>App folder</dt><dd>{connections?.projects.find((row) => row.key === created.key)?.root}</dd><dt>Project manifest</dt><dd>{connections?.projects.find((row) => row.key === created.key)?.manifest}</dd></dl>
        <p className="rh-project-copy">{mode === 'new' ? 'This starter has a note-writing journey, a review branch and synthetic state. Adapt its source files to build your app.' : 'The app checkout has not been changed. Connection files belong to CIVIC.'}</p>
        <div className="rh-project-actions"><Button variant="outline" onClick={() => { setMode('work'); setCreated(null) }} disabled={busy}>Back to versions</Button><Button variant="default" disabled={busy || !canSwitch} onClick={() => void select(created.key)}>{busy ? 'Opening…' : 'Open connected work'}</Button></div>
      </section> : discovery ? <DiscoverySetup discovery={discovery} name={name} setName={setName} busy={busy} back={() => setDiscovery(null)} generate={(input) => createConnection({ ...(input as Record<string, unknown>), action: 'generate' })} inventory={() => void createConnection({ action: 'add', kind: 'existing', root, source, manifest }).catch(() => {})} /> : <form onSubmit={(event) => void add(event)}><FieldGroup>
        <p className="rh-project-copy">{mode === 'existing' ? 'Connect a folder on the machine running the CIVIC review. A phone can select that host’s folders, not its own.' : 'Create a local starter with four screens, a branching journey and captured inputs. No account or backend is required.'}</p>
        {mode === 'existing' && <Field><FieldLabel className="cv:grid cv:w-full cv:gap-2">App folder<Input aria-label="App folder" autoFocus required value={root} onChange={(event) => setRoot(event.target.value)} placeholder="/absolute/path/to/your-app" autoComplete="off" /><small>Read-only source checkout. Keep product work in its own branch or worktree.</small></FieldLabel></Field>}
        {mode === 'existing' && <Field><FieldLabel className="cv:grid cv:w-full cv:gap-2">App<NativeSelect className="cv:w-full" value={appId} onChange={event => setAppId(event.target.value)}><option value="">Create a separate app</option>{connections?.apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</NativeSelect><small>Add another checkout or worktree under an existing app.</small></FieldLabel></Field>}
        <Field><FieldLabel className="cv:grid cv:w-full cv:gap-2">{mode === 'existing' ? 'Name for an unconfigured app' : 'Project name'}<Input autoFocus={mode === 'new'} required={mode === 'new'} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="My project" /></FieldLabel></Field>
        {mode === 'existing' && <><Field><FieldLabel className="cv:grid cv:w-full cv:gap-2">Manifest path <span>(optional)</span><Input aria-label="Manifest path" value={manifest} onChange={(event) => setManifest(event.target.value)} placeholder="civic.project.json" /><small>Relative to the app folder. Existing manifests supply their own name, personas and adapter. Only connect app code you trust.</small></FieldLabel></Field><Field><FieldLabel className="cv:grid cv:w-full cv:gap-2">Source folder <span>(when there is no manifest)</span><Input aria-label="Source folder" value={source} onChange={(event) => setSource(event.target.value)} placeholder="src" /><small>Relative to the app folder. CIVIC will identify code candidates; it won’t invent a complete user journey.</small></FieldLabel></Field></>}
        <div className="rh-project-actions"><Button variant="outline" type="button" onClick={() => setMode('work')} disabled={busy}>Back</Button><Button variant="default" type="submit" disabled={busy}>{busy ? 'Preparing…' : mode === 'existing' ? 'Discover screens' : 'Create project'}</Button></div>
      </FieldGroup></form>}
      {mode !== 'work' && <footer><p>Saved reviews and recordings stay with their versions.</p>{mode !== 'sources' && (blocked ? <p role="status">Save proposal edits and finish or retry pending captures before switching.</p> : activeRun && created && <Field orientation="horizontal" className="rh-project-ack"><FieldLabel className="cv:flex cv:min-h-11 cv:w-full cv:items-center cv:gap-2"><Checkbox checked={acknowledged} onCheckedChange={checked => setAcknowledged(checked)} />Start a fresh preview. Keep saved evidence.</FieldLabel></Field>)}</footer>}
  </>
  return <>
      <Button ref={trigger} variant="ghost" className={`rh-project-trigger cv:grid cv:h-11 cv:gap-x-2 cv:gap-y-0.5 cv:px-2 cv:py-1${hideTrigger ? ' cv:hidden' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={openPicker} title={`Project · ${project.app?.name ?? project.name}\n${versionLabel(currentKind)} · ${currentName}`}>
        <span className="rh-project-name cv:leading-tight">{project.app?.name ?? project.name}</span><ChevronDown className="cv:size-3.5" aria-hidden="true" /><span className="rh-project-version cv:leading-4"><CurrentIcon className="cv:size-3" role="img" aria-label={versionLabel(currentKind)} /><span>{caption.name}</span>{caption.revision && <small>{caption.revision}</small>}</span>
      </Button>
    <Dialog open={open} onOpenChange={value => { if (!value && !busy) close() }}><DialogContent onKeyDown={event => { if (mode === 'work' && !busy && projectShortcut(event.nativeEvent)) { event.preventDefault(); openCommand() } }} showCloseButton={false} finalFocus={searchOpen ? false : hideTrigger ? returnFocus : trigger} className={`rh-project-dialog cv:gap-0 cv:p-0 cv:max-w-[calc(100vw-2rem)] cv:sm:max-w-[calc(100vw-2rem)] ${mode === 'work' ? 'civic-project-modal cv:flex cv:flex-col cv:w-[920px]' : 'cv:block cv:w-[640px]'}`}>{open && content}</DialogContent></Dialog>
  </>
}
