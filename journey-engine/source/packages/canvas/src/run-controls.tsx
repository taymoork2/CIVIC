import { useEffect, useState } from 'react'
import { reviewApi } from './review-api'
import type { RunStatus } from './adapter'
import { ViewportControls } from './viewport-controls'
import type { PreviewViewport } from './viewport-presets'

/** Controls for a live preview: its viewport, its run (account, connection, saved steps, reopening) and its recording. */
/** `runSection` is off where a host page offers its own run controls. */
export function RunControls({ frame, onViewportChange, runSection = true }: { frame: HTMLIFrameElement | null; onViewportChange?: (viewport: PreviewViewport) => void; runSection?: boolean }) {
  const [available, setAvailable] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [count, setCount] = useState(0)
  const [run, setRun] = useState<RunStatus | null>(null)
  const runtime = () => frame?.contentWindow?.reviewPreview
  useEffect(() => {
    const win = frame?.contentWindow
    const update = () => {
      setAvailable(Boolean(runtime()?.recording))
      try { setRun(win?.reviewRuntime?.status() ?? null) } catch { setRun(null) }
      const error = frame?.contentDocument?.getElementById('review-root')?.dataset.rehearsalRunError; if (error) setStatus(error)
      void runtime()?.recording?.().then((tape) => setCount(tape.steps.length)).catch(() => {})
    }
    update(); win?.addEventListener('rehearsal-run', update)
    const timer = setInterval(() => { try { setRun(frame?.contentWindow?.reviewRuntime?.status() ?? null) } catch { setRun(null) } }, 1000)
    return () => { win?.removeEventListener('rehearsal-run', update); clearInterval(timer) }
  }, [frame])
  const work = async (action: () => Promise<void>) => {
    setBusy(true); setStatus('')
    try { await action() } catch (error) { setStatus((error as Error).message) } finally { setBusy(false); try { setRun(frame?.contentWindow?.reviewRuntime?.status() ?? null) } catch { setRun(null) } }
  }
  const command = (name: string, value: unknown) => work(async () => {
    const live = frame?.contentWindow?.reviewRuntime
    if (!live) throw Error('Wait for the app to finish opening.')
    await live.command(name, value)
  })
  const perform = (action: 'save' | 'replay') => work(async () => {
    const bridge = runtime()
    if (!bridge?.recording || !bridge.replay) throw Error('Play a connected application first.')
    const tape = await bridge.recording()
    if (action === 'replay') { const receipt = await bridge.replay(tape); setStatus(`Replay verified: ${receipt.verified} actions, routes and effect receipts.`) }
    else {
      const saved = await reviewApi<{ id: string; url: string }>('runs', tape)
      const link = document.createElement('a'); link.href = saved.url; link.download = `civic-run-${saved.id}.json`; link.click()
      setStatus('Recording saved and downloaded. Saved reviews also include their run automatically.')
    }
  })
  // Reopening loads the same run from its journal in a fresh page, at the viewport it had.
  const reopen = () => work(async () => {
    const live = frame?.contentWindow?.reviewRuntime
    if (!live || !frame) throw Error('Wait for the app to finish opening.')
    frame.src = live.reopen()
  })
  return <>
    <ViewportControls frame={frame} onChange={onViewportChange} />
    {runSection && run && <section className="rh-run-controls" aria-label="Isolated run">
      <h3>Isolated run</h3>
      {run.accounts.length > 1 && <label>Synthetic account<select aria-label="Synthetic account" disabled={busy} value={run.account ?? ''} onChange={(event) => void command('identity', event.target.value)}>{run.accounts.map((account) => <option key={account} value={account}>{account}</option>)}</select></label>}
      <button disabled={busy} onClick={() => void command('connection', !run.connected)}>{run.connected ? 'Disconnect app' : 'Reconnect app'}</button>
      <button disabled={busy} onClick={() => void reopen()}>Reopen app</button>
      <p className="rh-muted">{run.connected ? 'Connected to its isolated data.' : 'Offline. Nothing is resent by itself; review saved steps after reconnecting.'}</p>
      {run.pending.length > 0 && <section aria-label="Saved steps"><h4>Saved steps for {run.account ?? 'this account'}</h4><p>Check what was done before resending. These steps belong to this account.</p>{run.pending.map((row) => <div key={row.id}><strong>{row.name}</strong><button disabled={busy || !run.connected} onClick={() => void command('applyPending', row.id)}>Resend saved step</button><button disabled={busy} onClick={() => void command('discardPending', row.id)}>Discard saved step</button></div>)}</section>}
    </section>}
    {available && <section aria-label="Application recording"><h3>Recorded run</h3><p>{count} actions · isolated data</p><button disabled={busy || count === 0} onClick={() => void perform('replay')}>{busy ? 'Working…' : 'Replay this run'}</button><button disabled={busy} onClick={() => void perform('save')}>Save recording</button></section>}
    <p role="status">{status}</p>
  </>
}
