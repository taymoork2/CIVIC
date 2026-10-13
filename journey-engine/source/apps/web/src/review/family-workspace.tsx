import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import project from 'virtual:civic-project'
import { RunControls } from '@civic/canvas/run-controls'
import type { RunStatus } from '@civic/canvas/adapter'
import type { PreviewViewport } from '@civic/canvas/viewport-presets'
import { runtimeRequest, type RuntimeSession } from './runtime-client'
import '@/app.css'
import '@/generated/tokens.css'
import './family-workspace.css'

// Laundry's synthetic laundry day: one 1,000-piece household run that survives closing and reopening the app.
// Account switching, the connection, time and saved steps go through the platform's run commands, so they land on the run's tape.
type Saved = { run: string; source: string; path: string; disconnected: boolean; viewport?: PreviewViewport }
const storageKey = `civic:family-day:${project.key}`
const accountLabel: Record<string, string> = { owner: 'Owner · same household', member: 'Member · same household', other: 'Other account · no household access' }

export function FamilyWorkspace() {
  const frame = useRef<HTMLIFrameElement>(null)
  const [saved, setSaved] = useState<Saved | null>(() => { try { return JSON.parse(localStorage.getItem(storageKey) ?? 'null') } catch { return null } })
  const [entry, setEntry] = useState<Saved | null>(null)
  const [opened, setOpened] = useState(false), [epoch, setEpoch] = useState(0)
  const [status, setStatus] = useState<RunStatus | null>(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmReset, setConfirmReset] = useState(false)
  const [liveFrame, setLiveFrame] = useState<HTMLIFrameElement | null>(null)
  const keep = (next: Saved) => { localStorage.setItem(storageKey, JSON.stringify(next)); setSaved(next) }
  const work = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action() } catch (error) { setError((error as Error).message) } finally { setBusy(false) } }
  useEffect(() => {
    if (!opened) return
    const timer = setInterval(() => {
      const window = frame.current?.contentWindow, runtime = window?.reviewRuntime
      if (!runtime) return
      const next = runtime.status(); setStatus(next)
      setReady(window.document.getElementById('review-root')?.dataset.rehearsalReady === 'true' && !window.document.body.inert)
      if (saved && (saved.path !== next.path || saved.disconnected !== !next.connected)) keep({ ...saved, path: next.path, disconnected: !next.connected })
    }, 300)
    return () => clearInterval(timer)
  }, [opened, saved])
  const command = (name: string, value: unknown) => work(async () => {
    const runtime = frame.current?.contentWindow?.reviewRuntime
    if (!runtime) throw Error('Wait for the isolated app to finish opening.')
    await runtime.command(name, value)
    setStatus(runtime.status())
  })
  const start = () => work(async () => {
    if (frame.current?.contentDocument) frame.current.contentDocument.body.inert = true
    if (saved) await runtimeRequest({ action: 'close', run: saved.run }).catch(() => {})
    const run = await runtimeRequest<RuntimeSession>({ action: 'start', scenario: 'family.planning', persona: 'parent', role: 'owner', condition: 'normal', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, options: { pieces: 1000 } })
    const next = { run: run.id, source: run.source, path: '/laundry', disconnected: false }
    keep(next); setEntry(next); setStatus(null); setReady(false); setOpened(true); setEpoch(epoch + 1)
  })
  const close = () => work(async () => {
    if (frame.current?.contentDocument) frame.current.contentDocument.body.inert = true
    const next = frame.current?.contentWindow?.reviewRuntime?.status()
    if (saved && next) keep({ ...saved, path: next.path, disconnected: !next.connected })
    try { if (saved) await runtimeRequest({ action: 'close', run: saved.run }) }
    finally { setOpened(false); setReady(false) }
  })
  const reopen = () => work(async () => {
    if (!saved) return
    await runtimeRequest({ action: 'resume', run: saved.run }); setEntry(saved); setStatus(null); setEpoch(epoch + 1); setReady(false); setOpened(true)
  })
  const reset = () => work(async () => {
    if (!saved) return
    if (frame.current?.contentDocument) frame.current.contentDocument.body.inert = true
    setReady(false)
    await runtimeRequest({ action: 'resume', run: saved.run }); await runtimeRequest({ action: 'reset', run: saved.run })
    // Browser storage and saved steps are namespaced to this one synthetic run, never the app's or an account's own.
    const prefix = `civic:run:${project.key}:${saved.run}:`
    for (const key of Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!)) if (key.startsWith(prefix) || key === `civic:pending:${project.key}:${saved.run}`) localStorage.removeItem(key)
    const next = { ...saved, path: '/laundry', disconnected: false }
    keep(next); setEntry(next); setConfirmReset(false); setStatus(null); setReady(false); setEpoch(epoch + 1); setOpened(true)
  })
  const params = entry ? new URLSearchParams({ scenario: 'family.planning', persona: 'parent', role: 'owner', condition: 'normal', familySize: '1000', runtimeRun: entry.run, runtimePath: entry.path, disconnected: entry.disconnected ? '1' : '0' }) : null
  if (params && entry?.viewport) {
    for (const [key, value] of Object.entries({ width: entry.viewport.width, height: entry.viewport.height, theme: entry.viewport.theme, scale: entry.viewport.textScale })) params.set(key, String(value))
    if (entry.viewport.preset) params.set('preset', entry.viewport.preset)
  }
  const size = entry?.viewport ?? { width: 393, height: 852 }
  return <main className="rh-family-day">
    <header><a href="/review">CIVIC canvas</a><h1>Synthetic laundry day</h1><p>One isolated household. Real app actions; no live inventory connection.</p></header>
    {!saved ? <Button disabled={busy} onClick={start}>Start 1,000-item run</Button> : <>
      <section className="rh-family-toolbar" aria-label="Synthetic run controls">
        <strong>1,000 original pieces</strong>
        <label>Synthetic account<select aria-label="Synthetic account" disabled={!ready || busy} value={status?.account ?? 'owner'} onChange={(event) => command('identity', event.target.value)}><option value="owner">Owner</option><option value="member">Member</option><option value="other">Other account</option></select></label>
        <span>{accountLabel[status?.account ?? 'owner']}</span>
        <Button disabled={!opened || !status || busy} onClick={() => command('connection', !status?.connected)}>{status?.connected ? 'Disconnect app' : 'Reconnect app'}</Button>
        {opened ? <Button variant="outline" disabled={busy} onClick={close}>Close app</Button> : <Button disabled={busy} onClick={reopen}>Reopen app</Button>}
        <Button variant="outline" disabled={busy} onClick={() => setConfirmReset(true)}>Reset this synthetic run…</Button>
        <Button variant="outline" disabled={busy || opened} onClick={start}>Start a new 1,000-item run</Button>
        <Button variant="outline" disabled={!ready || busy || !status?.connected} onClick={() => command('time', 40)}>Advance synthetic time 40 min</Button>
      </section>
      <RunControls frame={ready && opened ? liveFrame : null} runSection={false} onViewportChange={(viewport) => keep({ ...saved, viewport })} />
      <p className="rh-family-note">Disconnect stops this app frame’s requests and aborts the ones in flight. Review controls stay connected. Reconnecting never resends saved steps by itself. Synthetic time does not mean physical washing or drying happened.</p>
      {opened && !ready && <p role="status">Opening the isolated app. Controls become available after the seed and identity are ready.</p>}
      {confirmReset && <section role="alert"><p>Discard this run’s app actions, drafts and saved steps? Reviews and proposals remain.</p><Button disabled={busy} onClick={reset}>Reset synthetic run</Button><Button variant="outline" onClick={() => setConfirmReset(false)}>Keep current run</Button></section>}
      {!!status?.pending.length && <section aria-label="Saved steps"><h2>Review saved steps for {status.account}</h2><p>Check what you did before resending. These steps belong to this account.</p>{status.pending.map((row) => <div key={row.id}><strong>{row.name}</strong><Button disabled={!ready || busy || !status.connected} onClick={() => command('applyPending', row.id)}>Resend saved step</Button><Button variant="outline" disabled={!ready || busy} onClick={() => command('discardPending', row.id)}>Discard saved step</Button></div>)}</section>}
      {opened && params && <div className="rh-responsive-stage"><iframe key={epoch} ref={(element) => { frame.current = element; setLiveFrame(element) }} title="Synthetic Laundry App" style={{ width: size.width, height: size.height }} src={`/review-frame.html?${params}`} /></div>}
    </>}
    {error && <p role="alert">{error} Your saved synthetic run is retained.</p>}
  </main>
}

createRoot(document.getElementById('review-root')!).render(<FamilyWorkspace />)
