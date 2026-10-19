import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from 'react'
import { appFlows, crossFlowEdges, flowEdges, flowAtCenter, screenAtCenter, overviewFlows, screenSize, type MapScenario, type MapScreen } from './app-map'
import { AppOverview, overviewConnections } from './app-overview'
import { FixturePicture, fixtureURL } from './fixture-picture'
import { reviewApi } from './review-api'
import { extension, useGuidedSession } from './extension'
import project from 'virtual:civic-project'
import { captureScreen } from '@civic/shell/capture'
import type { AdapterState } from './adapter'
import { ReviewPanel, type ReviewTarget } from './review-panel'
import type { ReviewSnapshot } from './adapter'
import { ConnectionPaths } from './connection-paths'
import { ConnectionLegend } from './connection-legend'
import { connectionBounds, connectionBundles, type ConnectionBundle, type RoutedConnection } from './connection-routing'
import { SharedNavigation } from './shared-navigation'
import { JourneyOutline } from './journey-outline'
import { DesktopProjectTabs, useDesktopProjects } from './desktop-project-tabs'
import { ContractPanel } from './contract-panel'
import { CoveragePanel, useCoverage } from './coverage-panel'
import type { ScenarioEvidence } from '@civic/shell/contract'
import { useCanvasCamera } from '@civic/shell/use-canvas-camera'
import { revealNavigation } from '@civic/shell/reveal-navigation'
import { CanvasControls } from '@civic/shell/canvas-controls'
import { ChevronRight, PanelLeft, PanelRight, Pencil, Play, Search, Settings2, X, FolderOpen, GitBranch, Maximize, Hand, MousePointer2, Monitor, Plus, Minus } from '@civic/shell/icons'
import { Button } from '@civic/shell/ui/button'
import { IconButton } from '@civic/shell/ui/icon-button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@civic/shell/ui/empty'
import { Skeleton } from '@civic/shell/ui/skeleton'
import { Alert, AlertDescription } from '@civic/shell/ui/alert'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@civic/shell/ui/tabs'
import { ViewportPicker, DetailsMenu, workspacePanels, type WorkspacePanel } from './workspace-tools'
import { ProjectPicker, type ProjectPickerHandle } from './project-picker'
import { WorkspaceSearch, type WorkspaceAction } from './workspace-search'
import { replay, replayPath, type ReplayStep } from './replay'
import { RunControls } from './run-controls'
import { viewportPresets, type PreviewViewport } from './viewport-presets'
import { usePreviewViewport } from './use-preview-viewport'
import { supportsPreview, useFrameReadiness } from './connection-readiness'
import '@civic/shell/styles/canvas.css'
import '@civic/shell/styles/app-canvas.css'
import '@civic/shell/styles/canvas-chrome.css'

export function AppCanvas() {
  const live = project.mode === 'live-read-only'
  const generic = project.adapter === 'module' || live || Boolean(project.runtime && !extension.useGuidedSession)
  const viewportController = usePreviewViewport({
    getFrame: () => previewFrame.current ?? guided.frame.current,
    storageKey: `civic:${project.app?.id ?? project.id}:viewport`, fallbackStorageKey: `civic:${project.key}:viewport`,
    initial: { width: live ? 1440 : 393, height: live ? 900 : 852, theme: 'light', textScale: 1 },
  })
  const { viewport, busy: viewportBusy, error: viewportError } = viewportController
  const initialViewport = useRef(viewport)
  const changeViewport = ({ width, height, preset }: Pick<PreviewViewport, 'width' | 'height' | 'preset'>) => viewportController.change({ width, height, preset })
  const screenStyle = (screen: MapScreen): CSSProperties => ({ left: screen.x, top: screen.y, width: screenSize(screen).width, '--screen-width': `${screenSize(screen).width}px`, '--screen-preview-height': `${screenSize(screen).previewHeight}px` } as CSSProperties)
  const [scenarios, setScenarios] = useState<(MapScenario & ScenarioEvidence)[]>([])
  const [source, setSource] = useState('')
  const [fixtureSnapshot, setFixtureSnapshot] = useState<ReviewSnapshot | null>(null)
  const [pathTarget, setPathTarget] = useState<ReviewTarget | null>(null)
  const [appSelected, setAppSelected] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const projectPicker = useRef<ProjectPickerHandle>(null)
  const desktop = useDesktopProjects()
  const desktopPickerTrigger = useRef<HTMLButtonElement>(null)
  const searchTrigger = useRef<HTMLButtonElement>(null)
  const [outline, setOutline] = useState(() => window.innerWidth >= 1180)
  const [outlineQuery, setOutlineQuery] = useState('')
  const [focused, setFocused] = useState(extension.guidedFlow ?? '')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [viewed, setViewed] = useState<string | null>(null)
  const [overview, setOverview] = useState(false)
  const [canvasDetail, setCanvasDetail] = useState(() => { try { return localStorage.getItem('rehearsal-canvas-detail') === 'all' ? 'all' : 'compact' } catch { return 'compact' } })
  const flows = useMemo(() => appFlows(generic ? scenarios.map(row => ({ ...row, viewport: { width: viewport.width, height: viewport.height } })) : scenarios, project), [scenarios, generic, viewport.width, viewport.height])
  const compactFlows = useMemo(() => overviewFlows(flows), [flows])
  const crossEdges = useMemo(() => crossFlowEdges(flows), [flows])
  const internalEdges = useMemo(() => Object.fromEntries(flows.map((flow) => [flow.id, flowEdges(flow)])), [flows])
  const overviewEdges = useMemo(() => overviewConnections(compactFlows), [compactFlows])
  const sharedPaths = useMemo(() => connectionBundles(overview ? overviewEdges : [...Object.values(internalEdges).flat(), ...crossEdges]), [overview, overviewEdges, internalEdges, crossEdges])
  const [bundleSelection, setBundleSelection] = useState<string | null>(null)
  const displayedFlows = overview ? compactFlows : flows
  const { width: detailWidth, height: detailHeight } = connectionBounds(flows, crossEdges)
  const { width: overviewWidth, height: overviewHeight } = connectionBounds(compactFlows, overviewEdges)
  const worldHeight = overview ? overviewHeight : detailHeight
  const worldWidth = overview ? overviewWidth : detailWidth
  const { stage, camera, setCamera, pan, setPan, panning, changeZoom, controls, size } = useCanvasCamera({ x: 20, y: 20, zoom: .25 }, { width: worldWidth, height: worldHeight })
  const zoom = camera.zoom
  const [preview, setPreview] = useState<MapScreen | null>(null)
  const browsingLive = live && (!preview || scenarios.find(row => row.id === preview.scenario)?.preview === 'live-read-only')
  const previewLabel = browsingLive ? 'Live app · browse only' : 'Private synthetic preview'
  const adapterMode = generic || Boolean(preview && extension.adapterScenario?.(preview.scenario))
  const [adapterScreen, setAdapterScreen] = useState<string | null>(null)
  const [adapterVisits, setAdapterVisits] = useState<{ id: string; from: string; to: string; fields: AdapterState['fields']; screenshot?: string; error?: string }[]>([])
  const failedCaptures = useRef(new Map<string, unknown>())
  const [adapterError, setAdapterError] = useState('')
  const [queued, setQueued] = useState<MapScreen | null>(null)
  // Replay from start (step 6): a fresh run walks declared paths to the selected screen.
  const [run, setRun] = useState(0)
  const [replaying, setReplaying] = useState<{ target: string; steps: ReplayStep[]; status: 'running' | 'done' | 'missed'; message: string } | null>(null)
  const pendingReplay = useRef<{ target: string; steps: ReplayStep[] } | null>(null)
  const [pane, setPane] = useState<'inspect' | 'review' | 'contract' | 'coverage' | null>(() => { const params = new URLSearchParams(location.search); return params.has('feedback') || params.get('view') === 'review' ? 'review' : params.get('view') === 'contract' ? 'contract' : null })
  const [applicationRoot, setApplicationRoot] = useState('')
  const bridge = useCoverage((index) => { setScenarios(index.scenarios); setSource(index.fixtureSource); setFixtureSnapshot(index); setApplicationRoot(index.connection?.applicationRoot ?? '') })
  const proposals = bridge.data?.candidates.filter((c) => c.targetPresent && !c.acknowledged).length ?? 0
  const discovered = scenarios.some((scenario) => scenario.discovery)
  const guided = useGuidedSession(viewed, !generic)
  const blocked = guided.saving || guided.dirtyProposal || !!guided.state?.pending || !generic && guided.visits.some(row => !row.capture) || adapterVisits.some(row => !row.screenshot)
  const previewFrame = useRef<HTMLIFrameElement>(null)
  const frameReadiness = useFrameReadiness(() => previewFrame.current ?? guided.frame.current, project.key, fixtureSnapshot?.revision.source ?? '')
  const navigator = useRef<HTMLElement>(null)
  const initialized = useRef(false)
  const cameraNavigation = useRef(false)
  useEffect(() => { revealNavigation(navigator.current) }, [focused, viewed, expanded, size.width, size.height])
  useEffect(() => { if (bundleSelection && outline) navigator.current?.querySelector(`[data-shared-path="${CSS.escape(bundleSelection)}"]`)?.scrollIntoView({ block: 'nearest' }) }, [bundleSelection, outline])
  useEffect(() => {
    if (!cameraNavigation.current) return
    const canvas = stage.current; if (!canvas?.clientWidth || !canvas.clientHeight) return
    const x = (canvas.clientWidth / 2 - camera.x) / zoom, y = (canvas.clientHeight / 2 - camera.y) / zoom
    const flow = flowAtCenter(displayedFlows, x, y)
    if (flow && zoom >= .04) { setFocused(flow.id); setExpanded(flow.id); setViewed(!overview && zoom >= .5 ? screenAtCenter(flow, x, y)?.id ?? null : null) }
  }, [camera, displayedFlows, zoom, overview])
  const fit = (x: number, y: number, width: number, height: number) => {
    const canvas = stage.current; if (!canvas) return
    const next = Math.max(.003, Math.min(1.25, (canvas.clientWidth - 48) / width, (canvas.clientHeight - 112) / height))
    setCamera({ x: (canvas.clientWidth - width * next) / 2 - x * next, y: (canvas.clientHeight - height * next) / 2 - y * next, zoom: next }, { width: detailWidth, height: detailHeight })
  }
  useEffect(() => {
    if (!initialized.current && scenarios.length && size.width && size.height) { initialized.current = true; const params = new URLSearchParams(location.search); const target = flows.flatMap((flow) => flow.screens).find((screen) => screen.scenario === params.get('scenario') && (!params.has('care') || screen.id === `care:${params.get('care')}`)); if (target) { if (params.get('play') === '1') openScreen(target); else focusScreen(target) } else if (flows.length === 1) focus(flows[0]!.id); else fitApp() }
  }, [flows, scenarios.length, size.width, size.height])
  const focus = (id: string) => {
    cameraNavigation.current = false
    setBundleSelection(null)
    setPathTarget(null); setAppSelected(false)
    guided.follow.current = false
    const flow = flows.find((flow) => flow.id === id); if (!flow) return
    setOverview(false); setFocused(id); setExpanded(id); setViewed(null); fit(flow.x, flow.y, flow.width, flow.height)
  }
  const focusScreen = (screen: MapScreen) => {
    cameraNavigation.current = false
    setBundleSelection(null)
    setPathTarget(null); setAppSelected(false)
    guided.follow.current = false
    const flow = flows.find((entry) => entry.screens.some((node) => node.id === screen.id)); if (!flow) return
    setOverview(false); setFocused(flow.id); setExpanded(flow.id); setViewed(screen.id)
    fit(flow.x + 36 + screen.x!, flow.y + 132 + screen.y!, screenSize(screen).width, screenSize(screen).height)
  }
  const openScreen = (screen: MapScreen) => {
    if (preview?.id === screen.id && frameReadiness.state === 'failed') {
      if (!blocked) { initialViewport.current = viewport; setRun(count => count + 1) }
      return
    }
    const flow = flows.find((entry) => entry.screens.some((node) => node.id === screen.id))!
    focusScreen(screen)
    if (!generic && flow.id === guided.flowId) {
      if (!guided.running) guided.requestStart(screen.id)
      else if (screen.id !== guided.current) guided.requestStart(screen.id)
      guided.follow.current = screen.id === guided.current || !guided.running
    } else if (preview && (adapterMode ? adapterScreen : preview.id) !== screen.id) setQueued(screen)
    else if (!preview) { initialViewport.current = viewport; setAdapterScreen(screen.id); setPreview(screen) }
  }
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

  const focusedFlow = flows.find((flow) => flow.id === focused)
  const selectedScreen = focusedFlow?.screens.find((screen) => screen.id === viewed)
  const fitApp = (detail = canvasDetail) => {
    cameraNavigation.current = false
    setBundleSelection(null)
    const canvas = stage.current; if (!canvas) return
    setPathTarget(null); setAppSelected(true)
    guided.follow.current = false; setViewed(null); setOverview(detail === 'compact')
    const width = detail === 'all' ? detailWidth : overviewWidth, height = detail === 'all' ? detailHeight : overviewHeight
    const next = Math.max(detail === 'all' ? .18 : .35, Math.min(.9, (canvas.clientWidth - 48) / width, (canvas.clientHeight - 112) / height))
    setCamera({ x: width * next > canvas.clientWidth - 48 ? 24 : (canvas.clientWidth - width * next) / 2, y: height * next > canvas.clientHeight - 112 ? 40 : (canvas.clientHeight - height * next) / 2, zoom: next }, { width, height })
  }
  const fitSelected = () => selectedScreen ? focusScreen(selectedScreen) : focus(focused)
  useEffect(() => { if (initialized.current && viewed) fitSelected() }, [viewport.width, viewport.height])
  const previousWindowWidth = useRef(window.innerWidth)
  useEffect(() => {
    const previous = previousWindowWidth.current; previousWindowWidth.current = window.innerWidth
    if (previous !== window.innerWidth && size.width && initialized.current && viewed && !cameraNavigation.current) fitSelected()
  }, [size.width])
  const interactScreen = (screen: MapScreen) => {
    focusScreen(screen)
    const flow = flows.find((entry) => entry.screens.some((node) => node.id === screen.id)), element = stage.current
    if (flow && element) setCamera({ x: element.clientWidth / 2 - 135.5 - flow.x - 36 - screen.x!, y: 20 - flow.y - 132 - screen.y!, zoom: 1 })
  }
  const guidedFlow = flows.find((flow) => flow.id === guided.flowId)
  const liveGuidedScreen = guidedFlow?.screens.find((screen) => screen.id === guided.currentNode.id)
  const guidedSelected = !generic && focused === guided.flowId && selectedScreen !== undefined
  const resume = () => {
    if (liveGuidedScreen) { focusScreen(liveGuidedScreen); guided.follow.current = true }
  }
  useEffect(() => {
    if (guided.running && guided.follow.current && guided.active && liveGuidedScreen) {
      focusScreen(liveGuidedScreen); guided.follow.current = true
    }
  }, [guided.current, guided.generation, guided.running])
  const genericLive = adapterMode ? flows.flatMap((flow) => flow.screens).find((s) => s.id === adapterScreen) : undefined
  const genericFlow = genericLive && flows.find((f) => f.screens.some((s) => s.id === genericLive.id))
  const selectedLiveFrame = guidedSelected && viewed === guided.current ? guided.frame.current : (adapterMode ? adapterScreen : preview?.id) === viewed ? previewFrame.current : null
  const liveScreen = guided.running ? liveGuidedScreen : undefined
  const reviewTarget: ReviewTarget = pathTarget ?? (appSelected ? { kind: 'app', id: 'app', label: `${project.name} journey` } : selectedScreen ? { kind: 'screen', id: selectedScreen.id, screen: selectedScreen.id, flow: focused, label: selectedScreen.label } : { kind: 'flow', id: focused, flow: focused, label: focusedFlow?.label ?? focused })
  const focusReviewTarget = (target: ReviewTarget) => {
    if (target.kind === 'app') { fitApp(); return }
    if (target.kind === 'flow') { focus(target.id); return }
    const flow = flows.find((flow) => flow.screens.some((screen) => screen.id === (target.from ?? target.screen ?? target.id)))
    const screen = flow?.screens.find((screen) => screen.id === (target.from ?? target.screen ?? target.id))
    if (!flow || !screen) return
    if (target.kind !== 'path') { focusScreen(screen); return }
    const edge = screen.edges.find((edge) => edge.destination === target.to && edge.action === target.action)
    const destinationFlow = flows.find((flow) => flow.screens.some((screen) => screen.id === target.to))
    const destination = destinationFlow?.screens.find((screen) => screen.id === target.to)
    if (!edge || !destination || !destinationFlow) return
    focusScreen(screen)
    const a = { x: flow.x + 36 + screen.x!, y: flow.y + 132 + screen.y! }, b = { x: destinationFlow.x + 36 + destination.x!, y: destinationFlow.y + 132 + destination.y! }
    const points = internalEdges[flow.id]?.find(path => path.id === target.id)?.points.map(point => ({ x: flow.x + 36 + point.x, y: flow.y + 132 + point.y })) ?? crossEdges.find(path => path.id === target.id)?.points ?? []
    const left = Math.min(a.x, b.x, ...points.map(point => point.x)) - 40, top = Math.min(a.y, b.y, ...points.map(point => point.y)) - 40
    fit(left, top, Math.max(a.x + screenSize(screen).width, b.x + screenSize(destination).width, ...points.map(point => point.x)) - left + 40, Math.max(a.y + screenSize(screen).height, b.y + screenSize(destination).height, ...points.map(point => point.y)) - top + 40)
    setPathTarget({ kind: 'path', id: target.id, flow: flow.id, screen: screen.id, from: screen.id, to: destination.id, label: `${screen.label} → ${destination.label}`, action: edge.action, when: edge.when, returnTo: edge.returnTo }); setPane('review')
  }
  const selectConnection = (edge: RoutedConnection) => {
    focusReviewTarget({ kind: 'path', id: edge.id, from: edge.from, to: edge.to, action: edge.action, label: edge.action })
  }
  const desktopFocus = useEffectEvent((id: string) => {
    const screen = flows.flatMap(flow => flow.screens).find(screen => screen.scenario === id)
    if (screen) { setOutlineQuery(''); focusScreen(screen) }
  })
  useEffect(() => window.civicDesktop?.onFocusScenario(id => desktopFocus(id)), [])
  const selectBundle = (group: ConnectionBundle) => {
    setPathTarget(null)
    const flow = flows.find(flow => flow.screens.some(screen => screen.id === group.members[0]!.from))
    if (flow) { setFocused(flow.id); setExpanded(flow.id) }
    setOutlineQuery(''); setOutline(true); setBundleSelection(group.id)
  }
  const observed = (edge: RoutedConnection) => guided.visits.some(visit => visit.runId === guided.runId && visit.from === edge.from && visit.to === edge.to)
  const selectedBundle = sharedPaths.find(group => group.id === bundleSelection)
  const playSelection = () => { if (guidedSelected) guided.play(); if (selectedScreen && (!guidedSelected || !guided.running)) openScreen(selectedScreen) }
  const failedPreview = frameReadiness.state === 'failed' && Boolean(preview && preview.id === selectedScreen?.id)
  const activeFrame = previewFrame.current ?? guided.frame.current
  const viewportUnavailable = Boolean(activeFrame && !supportsPreview(activeFrame.contentWindow?.reviewPreview, 'resize'))
  const viewportReason = viewportUnavailable ? activeFrame?.contentWindow?.reviewPreview?.capabilities?.reason ?? (frameReadiness.state === 'ready' ? 'This preview does not support resizing.' : frameReadiness.reason ?? 'Opening preview…') : undefined
  const changeDetail = (next: string) => { setCanvasDetail(next); try { localStorage.setItem('rehearsal-canvas-detail', next) } catch {} fitApp(next) }
  const zoomTo = (value: number) => { cameraNavigation.current = true; guided.follow.current = false; changeZoom(value) }
  const chooseTool = (value: boolean) => { guided.follow.current = false; setPan(value); stage.current?.focus({ preventScroll: true }) }
  const searchActions: WorkspaceAction[] = [
    ...workspacePanels.map(({ value, label, icon }) => ({ id: `panel:${value}`, label, icon, keywords: value === 'inspect' ? 'details recording replay run controls' : value === 'coverage' ? 'gaps proposals evidence' : 'details', run: () => setPane(value) })),
    { id: 'fit-app', label: 'All journeys', keywords: 'overview map fit app', icon: Maximize, run: () => fitApp() },
    { id: 'versions', label: 'Projects & versions', keywords: 'branches worktrees drafts design switch project', icon: GitBranch, opensDialog: true, run: () => projectPicker.current?.open('work') },
    { id: 'sources', label: 'Manage connections', keywords: 'sources figma github repository settings', icon: Settings2, opensDialog: true, run: () => projectPicker.current?.open('sources') },
    { id: 'play', label: 'Play selected screen', icon: Play, disabled: !selectedScreen || guided.saving || generic && !project.preview, run: playSelection },
    { id: 'fit-selection', label: 'Fit selected screen', icon: Maximize, run: fitSelected },
    { id: 'fit-flow', label: 'Fit whole journey', icon: Maximize, run: () => focus(focused) },
    { id: 'zoom-in', label: 'Zoom in', icon: Plus, run: () => zoomTo(Math.min(2, zoom * 1.25)) },
    { id: 'zoom-out', label: 'Zoom out', icon: Minus, run: () => zoomTo(Math.max(.003, zoom * .8)) },
    { id: 'zoom-actual', label: 'Zoom to 100%', keywords: 'actual size', icon: Maximize, run: () => zoomTo(1) },
    { id: 'outline', label: outline ? 'Hide journey outline' : 'Show journey outline', keywords: 'left rail sidebar', icon: PanelLeft, run: () => setOutline(!outline) },
    { id: 'close-details', label: 'Close details', keywords: 'right rail sidebar', icon: PanelRight, disabled: !pane, run: () => setPane(null) },
    { id: 'select-tool', label: 'Select tool', icon: MousePointer2, run: () => chooseTool(false) },
    { id: 'pan-tool', label: 'Pan tool', keywords: 'hand', icon: Hand, run: () => chooseTool(true) },
    { id: 'compact', label: 'Show compact flows', icon: Monitor, run: () => changeDetail('compact') },
    { id: 'all-screens', label: 'Show all screens', icon: Monitor, run: () => changeDetail('all') },
    ...viewportPresets.map(row => ({ id: `viewport:${row.id}`, label: `${row.name} viewport`, keywords: `view device size responsive ${row.width} ${row.height}`, icon: Monitor, disabled: !generic || viewportBusy || viewportUnavailable, run: () => { void changeViewport({ ...row, preset: row.id }) } })),
    { id: 'edit-proposal', label: 'Edit proposal', icon: Pencil, disabled: !guidedSelected, run: () => { guided.setMode('edit'); setPane('inspect') } },
    { id: 'connect', label: 'Connect existing app', icon: FolderOpen, opensDialog: true, run: () => projectPicker.current?.open('existing') },
    { id: 'new-project', label: 'New project', icon: FolderOpen, opensDialog: true, run: () => projectPicker.current?.open('new') },
  ]
  return <main className="rehearsal app-rehearsal" data-application-root={applicationRoot} data-preview-state={frameReadiness.state} data-preview-source={frameReadiness.source}>
      <WorkspaceSearch open={searchOpen} setOpen={setSearchOpen} name={project.app?.name ?? project.name} flows={flows} actions={searchActions} loading={!bridge.data && !bridge.error} frame={selectedLiveFrame} canvas={stage} trigger={searchTrigger} focusFlow={id => { setOutlineQuery(''); focus(id); if (window.innerWidth < 1180) setOutline(false) }} focusScreen={screen => { setOutlineQuery(''); focusScreen(screen); if (window.innerWidth < 1180) setOutline(false) }} />
      <header className="rh-brand">
        {!window.civicDesktop && <strong>CIVIC</strong>}
        {window.civicDesktop && <DesktopProjectTabs state={desktop} pickerTrigger={desktopPickerTrigger} openPicker={() => projectPicker.current?.open('work')} />}
        <ProjectPicker ref={projectPicker} readiness={frameReadiness} hideTrigger={Boolean(window.civicDesktop)} returnFocus={desktopPickerTrigger} tabDirty={blocked || guided.running || !!preview} onSearch={() => setSearchOpen(true)} searchOpen={searchOpen} selectedScreen={scenarios.find(row => row.id === selectedScreen?.scenario)} focusScreen={id => { const screen = flows.flatMap(flow => flow.screens).find(screen => screen.scenario === id); if (screen) { initialViewport.current = viewport; focusScreen(screen); setAdapterScreen(screen.id); setPreview(screen); setRun(count => count + 1) } }} blocked={blocked} activeRun={guided.running || !!preview} />
        <div className="civic-workspace-actions">
          <IconButton ref={searchTrigger} icon={Search} label="Search this project" shortcut="⌘K" onClick={() => setSearchOpen(true)} />
          <Button aria-label={failedPreview ? 'Retry preview' : 'Play'} aria-pressed={!guidedSelected || guided.mode === 'play'} disabled={guided.saving || generic && !project.preview || failedPreview && blocked} onClick={playSelection}><Play aria-hidden="true" /><span className="civic-play-label">{failedPreview ? 'Retry' : 'Play'}</span></Button>
          {(guidedSelected || guided.mode === 'edit') && <IconButton icon={Pencil} label="Edit proposal" aria-pressed={guidedSelected && guided.mode === 'edit'} disabled={!guidedSelected} onClick={() => { guided.setMode('edit'); setPane('inspect') }} />}
          <DetailsMenu pane={pane} setPane={setPane} proposals={proposals} />
        </div>
      </header>
      {!generic && guided.notices}{adapterError && <p role="alert" className="rh-alert">{adapterError}</p>}
      {discovered && <p className="rh-status">Synthetic navigation · state carried by CIVIC · app behavior unverified</p>}
      {bridge.error && <Alert variant="destructive" className="civic-shell-alert"><AlertDescription>{bridge.error} Checking again automatically.</AlertDescription></Alert>}{viewportError && <p role="alert" className="rh-alert">{viewportError}</p>}
      {queued && <section className="rh-confirm"><h2>Replace the open synthetic preview?</h2><p>Its unsaved draft will be replaced. {guided.labels.retained}</p><Button variant="outline" onClick={() => { initialViewport.current = viewport; setAdapterScreen(queued.id); setPreview(queued); setQueued(null) }}>Open selected screen</Button><Button variant="outline" onClick={() => setQueued(null)}>Keep current preview</Button></section>}
      <div className={`rh-layout ${pane ? 'has-inspector' : ''} ${outline ? '' : 'outline-closed'}`}><aside id="civic-journey-outline" ref={navigator} className="rh-journeys" aria-label="App flow navigator" hidden={!outline}>
        <JourneyOutline flows={flows} sections={project.navigation} query={outlineQuery} setQuery={setOutlineQuery} focused={focused} expanded={expanded} viewed={viewed} liveScreen={guided.running ? guided.current : undefined} focus={focus} focusScreen={focusScreen} close={() => setOutline(false)} />
        <SharedNavigation flows={flows} group={selectedBundle} select={selectConnection} />
      </aside>
        <section className="rh-map-area"><div className="rh-map-bar"><IconButton icon={PanelLeft} label="Toggle journey outline" aria-controls="civic-journey-outline" aria-expanded={outline} onClick={() => setOutline(!outline)} /><nav className="rh-breadcrumb" aria-label="Canvas location"><Button variant="ghost" size="sm" onClick={() => fitApp()}>App</Button><ChevronRight className="cv:size-3 cv:shrink-0 cv:text-muted-foreground" aria-hidden="true" /><Button variant="ghost" size="sm" onClick={() => focus(focused)}>{appSelected ? 'All journeys' : focusedFlow?.label ?? 'Application map'}</Button>{selectedScreen && <><ChevronRight className="cv:size-3 cv:shrink-0 cv:text-muted-foreground" aria-hidden="true" /><Button variant="ghost" size="sm" onClick={fitSelected}>{selectedScreen.label}</Button></>}</nav><ViewportPicker viewport={viewport} busy={viewportBusy} disabled={!generic || viewportUnavailable} reason={viewportReason} changeViewport={size => void changeViewport(size)} />{guided.running && <Button variant="outline" className="rh-resume" onClick={resume}>{guided.state?.dirty ? `App draft · ${guided.active?.label ?? guided.current}` : 'Resume run'}</Button>}</div>
          {focusedFlow && !appSelected && focusedFlow.screens.length > 1 && !internalEdges[focusedFlow.id]?.length && !crossEdges.some(edge => focusedFlow.screens.some(screen => screen.id === edge.from || screen.id === edge.to)) && <div className="civic-connection-notice" role="status"><span>No paths registered for this journey.</span><Button variant="link" size="sm" onClick={() => setPane('coverage')}>Review coverage</Button></div>}{guidedSelected && guided.running && selectedScreen.id !== guided.current && <div className="rh-selection">Your run is on {guided.active?.label ?? guided.current}. <Button variant="outline" onClick={resume}>Resume run</Button><Button variant="outline" disabled={!guided.canStartAt(selectedScreen.id) || guided.state?.pending} onClick={() => guided.requestStart(selectedScreen.id)}>Start here…</Button></div>}
          <div className={`rh-canvas rh-infinite-canvas ${panning ? 'is-panning' : ''} ${zoom < .5 ? 'is-zoomed-out' : ''}`} ref={stage} aria-label="Entire application canvas" style={{ backgroundPosition: `${camera.x}px ${camera.y}px` }} {...controls} onWheelCapture={() => { cameraNavigation.current = true; guided.follow.current = false }} onPointerDownCapture={(event) => { if (panning || event.button === 1 || !(event.target as Element).closest('button,input,select,iframe')) { cameraNavigation.current = true; guided.follow.current = false; } controls.onPointerDownCapture?.(event) }}>
            {!bridge.data && !bridge.error && <div className="civic-canvas-message" role="status" aria-label="Loading project"><Skeleton className="cv:h-8 cv:w-44" /><Skeleton className="cv:h-44 cv:w-64" /><p>Loading journeys…</p></div>}{bridge.data && !scenarios.length && <Empty className="civic-canvas-message" role="status"><EmptyHeader><EmptyMedia variant="icon"><FolderOpen aria-hidden="true" /></EmptyMedia><EmptyTitle>No screens registered yet</EmptyTitle><EmptyDescription>Connect a scenario registry to explore this app’s screens and paths.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => setPane('coverage')}>Review coverage</Button></EmptyContent></Empty>}<div className="app-camera-layer"><div className="app-scene" style={{ width: worldWidth, height: worldHeight, transform: `translate(${camera.x}px, ${camera.y}px) scale(${zoom})` }}>{overview && <AppOverview flows={compactFlows} connections={overviewEdges} selectedBundle={bundleSelection} selectBundle={selectBundle} source={source} active={initialized.current && desktop.visible} focused={focused} pan={pan} focus={focus} reviewConnection={selectConnection} />}<div className="app-detail-scene" hidden={overview}>{flows.map((flow) => <section key={flow.id} className={`app-flow ${focused === flow.id ? 'is-focused' : ''}`} aria-label={`${flow.label} flow`} style={{ left: flow.x, top: flow.y, width: flow.width, height: flow.height }}><header><div><h2>{flow.label}</h2><p>{flow.screens.length} screens · {flow.screens.every((screen) => screen.partial) ? 'Partial specimens · paths unverified' : flow.id === guided.flowId ? guided.labels.summary : generic ? 'Project adapter · declared paths; scoped recordings' : 'Working fixtures · end-to-end recording not yet connected'}</p></div><button onClick={() => focus(flow.id)}>Fit whole flow</button>{flow.id === guided.flowId && <button className="rh-primary" onClick={() => guided.running ? resume() : openScreen(flow.screens[0]!)}>{guided.running ? 'Resume run' : guided.labels.play}</button>}</header>
              <svg className="app-flow-edges" width={flow.width - 72} height={flow.height - 132} aria-label={`Declared paths in ${flow.label}`}><ConnectionPaths edges={internalEdges[flow.id] ?? []} markerId={`arrow-${flow.id.replace(/[^a-z0-9]/gi, '')}`} disabled={panning} selectedPath={pathTarget?.id} selectedBundle={bundleSelection} observed={observed} select={selectConnection} selectBundle={selectBundle} /></svg>
              <div className="app-screen-grid">{flow.screens.map((screen, index) => <article key={screen.id} style={screenStyle(screen)} className={`app-screen ${viewed === screen.id ? 'is-viewed' : ''}`}><button onClick={() => focusScreen(screen)} disabled={pan}><strong>{String(index + 1).padStart(2, '0')} {screen.label}</strong><small>{flow.id === guided.flowId && liveScreen && liveScreen.id === screen.id || (adapterMode ? adapterScreen : preview?.id) === screen.id ? previewLabel : screen.partial ? 'Partial specimen' : 'Real app fixture'}</small></button>{adapterMode && genericLive?.id === screen.id ? <div className="app-screen-placeholder" aria-hidden="true" /> : flow.id === guided.flowId && liveScreen && liveScreen.id === screen.id ? <div className="app-screen-placeholder" aria-hidden="true" /> : !adapterMode && preview?.id === screen.id ? <div className="app-live-screen"><iframe ref={previewFrame} onLoad={() => setPreview((current) => current ? { ...current } : null)} title={`Live ${screen.label}`} src={`/review-frame.html?scenario=${encodeURIComponent(screen.scenario)}${extension.frameParams?.(screen.scenario).length ? `&${new URLSearchParams([...new URLSearchParams(location.search)].filter(([key]) => extension.frameParams!(screen.scenario).includes(key)))}` : ''}`} />{(zoom < .5 || viewed !== screen.id) && <button className="rh-interact-shield" onClick={() => interactScreen(screen)}>Zoom to interact</button>}</div> : source ? <button className="app-screen-picture" aria-label={`View ${screen.label} snapshot`} disabled={pan} onClick={() => focusScreen(screen)}><FixturePicture viewport={screen.viewport} active={initialized.current && desktop.visible} src={flow.id === guided.flowId && guided.snapshots.get(screen.id)?.capture || fixtureURL(screen.id, source, generic ? viewport : undefined)} alt={`${screen.label} actual screen snapshot`} /></button> : <div className="app-screen-placeholder">Loading app inventory…</div>}{viewed === screen.id && !(flow.id === guided.flowId && liveScreen?.id === screen.id) && preview?.id !== screen.id && <button className="app-play-screen" disabled={pan || generic && !project.preview || flow.id === guided.flowId && !guided.running && !guided.canStartAt(screen.id)} onClick={() => openScreen(screen)}>Play this screen</button>}</article>)}</div>
            </section>)}<svg className="app-cross-flow-edges" width={worldWidth} height={worldHeight} aria-label="Declared paths between flows"><ConnectionPaths edges={crossEdges} markerId="cross-flow-arrow" disabled={panning} selectedPath={pathTarget?.id} selectedBundle={bundleSelection} observed={observed} select={selectConnection} selectBundle={selectBundle} /></svg>{adapterMode && preview && genericLive && genericFlow && <article className="app-screen app-live-session" aria-label="Live project session" style={{ ...screenStyle(genericLive), left: genericFlow.x + 36 + genericLive.x!, top: genericFlow.y + 132 + genericLive.y! }}><button onClick={() => focusScreen(genericLive)}><strong>{genericLive.label}</strong><small>{previewLabel}</small></button><div className="app-live-screen"><iframe key={`${preview.id}:${run}`} ref={previewFrame} title={`Live ${preview.label}`} onLoad={attachAdapter} src={`/review-frame.html?${new URLSearchParams({ scenario: preview.scenario, ...Object.fromEntries([...new URLSearchParams(location.search)].filter(([key]) => ['persona', 'role', 'condition'].includes(key))), ...(initialViewport.current.preset ? { preset: initialViewport.current.preset } : {}), width: String(initialViewport.current.width), height: String(initialViewport.current.height), theme: initialViewport.current.theme, scale: String(initialViewport.current.textScale) })}`} />{(zoom < .5 || viewed !== genericLive.id) && <button className="rh-interact-shield" onClick={() => interactScreen(genericLive)}>Zoom to interact</button>}</div></article>}{liveScreen && guidedFlow && <article className="app-screen app-live-session" aria-label={guided.labels.live} style={{ left: guidedFlow.x + 36 + liveScreen.x!, top: guidedFlow.y + 132 + liveScreen.y! }}><button onClick={resume}><strong>{guided.active?.label ?? (guided.current === 'closed' ? 'Run ended' : `Unmapped screen · ${guided.current}`)}</strong><small>{guided.candidate || guided.mode === 'edit' ? `Proposal ${guided.dirtyProposal ? 'draft' : `v${guided.proposal.version}`} · not in app` : 'Live · baseline'}</small></button><div className="app-live-screen"><iframe key={guided.generation} ref={guided.frame} title={guided.labels.live} src={guided.src} onLoad={guided.attach} />{(zoom < .65 || viewed !== guided.current) && <button className="rh-interact-shield" onClick={() => { interactScreen(liveScreen); guided.follow.current = true }}>Zoom to interact</button>}{guided.mode === 'edit' && viewed === guided.current && zoom >= .65 && <button className="rh-edit-surface" aria-label="Select screen or action to edit" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); guided.setProperty((event.clientY - rect.top) / rect.height > .87 ? 'action' : 'screen'); setPane('inspect') }} />}</div></article>}</div></div></div>
          </div><CanvasControls stage={stage} pan={pan} setPan={chooseTool} zoom={zoom} changeZoom={zoomTo} fitApp={() => fitApp()} fitFlow={() => focus(focused)} fitSelection={fitSelected} /><footer className="rh-foot"><ConnectionLegend /><span>{adapterMode ? adapterVisits.length : guided.visits.length} captured visits · {browsingLive ? 'Live app · read only' : 'Private synthetic run'}</span></footer>
        </section>
        <aside id="civic-details-panel" className="rh-inspector" aria-label="Contextual panel" hidden={!pane}><div className="rh-inspector-title"><h2>{pane === 'coverage' ? 'Coverage' : pane === 'review' ? 'Review' : pane === 'contract' ? 'Product contract' : guided.mode === 'edit' && guidedSelected ? 'Edit proposal' : 'Inspect'}</h2><IconButton icon={X} label="Close panel" onClick={() => setPane(null)} /></div><Tabs value={pane ?? 'inspect'} onValueChange={value => setPane(value as WorkspacePanel)}><TabsList className="cv:w-full" aria-label="Details panel">{workspacePanels.map(item => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}</TabsList><p className="rh-panel-scope">{pane === 'coverage' ? 'App coverage' : reviewTarget.label}</p><TabsContent keepMounted value="inspect" className="rh-inspect-content"><RunControls frame={selectedLiveFrame} viewportController={viewportController} />{guidedSelected ? guided.inspector : <><p>{selectedScreen ? 'Select a screen with supported proposal properties to edit it.' : 'Select a screen to inspect its properties.'}</p>{selectedScreen && <><p>{selectedScreen.partial ? 'Partial specimen · paths unverified' : 'Working app fixture'}</p><p>Scenario: {selectedScreen.scenario}</p>{selectedScreen.routeActions?.length ? <section className="rh-route-actions"><h3>Cross-route actions</h3><p>Source bindings, not observed runs. Linked specimens represent the destination; they do not replay its parameters.</p>{selectedScreen.routeActions.map((action) => <article key={`${action.action}-${action.route}`}><h4>{action.action}</h4><p><code>{action.route}</code></p><p>{action.when}</p>{action.returnTo && <p>Return: {action.returnTo}</p>}<p>{action.status}</p>{action.destination && action.status === 'source-declared; representative preview' && <Button variant="outline" onClick={() => { const target = flows.flatMap((flow) => flow.screens).find((screen) => screen.id === action.destination); if (target) focusScreen(target) }}>View destination specimen</Button>}<a href={`/api/review/evidence?file=${encodeURIComponent(action.source)}`} target="_blank" rel="noreferrer">Source</a></article>)}</section> : null}<Button variant="outline" disabled={generic && !project.preview} onClick={() => openScreen(selectedScreen)}>Play selected screen</Button>{generic && !live && <Button variant="outline" disabled={!project.preview || replaying?.status === 'running'} onClick={() => replayFromStart(selectedScreen)}>Replay from start</Button>}{generic && replaying && <p className={replaying.status === 'missed' ? 'rh-alert' : 'rh-muted'} role={replaying.status === 'missed' ? 'alert' : 'status'}>{replaying.message}</p>}</>}</>}{adapterMode && <details><summary>Run history ({adapterVisits.length})</summary>{adapterVisits.map((visit) => <article key={visit.id}><strong>{visit.from} → {visit.to}</strong><dl className="rh-fields">{visit.fields.map((field, i) => <div key={i}><dt>{field.label}</dt><dd>{field.value || '(empty)'}</dd></div>)}</dl>{visit.screenshot ? <a href={visit.screenshot} target="_blank" rel="noreferrer">Frozen screen</a> : <p>{visit.error ?? 'Saving evidence…'}</p>}{visit.error && <Button variant="outline" onClick={() => void saveAdapterCapture(visit.id, failedCaptures.current.get(visit.id))}>Retry capture</Button>}</article>)}</details>}</TabsContent><TabsContent keepMounted value="review"><ReviewPanel project={project} selected={selectedScreen ?? null} flowScreens={focusedFlow?.screens ?? []} allScreens={flows.flatMap((flow) => flow.screens)} frame={selectedLiveFrame} target={reviewTarget} canvas={stage.current} fixture={{ source, snapshot: fixtureSnapshot, ...(generic ? { viewport } : {}) }} focus={focusReviewTarget} navigationReady={initialized.current} /></TabsContent><TabsContent keepMounted value="contract">{pane === 'contract' && <ContractPanel selected={selectedScreen ?? null} scenarios={scenarios} openReviewPane={() => setPane('review')} />}</TabsContent><TabsContent keepMounted value="coverage"><CoveragePanel bridge={bridge} focus={(scenario) => { const screen = flows.flatMap((flow) => flow.screens).find((screen) => screen.scenario === scenario); if (screen) focusScreen(screen) }} /></TabsContent></Tabs></aside>
      </div>
    </main>
}
