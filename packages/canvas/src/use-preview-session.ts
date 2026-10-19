import { useEffect, useRef, useState } from 'react'
import { captureScreen } from '@civic/shell/capture'
import project from 'virtual:civic-project'
import { extension } from './extension'
import { reviewApi } from './review-api'
import { replay, replayPath, type ReplayStep } from './replay'
import type { AppFlow, MapScreen } from './app-map'
import type { AdapterState } from './adapter'
import type { PreviewViewport } from './viewport-presets'

export function usePreviewSession({ flows, generic, viewport, focusScreen }: {
  flows: AppFlow[]; generic: boolean; viewport: PreviewViewport; focusScreen: (screen: MapScreen) => void
}) {
  const initialViewport = useRef(viewport)
  const previewFrame = useRef<HTMLIFrameElement>(null)
  const [preview, setPreview] = useState<MapScreen | null>(null)
  const adapterMode = generic || Boolean(preview && extension.adapterScenario?.(preview.scenario))
  const [adapterScreen, setAdapterScreen] = useState<string | null>(null)
  const [adapterVisits, setAdapterVisits] = useState<{ id: string; from: string; to: string; fields: AdapterState['fields']; screenshot?: string; error?: string }[]>([])
  const failedCaptures = useRef(new Map<string, unknown>())
  const [adapterError, setAdapterError] = useState('')
  const [queued, setQueued] = useState<MapScreen | null>(null)
  const [run, setRun] = useState(0)
  const [replaying, setReplaying] = useState<{ target: string; steps: ReplayStep[]; status: 'running' | 'done' | 'missed'; message: string } | null>(null)
  const pendingReplay = useRef<{ target: string; steps: ReplayStep[] } | null>(null)

  const saveAdapterCapture = async (id: string, input: unknown) => {
    try {
      const receipt = await reviewApi<{ screenshot: string }>('capture', input)
      failedCaptures.current.delete(id)
      setAdapterVisits((rows) => rows.map((row) => row.id === id ? { ...row, screenshot: receipt.screenshot, error: undefined } : row))
    } catch (error) {
      failedCaptures.current.set(id, input)
      setAdapterVisits((rows) => rows.map((row) => row.id === id ? { ...row, error: (error as Error).message } : row))
    }
  }
  useEffect(() => {
    if (!adapterMode || !adapterVisits.some((row) => !row.screenshot)) return
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [adapterVisits, adapterMode])
  const attachAdapter = () => {
    const win = previewFrame.current?.contentWindow
    if (!win) return
    const update = () => {
      const state = win.reviewPreview?.state?.()
      if (!state) return
      const screen = flows.flatMap((flow) => flow.screens).find((s) => s.id === state?.screen)
      if (!screen) { setAdapterError('Adapter reached an unmapped screen; register it before continuing.'); return }
      setAdapterError(''); setAdapterScreen(screen.id); focusScreen(screen)
    }
    const transition = (event: Event) => {
      const detail = (event as CustomEvent<{ from: string; to: string; action: string; origin: 'app' | 'synthetic'; state: AdapterState; html?: string }>).detail
      const runtime = win.reviewPreview, doc = previewFrame.current?.contentDocument
      if (!runtime || !doc) return
      const id = crypto.randomUUID()
      const provenance = detail.origin === 'synthetic' ? 'Synthetic navigation · state carried by CIVIC' : 'App adapter transition'
      const input = { requestId: id, kind: 'other', message: `${provenance}: ${project.name} transition ${detail.from} → ${detail.to}: ${detail.action}`, snapshot: runtime.snapshot, html: detail.html ?? captureScreen(doc), anchor: { label: 'Whole screen', x: 0, y: 0, width: 1, height: 1 }, context: { ...runtime.config, scenario: detail.from, screen: detail.from, viewport: { width: previewFrame.current!.clientWidth, height: previewFrame.current!.clientHeight }, state: { dialogs: [detail.state.title, provenance], tabs: [], fields: detail.state.fields } } }
      setAdapterVisits((rows) => [...rows, { id, from: detail.from, to: detail.to, fields: detail.state.fields }])
      void saveAdapterCapture(id, input)
    }
    win.addEventListener('rehearsal-state', update)
    win.addEventListener('rehearsal-transition', transition)
    win.addEventListener('pagehide', () => { win.removeEventListener('rehearsal-state', update); win.removeEventListener('rehearsal-transition', transition) }, { once: true })
    update()
    const pending = pendingReplay.current
    if (pending) {
      pendingReplay.current = null
      const label = (id: string) => flows.flatMap((flow) => flow.screens).find((screen) => screen.id === id)?.label ?? id
      void replay({ document: () => previewFrame.current?.contentDocument ?? undefined, screen: () => previewFrame.current?.contentWindow?.reviewPreview?.state?.()?.screen }, pending.steps, label).then((result) => {
        setReplaying({ ...pending, status: result.miss ? 'missed' : 'done', message: result.miss ?? `Replayed ${result.done} declared step${result.done === 1 ? '' : 's'} from ${label(pending.steps[0]?.from ?? pending.target)} to ${label(pending.target)}.` })
      })
    }
  }
  const replayFromStart = (screen: MapScreen) => {
    const flow = flows.find((entry) => entry.screens.some((node) => node.id === screen.id))!
    const start = flow.screens[0]!
    const steps = replayPath(flows.flatMap((entry) => entry.screens), start.id, screen.id)
    if (!steps) { setReplaying({ target: screen.id, steps: [], status: 'missed', message: `No declared path reaches ${screen.label} from ${start.label}, so there is nothing to replay.` }); return }
    if (previewFrame.current?.contentWindow?.reviewPreview?.state?.()?.dirty) { setReplaying({ target: screen.id, steps, status: 'missed', message: 'The open preview has an unsaved draft. Save or cancel it first; a replay starts a fresh run.' }); return }
    pendingReplay.current = { target: screen.id, steps }
    setReplaying({ target: screen.id, steps, status: 'running', message: `Replaying ${steps.length} declared step${steps.length === 1 ? '' : 's'} from ${start.label}…` })
    initialViewport.current = viewport; focusScreen(start); setQueued(null); setAdapterError(''); setAdapterScreen(start.id); setPreview(start); setRun((count) => count + 1)
  }

  const start = (screen: MapScreen, fresh = false) => {
    initialViewport.current = viewport; setAdapterScreen(screen.id); setPreview(screen)
    if (fresh) setRun(count => count + 1)
  }
  const request = (screen: MapScreen) => {
    if (preview && (adapterMode ? adapterScreen : preview.id) !== screen.id) setQueued(screen)
    else if (!preview) start(screen)
  }
  const replace = (blocked: boolean) => { if (!blocked && queued) { start(queued); setQueued(null) } }
  return {
    preview, previewFrame, initialViewport, adapterMode, adapterScreen, adapterVisits, adapterError, queued, run, replaying,
    attachAdapter, replayFromStart, start, request, replace,
    cancelReplacement: () => setQueued(null),
    refreshLegacy: () => setPreview(current => current ? { ...current } : null),
    retryCapture: (id: string) => saveAdapterCapture(id, failedCaptures.current.get(id)),
  }
}
export type PreviewSession = ReturnType<typeof usePreviewSession>
