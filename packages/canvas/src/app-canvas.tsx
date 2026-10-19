import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from 'react'
import { appFlows, screenSize, type MapScenario, type MapScreen } from './app-map'
import { AppOverview } from './app-overview'
import { FixturePicture, fixtureURL } from './fixture-picture'
import { extension, useGuidedSession } from './extension'
import project from 'virtual:civic-project'
import { ReviewPanel, type ReviewTarget } from './review-panel'
import type { ReviewSnapshot } from './adapter'
import { ConnectionPaths } from './connection-paths'
import { ConnectionLegend } from './connection-legend'
import { type ConnectionBundle, type RoutedConnection } from './connection-routing'
import { SharedNavigation } from './shared-navigation'
import { JourneyOutline } from './journey-outline'
import { useDesktopProjects } from './desktop-project-tabs'
import { ContractPanel } from './contract-panel'
import { CoveragePanel, useCoverage } from './coverage-panel'
import type { ScenarioEvidence } from '@civic/shell/contract'
import { useCanvasSelection } from './use-canvas-selection'
import { CanvasControls } from '@civic/shell/canvas-controls'
import { PanelLeft, PanelRight, Pencil, Play, Search, Settings2, FolderOpen, GitBranch, Maximize, Hand, MousePointer2, Monitor, Plus, Minus } from '@civic/shell/icons'
import { Button } from '@civic/shell/ui/button'
import { IconButton } from '@civic/shell/ui/icon-button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@civic/shell/ui/empty'
import { Skeleton } from '@civic/shell/ui/skeleton'
import { Alert, AlertDescription } from '@civic/shell/ui/alert'
import { workspacePanels, type WorkspacePanel } from './workspace-tools'
import { WorkspaceHeader, WorkspaceMapBar } from './workspace-layout'
import { ProjectPicker, type ProjectPickerHandle } from './project-picker'
import { WorkspaceSearch, type WorkspaceAction } from './workspace-search'
import { usePreviewSession } from './use-preview-session'
import { WorkspaceInspector, PreviewInspector } from './workspace-inspector'
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
  const changeViewport = ({ width, height, preset }: Pick<PreviewViewport, 'width' | 'height' | 'preset'>) => viewportController.change({ width, height, preset })
  const screenStyle = (screen: MapScreen): CSSProperties => ({ left: screen.x, top: screen.y, width: screenSize(screen).width, '--screen-width': `${screenSize(screen).width}px`, '--screen-preview-height': `${screenSize(screen).previewHeight}px` } as CSSProperties)
  const initialized = useRef(false)
  const [scenarios, setScenarios] = useState<(MapScenario & ScenarioEvidence)[]>([])
  const [source, setSource] = useState('')
  const [fixtureSnapshot, setFixtureSnapshot] = useState<ReviewSnapshot | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const projectPicker = useRef<ProjectPickerHandle>(null)
  const desktop = useDesktopProjects()
  const desktopPickerTrigger = useRef<HTMLButtonElement>(null)
  const searchTrigger = useRef<HTMLButtonElement>(null)
  const [outline, setOutline] = useState(() => window.innerWidth >= 1180)
  const [outlineQuery, setOutlineQuery] = useState('')
  const flows = useMemo(() => appFlows(generic ? scenarios.map(row => ({ ...row, viewport: { width: viewport.width, height: viewport.height } })) : scenarios, project), [scenarios, generic, viewport.width, viewport.height])
  const { pathTarget, setPathTarget, appSelected, focused, setFocused, expanded, setExpanded, viewed, overview, canvasDetail, setCanvasDetail, compactFlows, crossEdges, internalEdges, overviewEdges, sharedPaths, bundleSelection, setBundleSelection, worldHeight, worldWidth, stage, camera, pan, setPan, panning, changeZoom, controls, size, zoom, navigator, cameraNavigation, focus, focusScreen, fit, fitApp, fitSelected, interactScreen, focusedFlow, selectedScreen } = useCanvasSelection({ flows, initialFlow: extension.guidedFlow ?? '', outline, initialized, viewport, stopFollowing: () => { guided.follow.current = false } })
  const session = usePreviewSession({ flows, generic, viewport, focusScreen: screen => focusScreen(screen) })
  const { preview, previewFrame, initialViewport, adapterMode, adapterScreen, adapterVisits, adapterError, queued, run, replaying, attachAdapter, replayFromStart } = session
  const browsingLive = live && (!preview || scenarios.find(row => row.id === preview.scenario)?.preview === 'live-read-only')
  const previewLabel = browsingLive ? 'Live app · browse only' : 'Private synthetic preview'
  const [pane, setPane] = useState<'inspect' | 'review' | 'contract' | 'coverage' | null>(() => { const params = new URLSearchParams(location.search); return params.has('feedback') || params.get('view') === 'review' ? 'review' : params.get('view') === 'contract' ? 'contract' : null })
  const [applicationRoot, setApplicationRoot] = useState('')
  const bridge = useCoverage((index) => { setScenarios(index.scenarios); setSource(index.fixtureSource); setFixtureSnapshot(index); setApplicationRoot(index.connection?.applicationRoot ?? '') })
  const proposals = bridge.data?.candidates.filter((c) => c.targetPresent && !c.acknowledged).length ?? 0
  const discovered = scenarios.some((scenario) => scenario.discovery)
  const guided = useGuidedSession(viewed, !generic)
  const blocked = guided.saving || guided.dirtyProposal || !!guided.state?.pending || !generic && guided.visits.some(row => !row.capture) || adapterVisits.some(row => !row.screenshot)
  const frameReadiness = useFrameReadiness(() => previewFrame.current ?? guided.frame.current, project.key, fixtureSnapshot?.revision.source ?? '')
  useEffect(() => {
    if (!initialized.current && scenarios.length && size.width && size.height) { initialized.current = true; const params = new URLSearchParams(location.search); const target = flows.flatMap((flow) => flow.screens).find((screen) => screen.scenario === params.get('scenario') && (!params.has('care') || screen.id === `care:${params.get('care')}`)); if (target) { if (params.get('play') === '1') openScreen(target); else focusScreen(target) } else if (flows.length === 1) focus(flows[0]!.id); else fitApp() }
  }, [flows, scenarios.length, size.width, size.height])
  const openScreen = (screen: MapScreen) => {
    if (preview?.id === screen.id && frameReadiness.state === 'failed') {
      if (!blocked) session.start(screen, true)
      return
    }
    const flow = flows.find((entry) => entry.screens.some((node) => node.id === screen.id))!
    focusScreen(screen)
    if (!generic && flow.id === guided.flowId) {
      if (!guided.running) guided.requestStart(screen.id)
      else if (screen.id !== guided.current) guided.requestStart(screen.id)
      guided.follow.current = screen.id === guided.current || !guided.running
    } else session.request(screen)
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
      <WorkspaceHeader desktop={desktop} pickerTrigger={desktopPickerTrigger} openPicker={() => projectPicker.current?.open('work')} projects={<ProjectPicker ref={projectPicker} readiness={frameReadiness} hideTrigger={Boolean(window.civicDesktop)} returnFocus={desktopPickerTrigger} tabDirty={blocked || guided.running || !!preview} onSearch={() => setSearchOpen(true)} searchOpen={searchOpen} selectedScreen={scenarios.find(row => row.id === selectedScreen?.scenario)} focusScreen={id => { const screen = flows.flatMap(flow => flow.screens).find(screen => screen.scenario === id); if (screen) { focusScreen(screen); session.start(screen, true) } }} blocked={blocked} activeRun={guided.running || !!preview} />}
        searchTrigger={searchTrigger} onSearch={() => setSearchOpen(true)} playLabel={failedPreview ? 'Retry preview' : 'Play'} playPressed={!guidedSelected || guided.mode === 'play'} playDisabled={guided.saving || generic && !project.preview || failedPreview && blocked} onPlay={playSelection}
        showEdit={guidedSelected || guided.mode === 'edit'} editPressed={guidedSelected && guided.mode === 'edit'} editDisabled={!guidedSelected} onEdit={() => { guided.setMode('edit'); setPane('inspect') }}
        pane={pane} setPane={setPane} proposals={proposals} />
      {!generic && guided.notices}{adapterError && <p role="alert" className="rh-alert">{adapterError}</p>}
      {discovered && <p className="rh-status">Synthetic navigation · state carried by CIVIC · app behavior unverified</p>}
      {bridge.error && <Alert variant="destructive" className="civic-shell-alert"><AlertDescription>{bridge.error} Checking again automatically.</AlertDescription></Alert>}{viewportError && <p role="alert" className="rh-alert">{viewportError}</p>}
      {queued && <section className="rh-confirm"><h2>Replace the open synthetic preview?</h2><p>Its unsaved draft will be replaced. {guided.labels.retained}</p><Button variant="outline" disabled={blocked} onClick={() => session.replace(blocked)}>Open selected screen</Button><Button variant="outline" onClick={session.cancelReplacement}>Keep current preview</Button></section>}
      <div className={`rh-layout ${pane ? 'has-inspector' : ''} ${outline ? '' : 'outline-closed'}`}><aside id="civic-journey-outline" ref={navigator} className="rh-journeys" aria-label="App flow navigator" hidden={!outline}>
        <JourneyOutline flows={flows} sections={project.navigation} query={outlineQuery} setQuery={setOutlineQuery} focused={focused} expanded={expanded} viewed={viewed} liveScreen={guided.running ? guided.current : undefined} focus={focus} focusScreen={focusScreen} close={() => setOutline(false)} />
        <SharedNavigation flows={flows} group={selectedBundle} select={selectConnection} />
      </aside>
        <section className="rh-map-area"><WorkspaceMapBar outline={outline} toggleOutline={() => setOutline(!outline)} onApp={() => fitApp()} flowLabel={appSelected ? 'All journeys' : focusedFlow?.label ?? 'Application map'} onFlow={() => focus(focused)} selectedLabel={selectedScreen?.label} onSelection={fitSelected} viewport={viewport} busy={viewportBusy} disabled={!generic || viewportUnavailable} reason={viewportReason} changeViewport={size => void changeViewport(size)} resumeLabel={guided.running ? guided.state?.dirty ? `App draft · ${guided.active?.label ?? guided.current}` : 'Resume run' : undefined} onResume={resume} />
          {focusedFlow && !appSelected && focusedFlow.screens.length > 1 && !internalEdges[focusedFlow.id]?.length && !crossEdges.some(edge => focusedFlow.screens.some(screen => screen.id === edge.from || screen.id === edge.to)) && <div className="civic-connection-notice" role="status"><span>No paths registered for this journey.</span><Button variant="link" size="sm" onClick={() => setPane('coverage')}>Review coverage</Button></div>}{guidedSelected && guided.running && selectedScreen.id !== guided.current && <div className="rh-selection">Your run is on {guided.active?.label ?? guided.current}. <Button variant="outline" onClick={resume}>Resume run</Button><Button variant="outline" disabled={!guided.canStartAt(selectedScreen.id) || guided.state?.pending} onClick={() => guided.requestStart(selectedScreen.id)}>Start here…</Button></div>}
          <div className={`rh-canvas rh-infinite-canvas ${panning ? 'is-panning' : ''} ${zoom < .5 ? 'is-zoomed-out' : ''}`} ref={stage} aria-label="Entire application canvas" style={{ backgroundPosition: `${camera.x}px ${camera.y}px` }} {...controls} onWheelCapture={() => { cameraNavigation.current = true; guided.follow.current = false }} onPointerDownCapture={(event) => { if (panning || event.button === 1 || !(event.target as Element).closest('button,input,select,iframe')) { cameraNavigation.current = true; guided.follow.current = false; } controls.onPointerDownCapture?.(event) }}>
            {!bridge.data && !bridge.error && <div className="civic-canvas-message" role="status" aria-label="Loading project"><Skeleton className="cv:h-8 cv:w-44" /><Skeleton className="cv:h-44 cv:w-64" /><p>Loading journeys…</p></div>}{bridge.data && !scenarios.length && <Empty className="civic-canvas-message" role="status"><EmptyHeader><EmptyMedia variant="icon"><FolderOpen aria-hidden="true" /></EmptyMedia><EmptyTitle>No screens registered yet</EmptyTitle><EmptyDescription>Connect a scenario registry to explore this app’s screens and paths.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => setPane('coverage')}>Review coverage</Button></EmptyContent></Empty>}<div className="app-camera-layer"><div className="app-scene" style={{ width: worldWidth, height: worldHeight, transform: `translate(${camera.x}px, ${camera.y}px) scale(${zoom})` }}>{overview && <AppOverview flows={compactFlows} connections={overviewEdges} selectedBundle={bundleSelection} selectBundle={selectBundle} source={source} active={initialized.current && desktop.visible} focused={focused} pan={pan} focus={focus} reviewConnection={selectConnection} />}<div className="app-detail-scene" hidden={overview}>{flows.map((flow) => <section key={flow.id} className={`app-flow ${focused === flow.id ? 'is-focused' : ''}`} aria-label={`${flow.label} flow`} style={{ left: flow.x, top: flow.y, width: flow.width, height: flow.height }}><header><div><h2>{flow.label}</h2><p>{flow.screens.length} screens · {flow.screens.every((screen) => screen.partial) ? 'Partial specimens · paths unverified' : flow.id === guided.flowId ? guided.labels.summary : generic ? 'Project adapter · declared paths; scoped recordings' : 'Working fixtures · end-to-end recording not yet connected'}</p></div><button onClick={() => focus(flow.id)}>Fit whole flow</button>{flow.id === guided.flowId && <button className="rh-primary" onClick={() => guided.running ? resume() : openScreen(flow.screens[0]!)}>{guided.running ? 'Resume run' : guided.labels.play}</button>}</header>
              <svg className="app-flow-edges" width={flow.width - 72} height={flow.height - 132} aria-label={`Declared paths in ${flow.label}`}><ConnectionPaths edges={internalEdges[flow.id] ?? []} markerId={`arrow-${flow.id.replace(/[^a-z0-9]/gi, '')}`} disabled={panning} selectedPath={pathTarget?.id} selectedBundle={bundleSelection} observed={observed} select={selectConnection} selectBundle={selectBundle} /></svg>
              <div className="app-screen-grid">{flow.screens.map((screen, index) => <article key={screen.id} style={screenStyle(screen)} className={`app-screen ${viewed === screen.id ? 'is-viewed' : ''}`}><button onClick={() => focusScreen(screen)} disabled={pan}><strong>{String(index + 1).padStart(2, '0')} {screen.label}</strong><small>{flow.id === guided.flowId && liveScreen && liveScreen.id === screen.id || (adapterMode ? adapterScreen : preview?.id) === screen.id ? previewLabel : screen.partial ? 'Partial specimen' : 'Real app fixture'}</small></button>{adapterMode && genericLive?.id === screen.id ? <div className="app-screen-placeholder" aria-hidden="true" /> : flow.id === guided.flowId && liveScreen && liveScreen.id === screen.id ? <div className="app-screen-placeholder" aria-hidden="true" /> : !adapterMode && preview?.id === screen.id ? <div className="app-live-screen"><iframe ref={previewFrame} onLoad={session.refreshLegacy} title={`Live ${screen.label}`} src={`/review-frame.html?scenario=${encodeURIComponent(screen.scenario)}${extension.frameParams?.(screen.scenario).length ? `&${new URLSearchParams([...new URLSearchParams(location.search)].filter(([key]) => extension.frameParams!(screen.scenario).includes(key)))}` : ''}`} />{(zoom < .5 || viewed !== screen.id) && <button className="rh-interact-shield" onClick={() => interactScreen(screen)}>Zoom to interact</button>}</div> : source ? <button className="app-screen-picture" aria-label={`View ${screen.label} snapshot`} disabled={pan} onClick={() => focusScreen(screen)}><FixturePicture viewport={screen.viewport} active={initialized.current && desktop.visible} src={flow.id === guided.flowId && guided.snapshots.get(screen.id)?.capture || fixtureURL(screen.id, source, generic ? viewport : undefined)} alt={`${screen.label} actual screen snapshot`} /></button> : <div className="app-screen-placeholder">Loading app inventory…</div>}{viewed === screen.id && !(flow.id === guided.flowId && liveScreen?.id === screen.id) && preview?.id !== screen.id && <button className="app-play-screen" disabled={pan || generic && !project.preview || flow.id === guided.flowId && !guided.running && !guided.canStartAt(screen.id)} onClick={() => openScreen(screen)}>Play this screen</button>}</article>)}</div>
            </section>)}<svg className="app-cross-flow-edges" width={worldWidth} height={worldHeight} aria-label="Declared paths between flows"><ConnectionPaths edges={crossEdges} markerId="cross-flow-arrow" disabled={panning} selectedPath={pathTarget?.id} selectedBundle={bundleSelection} observed={observed} select={selectConnection} selectBundle={selectBundle} /></svg>{adapterMode && preview && genericLive && genericFlow && <article className="app-screen app-live-session" aria-label="Live project session" style={{ ...screenStyle(genericLive), left: genericFlow.x + 36 + genericLive.x!, top: genericFlow.y + 132 + genericLive.y! }}><button onClick={() => focusScreen(genericLive)}><strong>{genericLive.label}</strong><small>{previewLabel}</small></button><div className="app-live-screen"><iframe key={`${preview.id}:${run}`} ref={previewFrame} title={`Live ${preview.label}`} onLoad={attachAdapter} src={`/review-frame.html?${new URLSearchParams({ scenario: preview.scenario, ...Object.fromEntries([...new URLSearchParams(location.search)].filter(([key]) => ['persona', 'role', 'condition'].includes(key))), ...(initialViewport.current.preset ? { preset: initialViewport.current.preset } : {}), width: String(initialViewport.current.width), height: String(initialViewport.current.height), theme: initialViewport.current.theme, scale: String(initialViewport.current.textScale) })}`} />{(zoom < .5 || viewed !== genericLive.id) && <button className="rh-interact-shield" onClick={() => interactScreen(genericLive)}>Zoom to interact</button>}</div></article>}{liveScreen && guidedFlow && <article className="app-screen app-live-session" aria-label={guided.labels.live} style={{ left: guidedFlow.x + 36 + liveScreen.x!, top: guidedFlow.y + 132 + liveScreen.y! }}><button onClick={resume}><strong>{guided.active?.label ?? (guided.current === 'closed' ? 'Run ended' : `Unmapped screen · ${guided.current}`)}</strong><small>{guided.candidate || guided.mode === 'edit' ? `Proposal ${guided.dirtyProposal ? 'draft' : `v${guided.proposal.version}`} · not in app` : 'Live · baseline'}</small></button><div className="app-live-screen"><iframe key={guided.generation} ref={guided.frame} title={guided.labels.live} src={guided.src} onLoad={guided.attach} />{(zoom < .65 || viewed !== guided.current) && <button className="rh-interact-shield" onClick={() => { interactScreen(liveScreen); guided.follow.current = true }}>Zoom to interact</button>}{guided.mode === 'edit' && viewed === guided.current && zoom >= .65 && <button className="rh-edit-surface" aria-label="Select screen or action to edit" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); guided.setProperty((event.clientY - rect.top) / rect.height > .87 ? 'action' : 'screen'); setPane('inspect') }} />}</div></article>}</div></div></div>
          </div><CanvasControls stage={stage} pan={pan} setPan={chooseTool} zoom={zoom} changeZoom={zoomTo} fitApp={() => fitApp()} fitFlow={() => focus(focused)} fitSelection={fitSelected} /><footer className="rh-foot"><ConnectionLegend /><span>{adapterMode ? adapterVisits.length : guided.visits.length} captured visits · {browsingLive ? 'Live app · read only' : 'Private synthetic run'}</span></footer>
        </section>
        <WorkspaceInspector pane={pane} setPane={setPane} editing={guided.mode === 'edit' && guidedSelected} scope={reviewTarget.label}
          inspect={<PreviewInspector frame={selectedLiveFrame} viewportController={viewportController} guidedSelected={guidedSelected} guidedContent={guided.inspector} selectedScreen={selectedScreen} generic={generic} live={live} previewAvailable={project.preview} adapterMode={adapterMode} visits={adapterVisits} replaying={replaying} onPlay={openScreen} onReplay={replayFromStart} onDestination={id => { const screen = flows.flatMap(flow => flow.screens).find(screen => screen.id === id); if (screen) focusScreen(screen) }} onRetryCapture={id => { void session.retryCapture(id) }} />}
          review={<ReviewPanel project={project} selected={selectedScreen ?? null} flowScreens={focusedFlow?.screens ?? []} allScreens={flows.flatMap((flow) => flow.screens)} frame={selectedLiveFrame} target={reviewTarget} canvas={stage.current} fixture={{ source, snapshot: fixtureSnapshot, ...(generic ? { viewport } : {}) }} focus={focusReviewTarget} navigationReady={initialized.current} />}
          contract={pane === 'contract' && <ContractPanel selected={selectedScreen ?? null} scenarios={scenarios} openReviewPane={() => setPane('review')} />}
          coverage={<CoveragePanel bridge={bridge} focus={(scenario) => { const screen = flows.flatMap((flow) => flow.screens).find((screen) => screen.scenario === scenario); if (screen) focusScreen(screen) }} />}
        />
      </div>
    </main>
}
