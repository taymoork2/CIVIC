import { useEffect, useMemo, useRef, useState } from 'react'
import { appFlows, crossFlowEdges, flowEdges, flowAtCenter, screenAtCenter, journeySections, overviewFlows, type MapScenario, type MapScreen } from './app-map'
import { AppOverview } from './app-overview'
import { FixturePicture } from './fixture-picture'
import { useTowelSession, reviewApi } from './canvas'
import project from 'virtual:rehearsal-project'
import { captureScreen } from '@civic/shell/capture'
import type { AdapterState } from './adapter'
import { ReviewPanel, type ReviewTarget } from './review-panel'
import type { ReviewSnapshot } from './store'
import { SelectablePath } from './selectable-path'
import { ContractPanel } from './contract-panel'
import { CoveragePanel, useCoverage } from './coverage-panel'
import type { ScenarioEvidence } from '@civic/shell/contract'
import { useCanvasCamera } from '@civic/shell/use-canvas-camera'
import { revealNavigation } from '@civic/shell/reveal-navigation'
import { CanvasControls, CanvasIcon } from '@civic/shell/canvas-controls'
import { ProjectPicker } from './project-picker'
import '@civic/shell/styles/canvas.css'
import '@civic/shell/styles/app-canvas.css'
import '@civic/shell/styles/canvas-chrome.css'

export function AppCanvas() {
  const generic = project.adapter === 'module'
  const [scenarios, setScenarios] = useState<(MapScenario & ScenarioEvidence)[]>([])
  const [source, setSource] = useState('')
  const [fixtureSnapshot, setFixtureSnapshot] = useState<ReviewSnapshot | null>(null)
  const [pathTarget, setPathTarget] = useState<ReviewTarget | null>(null)
  const [appSelected, setAppSelected] = useState(true)
  const [query, setQuery] = useState('')
  const [outline, setOutline] = useState(() => window.innerWidth >= 1180)
  const [coverage, setCoverage] = useState('all')
  const [focused, setFocused] = useState(generic ? '' : 'towel')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [viewed, setViewed] = useState<string | null>(null)
  const [overview, setOverview] = useState(false)
  const [canvasDetail, setCanvasDetail] = useState(() => { try { return localStorage.getItem('rehearsal-canvas-detail') === 'all' ? 'all' : 'compact' } catch { return 'compact' } })
  const flows = useMemo(() => appFlows(scenarios, project), [scenarios])
  const compactFlows = useMemo(() => overviewFlows(flows), [flows])
  const crossEdges = useMemo(() => crossFlowEdges(flows), [flows])
  const internalEdges = useMemo(() => Object.fromEntries(flows.map((flow) => [flow.id, flowEdges(flow)])), [flows])
  const displayedFlows = overview ? compactFlows : flows
  const worldHeight = Math.max(0, ...displayedFlows.map((flow) => flow.y + flow.height)) + 60
  const worldWidth = Math.max(0, ...displayedFlows.map((flow) => flow.x + flow.width)) + 60
  const { stage, camera, setCamera, pan, setPan, panning, changeZoom, controls, size } = useCanvasCamera({ x: 20, y: 20, zoom: .25 }, { width: worldWidth, height: worldHeight })
  const zoom = camera.zoom
  const [preview, setPreview] = useState<MapScreen | null>(null)
  const [adapterScreen, setAdapterScreen] = useState<string | null>(null)
  const [adapterVisits, setAdapterVisits] = useState<{ id: string; from: string; to: string; fields: AdapterState['fields']; screenshot?: string; error?: string }[]>([])
  const failedCaptures = useRef(new Map<string, unknown>())
  const [adapterError, setAdapterError] = useState('')
  const [queued, setQueued] = useState<MapScreen | null>(null)
  const [pane, setPane] = useState<'inspect' | 'review' | 'contract' | 'coverage' | null>(() => { const params = new URLSearchParams(location.search); return params.has('feedback') || params.get('view') === 'review' ? 'review' : params.get('view') === 'contract' ? 'contract' : null })
  const [applicationRoot, setApplicationRoot] = useState('')
  const bridge = useCoverage((index) => { setScenarios(index.scenarios); setSource(index.fixtureSource); setFixtureSnapshot(index); setApplicationRoot(index.connection?.applicationRoot ?? '') })
  const proposals = bridge.data?.candidates.filter((c) => c.targetPresent && !c.acknowledged).length ?? 0
  const discovered = scenarios.some((scenario) => scenario.discovery)
  const towel = useTowelSession(viewed, !generic)
  const previewFrame = useRef<HTMLIFrameElement>(null)
  const navigator = useRef<HTMLElement>(null)
  const initialized = useRef(false)
  const cameraNavigation = useRef(false)
  const matches = (screen: MapScreen) => screen.label.toLowerCase().includes(query.toLowerCase()) && (coverage === 'all' || (coverage === 'partial') === screen.partial)
  useEffect(() => { revealNavigation(navigator.current) }, [focused, viewed, expanded, size.width, size.height])
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
    setCamera({ x: (canvas.clientWidth - width * next) / 2 - x * next, y: (canvas.clientHeight - height * next) / 2 - y * next, zoom: next }, { width: Math.max(0, ...flows.map((flow) => flow.x + flow.width)) + 60, height: Math.max(0, ...flows.map((flow) => flow.y + flow.height)) + 60 })
  }
  useEffect(() => {
    if (!initialized.current && scenarios.length && size.width && size.height) { initialized.current = true; const params = new URLSearchParams(location.search); const target = flows.flatMap((flow) => flow.screens).find((screen) => screen.scenario === params.get('scenario') && (!params.has('care') || screen.id === `care:${params.get('care')}`)); if (target) focusScreen(target); else fitApp() }
  }, [flows, scenarios.length, size.width, size.height])
  const focus = (id: string) => {
    cameraNavigation.current = false
    setPathTarget(null); setAppSelected(false)
    towel.follow.current = false
    const flow = flows.find((flow) => flow.id === id); if (!flow) return
    setOverview(false); setFocused(id); setExpanded(id); setViewed(null); fit(flow.x, flow.y, flow.width, flow.height)
  }
  const focusScreen = (screen: MapScreen) => {
    cameraNavigation.current = false
    setPathTarget(null); setAppSelected(false)
    towel.follow.current = false
    const flow = flows.find((entry) => entry.screens.some((node) => node.id === screen.id)); if (!flow) return
    setOverview(false); setFocused(flow.id); setExpanded(flow.id); setViewed(screen.id)
    fit(flow.x + 36 + screen.x!, flow.y + 132 + screen.y!, 271, 737)
  }
  const openScreen = (screen: MapScreen) => {
    const flow = flows.find((entry) => entry.screens.some((node) => node.id === screen.id))!
    focusScreen(screen)
    if (!generic && flow.id === 'towel') {
      if (!towel.running) towel.requestStart(screen.id)
      else if (screen.id !== towel.current) towel.requestStart(screen.id)
      towel.follow.current = screen.id === towel.current || !towel.running
    } else if (preview && (generic ? adapterScreen : preview.id) !== screen.id) setQueued(screen)
    else if (!preview) { setAdapterScreen(screen.id); setPreview(screen) }
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
    if (!generic || !adapterVisits.some((row) => !row.screenshot)) return
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [adapterVisits, generic])
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
      const detail = (event as CustomEvent<{ from: string; to: string; action: string; origin: 'app' | 'synthetic'; state: AdapterState }>).detail
      const runtime = win.reviewPreview, doc = previewFrame.current?.contentDocument
      if (!runtime || !doc) return
      const id = crypto.randomUUID()
      const provenance = detail.origin === 'synthetic' ? 'Synthetic navigation · state carried by Rehearsal' : 'App adapter transition'
      const input = { requestId: id, kind: 'other', message: `${provenance}: ${project.name} transition ${detail.from} → ${detail.to}: ${detail.action}`, snapshot: runtime.snapshot, html: captureScreen(doc), anchor: { label: 'Whole screen', x: 0, y: 0, width: 1, height: 1 }, context: { ...runtime.config, scenario: detail.from, screen: detail.from, viewport: { width: previewFrame.current!.clientWidth, height: previewFrame.current!.clientHeight }, state: { dialogs: [detail.state.title, provenance], tabs: [], fields: detail.state.fields } } }
      setAdapterVisits((rows) => [...rows, { id, from: detail.from, to: detail.to, fields: detail.state.fields }])
      void saveAdapterCapture(id, input)
    }
    win.addEventListener('rehearsal-state', update)
    win.addEventListener('rehearsal-transition', transition)
    win.addEventListener('pagehide', () => { win.removeEventListener('rehearsal-state', update); win.removeEventListener('rehearsal-transition', transition) }, { once: true })
    update()
  }

  const focusedFlow = flows.find((flow) => flow.id === focused)
  const selectedScreen = focusedFlow?.screens.find((screen) => screen.id === viewed)
  const fitApp = (detail = canvasDetail) => {
    cameraNavigation.current = false
    const canvas = stage.current; if (!canvas) return
    setPathTarget(null); setAppSelected(true)
    towel.follow.current = false; setViewed(null); setOverview(detail === 'compact')
    const displayed = detail === 'all' ? flows : compactFlows
    const width = Math.max(0, ...displayed.map((flow) => flow.x + flow.width)) + 60, height = Math.max(0, ...displayed.map((flow) => flow.y + flow.height)) + 60
    const next = Math.max(detail === 'all' ? .18 : .35, Math.min(.9, (canvas.clientWidth - 48) / width, (canvas.clientHeight - 112) / height))
    setCamera({ x: width * next > canvas.clientWidth - 48 ? 24 : (canvas.clientWidth - width * next) / 2, y: height * next > canvas.clientHeight - 112 ? 40 : (canvas.clientHeight - height * next) / 2, zoom: next }, { width, height })
  }
  const fitSelected = () => selectedScreen ? focusScreen(selectedScreen) : focus(focused)
  const interactScreen = (screen: MapScreen) => {
    focusScreen(screen)
    const flow = flows.find((entry) => entry.screens.some((node) => node.id === screen.id)), element = stage.current
    if (flow && element) setCamera({ x: element.clientWidth / 2 - 135.5 - flow.x - 36 - screen.x!, y: 20 - flow.y - 132 - screen.y!, zoom: 1 })
  }
  const towelFlow = flows.find((flow) => flow.id === 'towel')
  const liveTowelScreen = towelFlow?.screens.find((screen) => screen.id === towel.currentNode.id)
  const towelSelected = !generic && focused === 'towel' && selectedScreen !== undefined
  const resume = () => {
    if (liveTowelScreen) { focusScreen(liveTowelScreen); towel.follow.current = true }
  }
  useEffect(() => {
    if (towel.running && towel.follow.current && towel.active && liveTowelScreen) {
      focusScreen(liveTowelScreen); towel.follow.current = true
    }
  }, [towel.current, towel.generation, towel.running])
  const genericLive = generic ? flows.flatMap((flow) => flow.screens).find((s) => s.id === adapterScreen) : undefined
  const genericFlow = genericLive && flows.find((f) => f.screens.some((s) => s.id === genericLive.id))
  const selectedLiveFrame = towelSelected && viewed === towel.current ? towel.frame.current : (generic ? adapterScreen : preview?.id) === viewed ? previewFrame.current : null
  const liveScreen = towel.running ? liveTowelScreen : undefined
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
    fit(Math.min(a.x, b.x) - 40, Math.min(a.y, b.y) - 40, Math.abs(a.x - b.x) + 351, Math.abs(a.y - b.y) + 817)
    setPathTarget({ kind: 'path', id: target.id, flow: flow.id, screen: screen.id, from: screen.id, to: destination.id, label: `${screen.label} → ${destination.label}`, action: edge.action, when: edge.when, returnTo: edge.returnTo }); setPane('review')
  }
  return <main className="rehearsal app-rehearsal" data-application-root={applicationRoot}>
      <header className="rh-brand">
        <button className="rh-outline-toggle" aria-label="Toggle journey outline" aria-expanded={outline} onClick={() => setOutline(!outline)}><CanvasIcon name="outline" /></button><strong>Rehearsal</strong>
        <ProjectPicker applicationRoot={applicationRoot} blocked={towel.saving || towel.dirtyProposal || !!towel.state?.pending || !generic && towel.visits.some((row) => !row.capture) || adapterVisits.some((row) => !row.screenshot)} activeRun={towel.running || !!preview} />
        <div className="rh-tools">
          <button className="rh-play-button" aria-label="Play" aria-pressed={!towelSelected || towel.mode === 'play'} disabled={towel.saving || generic && !project.preview} onClick={() => { if (towelSelected) towel.play(); if (selectedScreen && (!towelSelected || !towel.running)) openScreen(selectedScreen) }}><CanvasIcon name="play" /><span className="rh-tool-label">Play</span></button>
          {(towelSelected || towel.mode === 'edit') && <button aria-label="Edit proposal" title="Edit proposal" aria-pressed={towelSelected && towel.mode === 'edit'} disabled={!towelSelected} onClick={() => { towel.setMode('edit'); setPane('inspect') }}><CanvasIcon name="edit" /><span className="rh-tool-label">Edit proposal</span></button>}
          <div className="rh-panel-tools" role="group" aria-label="Workspace panels">
            <button aria-label="Inspect" title="Inspect" aria-expanded={pane === 'inspect'} onClick={() => setPane(pane === 'inspect' ? null : 'inspect')}><CanvasIcon name="inspect" /><span className="rh-tool-label">Inspect</span></button>
            <button aria-label="Review" title="Review" aria-expanded={pane === 'review'} onClick={() => setPane(pane === 'review' ? null : 'review')}><CanvasIcon name="review" /><span className="rh-tool-label">Review</span></button>
            <button aria-label="Contract" title="Contract" aria-expanded={pane === 'contract'} onClick={() => setPane(pane === 'contract' ? null : 'contract')}><CanvasIcon name="contract" /><span className="rh-tool-label">Contract</span></button>
            <button aria-label={`Coverage${proposals > 0 ? ` · ${proposals}` : ''}`} title="Coverage" aria-expanded={pane === 'coverage'} onClick={() => setPane(pane === 'coverage' ? null : 'coverage')}><CanvasIcon name="coverage" /><span className="rh-tool-label">Coverage</span>{proposals > 0 && <small className="rh-coverage-count">{proposals}</small>}</button>
          </div>
        </div>
      </header>
      {!generic && towel.notices}{generic && bridge.data && !scenarios.length && <p className="rh-alert" role="status">Project connected. Add screen states and their paths to your scenario registry to start exploring.</p>}{adapterError && <p role="alert" className="rh-alert">{adapterError}</p>}
      <p className="rh-status" role="status">{bridge.notice}</p>
      {discovered && <p className="rh-status">Synthetic navigation · state carried by Rehearsal · app behavior unverified</p>}
      {bridge.error && <p role="alert" className="rh-alert">{bridge.error}</p>}
      {queued && <section className="rh-confirm"><h2>Replace the open synthetic preview?</h2><p>Its unsaved draft will be replaced. {generic ? "Captured reviews are retained." : "The towel run stays separate and is retained."}</p><button onClick={() => { setAdapterScreen(queued.id); setPreview(queued); setQueued(null) }}>Open selected screen</button><button onClick={() => setQueued(null)}>Keep current preview</button></section>}
      <div className={`rh-layout ${pane ? 'has-inspector' : ''} ${outline ? '' : 'outline-closed'}`}><aside ref={navigator} className="rh-journeys" aria-label="App flow navigator" hidden={!outline}><div className="rh-outline-heading"><h2>App journey</h2><button aria-label="Close journey outline" onClick={() => setOutline(false)}>×</button></div><label className="rh-search">Search the app<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search flows or screens…" /></label><label className="rh-search">Coverage<select value={coverage} onChange={(event) => setCoverage(event.target.value)}><option value="all">All registered screens</option><option value="working">Working fixtures</option><option value="partial">Partial specimens</option></select></label>{project.navigation.map((section) => {
        const children = flows.filter((flow) => flow.section === section && (flow.screens.some(matches) || query.length > 0 && flow.label.toLowerCase().includes(query.toLowerCase())))
        return children.length > 0 && <section className="app-nav-section" key={section}><h3>{section}</h3><ol>{children.map((flow) => <li key={flow.id}><button aria-expanded={expanded === flow.id} aria-current={focused === flow.id ? 'location' : undefined} onClick={() => focus(flow.id)}><span>{expanded === flow.id ? '⌄' : '›'} {flow.label}</span><small>{flow.screens.length}</small></button>{expanded === flow.id && <ol className="app-screen-outline">{flow.screens.filter((screen) => matches(screen) || flow.label.toLowerCase().includes(query.toLowerCase())).map((screen, index) => <li key={screen.id}><button aria-current={viewed === screen.id ? 'page' : undefined} onClick={() => focusScreen(screen)}><small>{String(index + 1).padStart(2, '0')}</small><span>{screen.label}</span>{flow.id === 'towel' && towel.running && towel.current === screen.id && <small className="rh-live-label">Live</small>}</button></li>)}</ol>}</li>)}</ol></section>
      })}<p className="rh-muted">Drag background to pan · Space or Pan over screens · Pinch to zoom</p></aside>
        <section className="rh-map-area"><div className="rh-map-bar"><nav className="rh-breadcrumb" aria-label="Canvas location"><button onClick={() => fitApp()}>App</button><span>›</span><button onClick={() => focus(focused)}>{appSelected ? 'All journeys' : focusedFlow?.label ?? 'Application map'}</button>{selectedScreen && <><span>›</span><button onClick={fitSelected}>{selectedScreen.label}</button></>}</nav><label className="rh-canvas-detail"><span>Canvas detail</span><select aria-label="Canvas detail" value={canvasDetail} onChange={(event) => { const next = event.target.value; setCanvasDetail(next); try { localStorage.setItem('rehearsal-canvas-detail', next) } catch {} fitApp(next) }}><option value="compact">Compact flows</option><option value="all">All screens</option></select></label><span hidden={!selectedLiveFrame} className={`rh-preview-badge ${selectedLiveFrame ? 'is-live' : ''}`}>{selectedLiveFrame ? towelSelected && (towel.candidate || towel.mode === 'edit') ? `Proposal ${towel.dirtyProposal ? 'draft' : `v${towel.proposal.version}`}` : 'Live preview' : 'Snapshots'}</span>{towel.running && <button className="rh-resume" onClick={resume}>{towel.state?.dirty ? `App draft · ${towel.active?.label ?? towel.current}` : 'Resume run'}</button>}</div>
          {towelSelected && towel.running && selectedScreen.id !== towel.current && <div className="rh-selection">Your run is on {towel.active?.label ?? towel.current}. <button onClick={resume}>Resume run</button><button disabled={selectedScreen.id === 'saved' || towel.state?.pending} onClick={() => towel.requestStart(selectedScreen.id)}>Start here…</button></div>}
          <div className={`rh-canvas rh-infinite-canvas ${panning ? 'is-panning' : ''} ${zoom < .5 ? 'is-zoomed-out' : ''}`} ref={stage} aria-label="Entire application canvas" style={{ backgroundPosition: `${camera.x}px ${camera.y}px` }} {...controls} onWheelCapture={() => { cameraNavigation.current = true; towel.follow.current = false }} onPointerDownCapture={(event) => { if (panning || event.button === 1 || !(event.target as Element).closest('button,input,select,iframe')) { cameraNavigation.current = true; towel.follow.current = false; } controls.onPointerDownCapture?.(event) }}>
            <div className="app-camera-layer"><div className="app-scene" style={{ width: worldWidth, height: worldHeight, transform: `translate(${camera.x}px, ${camera.y}px) scale(${zoom})` }}>{overview && <AppOverview flows={compactFlows} source={source} active={initialized.current} focused={focused} pan={pan} focus={focus} reviewConnection={(id) => { focus(id); setPane('review') }} />}<div className="app-detail-scene" hidden={overview}>{flows.map((flow) => <section key={flow.id} className={`app-flow ${focused === flow.id ? 'is-focused' : ''}`} aria-label={`${flow.label} flow`} style={{ left: flow.x, top: flow.y, width: flow.width, height: flow.height }}><header><div><h2>{flow.label}</h2><p>{flow.screens.length} screens · {flow.screens.every((screen) => screen.partial) ? 'Partial specimens · paths unverified' : flow.id === 'towel' ? 'Both ownership branches · continuous run & captured inputs' : generic ? 'Project adapter · declared paths; scoped recordings' : 'Working fixtures · end-to-end recording not yet connected'}</p></div><button onClick={() => focus(flow.id)}>Fit whole flow</button>{flow.id === 'towel' && <button className="rh-primary" onClick={() => towel.running ? resume() : openScreen(flow.screens[0]!)}>{towel.running ? 'Resume run' : 'Play towel journey'}</button>}</header>
              <svg className="app-flow-edges" width={flow.width - 72} height={flow.height - 132} aria-label={`Declared paths in ${flow.label}`}><defs><marker id={`arrow-${flow.id.replace(/[^a-z0-9]/gi, '')}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="context-stroke" /></marker></defs>{internalEdges[flow.id]?.map((edge) => {
                const observed = flow.id === 'towel' && towel.visits.some((visit) => visit.runId === towel.runId && visit.from === edge.from && visit.to === edge.to)
                return <SelectablePath key={edge.id} id={edge.id} action={edge.action} d={edge.d} disabled={panning} selected={pathTarget?.id === edge.id} select={() => focusReviewTarget({ kind: 'path', id: edge.id, from: edge.from, to: edge.to, action: edge.action, label: edge.action })}><path d={edge.d} fill="none" stroke={observed ? '#bd3907' : edge.branch ? '#157b70' : edge.returning ? '#526880' : '#2456d6'} strokeDasharray={edge.returning ? '8 6' : undefined} strokeWidth={observed ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" markerEnd={`url(#arrow-${flow.id.replace(/[^a-z0-9]/gi, '')})`} />{edge.branch && <text x={edge.x} y={edge.y} fontSize="18" fill="#157b70">{edge.action}</text>}</SelectablePath>
              })}</svg>
              <div className="app-screen-grid">{flow.screens.map((screen, index) => <article key={screen.id} style={{ left: screen.x, top: screen.y }} className={`app-screen ${viewed === screen.id ? 'is-viewed' : ''} ${matches(screen) || query.length > 0 && flow.label.toLowerCase().includes(query.toLowerCase()) ? '' : 'is-filtered'}`}><button onClick={() => focusScreen(screen)} disabled={pan}><strong>{String(index + 1).padStart(2, '0')} {screen.label}</strong><small>{flow.id === 'towel' && liveScreen && liveScreen.id === screen.id || (generic ? adapterScreen : preview?.id) === screen.id ? 'Live · private synthetic preview' : screen.partial ? 'Partial specimen' : 'Real app fixture'}</small></button>{generic && genericLive?.id === screen.id ? <div className="app-screen-placeholder" aria-hidden="true" /> : flow.id === 'towel' && liveScreen && liveScreen.id === screen.id ? <div className="app-screen-placeholder" aria-hidden="true" /> : !generic && preview?.id === screen.id ? <div className="app-live-screen"><iframe ref={previewFrame} onLoad={() => setPreview((current) => current ? { ...current } : null)} title={`Live ${screen.label}`} src={`/review-frame.html?scenario=${encodeURIComponent(screen.scenario)}${screen.scenario.startsWith('family.') ? `&${new URLSearchParams([...new URLSearchParams(location.search)].filter(([key]) => ['familySize', 'familyStage'].includes(key)))}` : ''}`} />{(zoom < .5 || viewed !== screen.id) && <button className="rh-interact-shield" onClick={() => interactScreen(screen)}>Zoom to interact</button>}</div> : source ? <button className="app-screen-picture" disabled={pan} onClick={() => focusScreen(screen)}><FixturePicture active={initialized.current} src={flow.id === 'towel' && towel.snapshots.get(screen.id)?.capture || `/api/review/fixture.png?screen=${encodeURIComponent(screen.id)}&source=${source}`} alt={`${screen.label} actual screen snapshot`} /></button> : <div className="app-screen-placeholder">Loading app inventory…</div>}{viewed === screen.id && !(flow.id === 'towel' && liveScreen?.id === screen.id) && preview?.id !== screen.id && <button className="app-play-screen" disabled={pan || generic && !project.preview || screen.id === 'saved' && !towel.running} onClick={() => openScreen(screen)}>Play this screen</button>}</article>)}</div>
            </section>)}<svg className="app-cross-flow-edges" width={worldWidth} height={worldHeight} aria-label="Declared paths between flows"><defs><marker id="cross-flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#526880" /></marker></defs>{crossEdges.map((edge) => <SelectablePath key={edge.id} id={edge.id} action={edge.action} d={edge.d} disabled={panning} selected={pathTarget?.id === edge.id} select={() => focusReviewTarget({ kind: 'path', id: edge.id, from: edge.from, to: edge.to, action: edge.action, label: edge.action })}><path d={edge.d} fill="none" stroke={edge.kind === 'branch' ? '#157b70' : edge.kind === 'return' ? '#526880' : '#2456d6'} strokeDasharray={edge.kind === 'return' ? '8 6' : undefined} strokeWidth="1.5" vectorEffect="non-scaling-stroke" markerEnd="url(#cross-flow-arrow)" /><text x={edge.x} y={edge.y} fill="#526880" fontSize="18">{edge.action}</text></SelectablePath>)}</svg>{generic && preview && genericLive && genericFlow && <article className="app-screen app-towel-live" aria-label="Live project session" style={{ left: genericFlow.x + 36 + genericLive.x!, top: genericFlow.y + 132 + genericLive.y! }}><button onClick={() => focusScreen(genericLive)}><strong>{genericLive.label}</strong><small>Live · private synthetic preview</small></button><div className="app-live-screen"><iframe key={preview.id} ref={previewFrame} title={`Live ${preview.label}`} onLoad={attachAdapter} src={`/review-frame.html?${new URLSearchParams({ scenario: preview.scenario, ...Object.fromEntries([...new URLSearchParams(location.search)].filter(([key]) => ['persona', 'role', 'condition', 'theme', 'scale', 'width'].includes(key))) })}`} />{(zoom < .5 || viewed !== genericLive.id) && <button className="rh-interact-shield" onClick={() => interactScreen(genericLive)}>Zoom to interact</button>}</div></article>}{liveScreen && towelFlow && <article className="app-screen app-towel-live" aria-label="Live towel session" style={{ left: towelFlow.x + 36 + liveScreen.x!, top: towelFlow.y + 132 + liveScreen.y! }}><button onClick={resume}><strong>{towel.active?.label ?? (towel.current === 'closed' ? 'Run ended' : `Unmapped screen · ${towel.current}`)}</strong><small>{towel.candidate || towel.mode === 'edit' ? `Proposal ${towel.dirtyProposal ? 'draft' : `v${towel.proposal.version}`} · not in app` : 'Live · baseline'}</small></button><div className="app-live-screen"><iframe key={towel.generation} ref={towel.frame} title="Live towel journey" src={towel.src} onLoad={towel.attach} />{(zoom < .65 || viewed !== towel.current) && <button className="rh-interact-shield" onClick={() => { interactScreen(liveScreen); towel.follow.current = true }}>Zoom to interact</button>}{towel.mode === 'edit' && viewed === towel.current && zoom >= .65 && <button className="rh-edit-surface" aria-label="Select screen or action to edit" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); towel.setProperty((event.clientY - rect.top) / rect.height > .87 ? 'action' : 'screen'); setPane('inspect') }} />}</div></article>}</div></div></div>
          </div><CanvasControls stage={stage} pan={pan} setPan={(value) => { towel.follow.current = false; setPan(value) }} zoom={zoom} changeZoom={(value) => { towel.follow.current = false; changeZoom(value) }} fitApp={() => fitApp()} fitFlow={() => focus(focused)} fitSelection={fitSelected} /><footer className="rh-foot"><span>Blue: action · Teal: branch · Dashed: return</span><span>{generic ? adapterVisits.length : towel.visits.length} captured visits · Private synthetic run</span></footer>
        </section>
        <aside className="rh-inspector" aria-label="Contextual panel" hidden={!pane}><div className="rh-inspector-title"><h2>{pane === 'coverage' ? 'Coverage' : pane === 'review' ? 'Review' : pane === 'contract' ? 'Product contract' : towel.mode === 'edit' && towelSelected ? 'Edit proposal' : 'Inspect'}</h2><button aria-label="Close panel" onClick={() => setPane(null)}>Close</button></div><div className="rh-panel-tabs"><button aria-pressed={pane === 'inspect'} onClick={() => setPane('inspect')}>{towel.mode === 'edit' ? 'Proposal' : 'Properties'}</button><button aria-pressed={pane === 'review'} onClick={() => setPane('review')}>Reviews</button><button aria-pressed={pane === 'contract'} onClick={() => setPane('contract')}>Contract</button><button aria-pressed={pane === 'coverage'} onClick={() => setPane('coverage')}>Coverage</button></div><p className="rh-panel-scope">{pane === 'coverage' ? 'App coverage' : reviewTarget.label}</p><div className="rh-inspect-content" hidden={pane !== 'inspect'}>{towelSelected ? towel.inspector : <><p>{selectedScreen ? 'Select a screen with supported proposal properties to edit it.' : 'Select a screen to inspect its properties.'}</p>{selectedScreen && <><p>{selectedScreen.partial ? 'Partial specimen · paths unverified' : 'Working app fixture'}</p><p>Scenario: {selectedScreen.scenario}</p>{selectedScreen.routeActions?.length ? <section className="rh-route-actions"><h3>Cross-route actions</h3><p>Source bindings, not observed runs. Linked specimens represent the destination; they do not replay its parameters.</p>{selectedScreen.routeActions.map((action) => <article key={`${action.action}-${action.route}`}><h4>{action.action}</h4><p><code>{action.route}</code></p><p>{action.when}</p>{action.returnTo && <p>Return: {action.returnTo}</p>}<p>{action.status}</p>{action.destination && action.status === 'source-declared; representative preview' && <button onClick={() => { const target = flows.flatMap((flow) => flow.screens).find((screen) => screen.id === action.destination); if (target) focusScreen(target) }}>View destination specimen</button>}<a href={`/api/review/evidence?file=${encodeURIComponent(action.source)}`} target="_blank" rel="noreferrer">Source</a></article>)}</section> : null}<button disabled={generic && !project.preview} onClick={() => openScreen(selectedScreen)}>Play selected screen</button></>}</>}{generic && <details><summary>Run history ({adapterVisits.length})</summary>{adapterVisits.map((visit) => <article key={visit.id}><strong>{visit.from} → {visit.to}</strong><dl className="rh-fields">{visit.fields.map((field, i) => <div key={i}><dt>{field.label}</dt><dd>{field.value || '(empty)'}</dd></div>)}</dl>{visit.screenshot ? <a href={visit.screenshot} target="_blank" rel="noreferrer">Frozen screen</a> : <p>{visit.error ?? 'Saving evidence…'}</p>}{visit.error && <button onClick={() => void saveAdapterCapture(visit.id, failedCaptures.current.get(visit.id))}>Retry capture</button>}</article>)}</details>}</div><div hidden={pane !== 'review'}><ReviewPanel project={project} selected={selectedScreen ?? null} flowScreens={focusedFlow?.screens ?? []} allScreens={flows.flatMap((flow) => flow.screens)} frame={selectedLiveFrame} target={reviewTarget} canvas={stage.current} fixture={{ source, snapshot: fixtureSnapshot }} focus={focusReviewTarget} navigationReady={initialized.current} /></div><div hidden={pane !== 'contract'}>{pane === 'contract' && <ContractPanel selected={selectedScreen ?? null} scenarios={scenarios} openReviewPane={() => setPane('review')} />}</div><div hidden={pane !== 'coverage'}><CoveragePanel bridge={bridge} focus={(scenario) => { const screen = flows.flatMap((flow) => flow.screens).find((screen) => screen.scenario === scenario); if (screen) focusScreen(screen) }} /></div></aside>
      </div>
    </main>
}
