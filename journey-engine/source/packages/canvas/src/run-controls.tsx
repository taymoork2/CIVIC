import { useEffect, useState } from 'react'
import { reviewApi } from './review-api'
import type { RuntimeRecording } from './runtime-bridge'

export function RunControls({ frame }: { frame: HTMLIFrameElement | null }) {
  const [available, setAvailable] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [count, setCount] = useState(0)
  const runtime = () => frame?.contentWindow?.reviewPreview
  useEffect(() => {
    const win = frame?.contentWindow
    const update = () => { setAvailable(Boolean(runtime()?.recording)); const error = frame?.contentDocument?.getElementById('review-root')?.dataset.rehearsalRunError; if (error) setStatus(error); void runtime()?.recording?.().then((tape) => setCount(tape.steps.length)).catch(() => {}) }
    update(); win?.addEventListener('rehearsal-run', update)
    return () => win?.removeEventListener('rehearsal-run', update)
  }, [frame])
  const perform = async (action: 'save' | 'replay') => {
    setBusy(true); setStatus('')
    try {
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
        const link = document.createElement('a'); link.href = saved.url; link.download = `rehearsal-run-${saved.id}.json`; link.click()
        setStatus('Recording saved and downloaded. Saved reviews also include their run automatically.')
      }
    } catch (error) { setStatus((error as Error).message) }
    finally { setBusy(false) }
  }
  if (!available) return null
  return <section aria-label="Application recording"><h3>Recorded run</h3><p>{count} actions · isolated data</p><button disabled={busy || count === 0} onClick={() => void perform('replay')}>{busy ? 'Working…' : 'Replay this run'}</button><button disabled={busy} onClick={() => void perform('save')}>Save recording</button><p role="status">{status}</p></section>
}
