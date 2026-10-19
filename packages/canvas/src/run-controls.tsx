import { Button } from '@civic/shell/ui/button'
import { NativeSelect } from '@civic/shell/ui/native-select'
import { useEffect, useState } from 'react'
import { reviewApi } from './review-api'
import type { RunStatus } from './adapter'
import { ViewportControls } from './viewport-controls'
import type { PreviewViewport } from './viewport-presets'
import type { ViewportController } from './use-preview-viewport'

/** Controls for a live preview: its viewport, its run (account, connection, saved steps, reopening) and its recording. */
/** `runSection` is off where a host page offers its own run controls. */
export function RunControls({ frame, onViewportChange, viewportController, runSection = true }: { frame: HTMLIFrameElement | null; onViewportChange?: (viewport: PreviewViewport) => void; viewportController?: ViewportController; runSection?: boolean }) {
  const [available, setAvailable] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [count, setCount] = useState(0)
  const [run, setRun] = useState<RunStatus | null>(null)
  const runtime = () => frame?.contentWindow?.reviewPreview
  const observational = runtime()?.mode === 'live-read-only'
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
    if (action === 'replay') {
      // Each finished replay is kept as run evidence CIVIC can import (decision 0009); a replay
      // refused before it starts, such as one for another source, proves nothing either way.
      let receipt: { verified: number }
      try { receipt = await bridge.replay(tape) }
      catch (error) {
        const diverged = bridge.replayMismatch?.()
        if (diverged) await reviewApi('replays', { tape, outcome: 'fail', divergedAt: diverged.step, message: (error as Error).message }).catch(() => {})
        throw error
      }
      await reviewApi('replays', { tape, outcome: 'pass', verified: receipt.verified })
      setStatus(`Replay verified: ${receipt.verified} actions, routes and effect receipts. Kept as run evidence for CIVIC.`)
    }
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
    <ViewportControls frame={frame} onChange={onViewportChange} controller={viewportController} />
    {runSection && run && <section className="rh-run-controls" aria-label="Isolated run">
      <h3>Isolated run</h3>
      {run.accounts.length > 1 && <label>Synthetic account<NativeSelect className="cv:w-full" aria-label="Synthetic account" disabled={busy} value={run.account ?? ''} onChange={(event) => void command('identity', event.target.value)}>{run.accounts.map((account) => <option key={account} value={account}>{account}</option>)}</NativeSelect></label>}
      <Button variant="outline" disabled={busy} onClick={() => void command('connection', !run.connected)}>{run.connected ? 'Disconnect app' : 'Reconnect app'}</Button>
      <Button variant="outline" disabled={busy} onClick={() => void reopen()}>Reopen app</Button>
      <p className="rh-muted">{run.connected ? 'Connected to its isolated data.' : 'Offline. Nothing is resent by itself; review saved steps after reconnecting.'}</p>
      {run.pending.length > 0 && <section aria-label="Saved steps"><h4>Saved steps for {run.account ?? 'this account'}</h4><p>Check what was done before resending. These steps belong to this account.</p>{run.pending.map((row) => <div key={row.id}><strong>{row.name}</strong><Button variant="outline" disabled={busy || !run.connected} onClick={() => void command('applyPending', row.id)}>Resend saved step</Button><Button variant="outline" disabled={busy} onClick={() => void command('discardPending', row.id)}>Discard saved step</Button></div>)}</section>}
    </section>}
    {available && <section aria-label="Application recording"><h3>Recorded run</h3><p>{count} actions · {observational ? 'live observation; changing backend' : 'isolated data'}</p>{!observational && <Button variant="outline" disabled={busy || count === 0} onClick={() => void perform('replay')}>{busy ? 'Working…' : 'Replay this run'}</Button>}<Button variant="outline" disabled={busy} onClick={() => void perform('save')}>Save recording</Button></section>}
    <p role="status">{status}</p>
  </>
}
