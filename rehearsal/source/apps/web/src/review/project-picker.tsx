import { useEffect, useRef, useState, type FormEvent } from 'react'
import project from 'virtual:rehearsal-project'
import { projectFetch } from './project-request'
import { DiscoverySetup, type Discovery } from './discovery-setup'
import { CanvasIcon } from '@civic/shell/canvas-controls'
import './project-picker.css'

type Connection = { key: string; name: string; root: string; manifest: string; preview?: boolean; available: boolean; error?: string }
type Connections = { active: string; projects: Connection[] }
async function request<T>(input?: unknown): Promise<T> {
  const response = await projectFetch('/api/review/projects', input ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) } : undefined)
  const value = await response.json()
  if (!response.ok) throw Error(value.error ?? 'Project request failed')
  return value
}

export function ProjectPicker({ applicationRoot, blocked, activeRun }: { applicationRoot: string; blocked: boolean; activeRun: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'list' | 'existing' | 'new'>('list')
  const [connections, setConnections] = useState<Connections | null>(null)
  const [name, setName] = useState('')
  const [root, setRoot] = useState('')
  const [manifest, setManifest] = useState('')
  const [source, setSource] = useState('src')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ key: string; name: string; preview: boolean } | null>(null)
  const [discovery, setDiscovery] = useState<Discovery | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  useEffect(() => {
    if (!open) return
    dialog.current?.showModal()
    setBusy(true); setError('')
    void request<Connections>().then(setConnections).catch((error) => setError(error.message)).finally(() => setBusy(false))
  }, [open])
  const close = () => { dialog.current?.close(); setOpen(false); trigger.current?.focus() }
  const start = (next: 'existing' | 'new') => { setMode(next); setError(''); setCreated(null); setDiscovery(null); setName(''); setRoot(''); setManifest(''); setSource('src') }
  const add = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (mode === 'existing') {
        const result = await request<{ connection?: { key: string; name: string; preview: boolean }; discovery?: Discovery }>({ action: 'discover', root, manifest, source })
        if (result.discovery) { setDiscovery(result.discovery); if (!name.trim()) setName(root.split('/').filter(Boolean).at(-1) ?? 'Connected app') }
        if (result.connection) { setCreated(result.connection); setConnections(await request()) }
      } else { setCreated(await request({ action: 'add', kind: mode, name, root, manifest, source })); setConnections(await request()) }
    }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  const createConnection = async (input: Record<string, unknown>) => {
    setBusy(true); setError('')
    try { setCreated(await request({ ...input, name })); setConnections(await request()); setDiscovery(null) }
    catch (error) { if (input.action !== 'generate') setError((error as Error).message); throw error }
    finally { setBusy(false) }
  }
  const select = async (key: string) => {
    if (key === connections?.active) { close(); return }
    setBusy(true); setError('')
    try {
      await request({ action: 'select', key })
      history.replaceState(null, '', '/review')
      // A restart rotates the review session; reopen the entry before polling its index.
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        try {
          await fetch('/review', { cache: 'no-store' })
          const response = await fetch('/api/review/index', { cache: 'no-store' })
          if (response.ok && (await response.json()).project.key === key) { location.assign('/review'); return }
        } catch { /* The same local port is briefly unavailable during restart. */ }
      }
      throw Error('The connection was saved, but restart did not finish. Reload Rehearsal to retry.')
    } catch (error) { setError((error as Error).message); setBusy(false) }
  }
  const canSwitch = !blocked && (!activeRun || acknowledged)
  return <>
    <button ref={trigger} className="rh-project-trigger" aria-haspopup="dialog" onClick={() => { setMode('list'); setCreated(null); setDiscovery(null); setAcknowledged(false); setOpen(true) }} title={applicationRoot || 'Choose a project'}><span className="rh-project-name">{project.name}</span><CanvasIcon name="chevron" /></button>
    {open && <dialog ref={dialog} className="rh-project-dialog" aria-labelledby="rh-project-title" onCancel={(event) => { event.preventDefault(); if (!busy) close() }}>
      <header><div><h2 id="rh-project-title">{mode === 'list' ? 'Your projects' : mode === 'existing' ? 'Connect an existing app' : 'Start a new project'}</h2></div><button aria-label="Close project picker" disabled={busy} onClick={close}>×</button></header>
      {error && <p className="rh-project-error" role="alert">{error}</p>}
      {mode === 'list' ? <>
        <p className="rh-project-copy">Choose an app to explore its journeys and saved reviews.</p>
        <ul className="rh-project-list">{connections?.projects.map((row) => <li key={row.key}><button aria-current={row.key === connections.active ? 'true' : undefined} disabled={busy || !row.available || row.key !== connections.active && !canSwitch} onClick={() => void select(row.key)}><span><strong>{row.name}</strong><small>{row.available ? row.preview ? 'Runnable preview' : 'Inventory connection · adapter needed' : row.error}</small><code>{row.root}</code></span><span aria-hidden="true">{row.key === connections.active ? '✓' : '→'}</span></button></li>)}</ul>
        {busy && <p role="status">Connecting…</p>}
        <div className="rh-project-actions"><button onClick={() => start('existing')} disabled={busy}>Connect existing app</button><button className="rh-primary" onClick={() => start('new')} disabled={busy}>New project</button></div>
      </> : created ? <section className="rh-project-result">
        <h3>{created.name} is ready</h3><p>{created.preview ? 'Your preview connection is ready to test. Play its real screens and check the declared paths; generated navigation is synthetic until verified.' : 'Your source inventory is connected. Screens, paths and personas need a scenario registry and synthetic adapter before they can be played.'}</p>
        <dl><dt>App folder</dt><dd>{connections?.projects.find((row) => row.key === created.key)?.root}</dd><dt>Project manifest</dt><dd>{connections?.projects.find((row) => row.key === created.key)?.manifest}</dd></dl>
        <p className="rh-project-copy">{mode === 'new' ? 'This starter has a note-writing journey, a review branch and synthetic state. Adapt its source files to build your app.' : 'The app checkout has not been changed. Connection files belong to Rehearsal.'}</p>
        <div className="rh-project-actions"><button onClick={() => { setMode('list'); setCreated(null) }} disabled={busy}>All projects</button><button className="rh-primary" disabled={busy || !canSwitch} onClick={() => void select(created.key)}>{busy ? 'Opening…' : 'Open project'}</button></div>
      </section> : discovery ? <DiscoverySetup discovery={discovery} name={name} setName={setName} busy={busy} back={() => setDiscovery(null)} generate={(input) => createConnection({ ...(input as Record<string, unknown>), action: 'generate' })} inventory={() => void createConnection({ action: 'add', kind: 'existing', root, source, manifest }).catch(() => {})} /> : <form onSubmit={(event) => void add(event)}>
        <p className="rh-project-copy">{mode === 'existing' ? 'Connect a folder on the machine running Rehearsal. A phone can select that host’s folders, not its own.' : 'Create a local starter with four screens, a branching journey and captured inputs. No account or backend is required.'}</p>
        {mode === 'existing' && <label>App folder<input aria-label="App folder" autoFocus required value={root} onChange={(event) => setRoot(event.target.value)} placeholder="/absolute/path/to/your-app" autoComplete="off" /><small>Read-only source checkout. Keep product work in its own branch or worktree.</small></label>}
        <label>{mode === 'existing' ? 'Name for an unconfigured app' : 'Project name'}<input autoFocus={mode === 'new'} required={mode === 'new'} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="My project" /></label>
        {mode === 'existing' && <><label>Manifest path <span>(optional)</span><input aria-label="Manifest path" value={manifest} onChange={(event) => setManifest(event.target.value)} placeholder="rehearsal.project.json" /><small>Relative to the app folder. Existing manifests supply their own name, personas and adapter. Only connect app code you trust.</small></label><label>Source folder <span>(when there is no manifest)</span><input aria-label="Source folder" value={source} onChange={(event) => setSource(event.target.value)} placeholder="src" /><small>Relative to the app folder. Rehearsal will identify code candidates; it won’t invent a complete user journey.</small></label></>}
        <div className="rh-project-actions"><button type="button" onClick={() => setMode('list')} disabled={busy}>Back</button><button className="rh-primary" type="submit" disabled={busy}>{busy ? 'Preparing…' : mode === 'existing' ? 'Discover screens' : 'Create project'}</button></div>
      </form>}
      <footer><p>Switching reloads this shared preview on the same port. Saved reviews and proposals stay with their project. Other open tabs should be reloaded.</p>{blocked ? <p role="status">Save proposal edits and finish or retry pending captures before switching.</p> : activeRun && <label className="rh-project-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />End the current preview run when switching. Captured visits are kept.</label>}</footer>
    </dialog>}
  </>
}
