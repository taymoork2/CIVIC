import { useRef, useState } from 'react'
import type { AdapterState } from '../adapter.ts'
import type { CanvasExtension, GuidedSession } from '../extension.ts'

// A connector's guided run, for the canvas's own checks: the Pantry example's "Keep the pantry" flow played
// continuously in one frame, following the frame's standard state and transition events. Laundry's towel
// run is the full version, with presentation proposals; this proves the seam without it.
const flowId = 'flow:Keep the pantry'
const labels: Record<string, string> = { 'pantry.shelf': 'Shelf', 'pantry.add': 'Add an item' }

function useGuidedRun(_selection: string | null, enabled: boolean): GuidedSession {
  const [start, setStart] = useState<string | null>(null)
  const [state, setState] = useState<AdapterState | null>(null)
  const [visits, setVisits] = useState<GuidedSession['visits']>([])
  const [generation, setGeneration] = useState(0)
  const [mode, setMode] = useState<'play' | 'edit'>('play')
  const frame = useRef<HTMLIFrameElement>(null)
  const follow = useRef(true)
  const run = useRef(crypto.randomUUID())
  const current = state?.screen ?? start ?? 'pantry.shelf'
  const attach = () => {
    const win = frame.current?.contentWindow
    if (!win || !enabled) return
    win.addEventListener('rehearsal-state', (event) => setState((event as CustomEvent<AdapterState>).detail))
    win.addEventListener('rehearsal-transition', (event) => {
      const { from, to } = (event as CustomEvent<{ from: string; to: string }>).detail
      setVisits((rows) => [...rows, { runId: run.current, from, to }])
    })
  }
  const requestStart = (id: string) => {
    if (start && id === current) return
    run.current = crypto.randomUUID()
    setStart(id); setState(null); setGeneration((value) => value + 1); follow.current = true
  }
  return {
    flowId, labels: { play: 'Play pantry run', summary: 'Shelf and adding, played continuously', live: 'Live pantry run', retained: 'The pantry run stays separate.' },
    running: start !== null, current, currentNode: { id: current }, ...(labels[current] ? { active: { label: labels[current]! } } : {}),
    generation, src: `/review-frame.html?scenario=${start ?? 'pantry.shelf'}`, frame, follow, attach,
    mode, setMode, setProperty() {}, candidate: false, dirtyProposal: false, proposal: { version: 0 }, saving: false,
    state: state && { dirty: state.dirty, pending: state.pending }, visits, runId: run.current, snapshots: new Map(),
    play: () => setMode('play'), requestStart, canStartAt: (id) => id in labels, notices: null,
    inspector: <p>Guided pantry run · {visits.filter((visit) => visit.runId === run.current).length} visits</p>,
  }
}

const extension: CanvasExtension = { guidedFlow: flowId, useGuidedSession: useGuidedRun }
export default extension
