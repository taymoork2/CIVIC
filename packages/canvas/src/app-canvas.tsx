import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { appFlows, flowContent, screenSize, type MapScenario, type MapScreen } from './app-map'
import { extension, useGuidedSession } from './extension'
import project from 'virtual:civic-project'
import { ReviewPanel, type ReviewTarget, type ReviewPanelHandle } from './review-panel'
import type { ReviewSnapshot } from './adapter'
import { CanvasStage } from './canvas-stage'
import { ConnectionLegend } from './connection-legend'
import type { ConnectionBundle, RoutedConnection } from './connection-routing'
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
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@civic/shell/ui/empty'
import { Skeleton } from '@civic/shell/ui/skeleton'
import { Alert, AlertDescription } from '@civic/shell/ui/alert'
import { workspacePanels, type WorkspacePanel } from './workspace-tools'
import { WorkspaceHeader, WorkspaceMapBar } from './workspace-layout'
import { WorkspaceSettings } from './workspace-settings'
import { WorkspaceBody, WorkspaceRail } from './workspace-rails'
import { ProjectPicker, type ProjectPickerHandle } from './project-picker'
import { WorkspaceSearch, type WorkspaceAction } from './workspace-search'
import { usePreviewSession } from './use-preview-session'
import { WorkspaceInspector, PreviewInspector } from './workspace-inspector'
import { viewportPresets, type PreviewViewport } from './viewport-presets'
import { usePreviewViewport } from './use-preview-viewport'
import { supportsPreview, useFrameReadiness } from './connection-readiness'
import '@civic/shell/styles/workspace.css'
import '@civic/shell/styles/scene.css'

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
  const initialized = useRef(false)
  const [scenarios, setScenarios] = useState<(MapScenario & ScenarioEvidence)[]>([])
  const [source, setSource] = useState('')
  const [fixtureSnapshot, setFixtureSnapshot] = useState<ReviewSnapshot | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const reviewPanel = useRef<ReviewPanelHandle>(null)
  const projectPicker = useRef<ProjectPickerHandle>(null)
  const desktop = useDesktopProjects()
  const desktopPickerTrigger = useRef<HTMLButtonElement>(null)
  const openProjectPicker = useCallback((replace: boolean, trigger: HTMLButtonElement) => {
    desktopPickerTrigger.current = trigger
    projectPicker.current?.open('work', replace)
  }, [])
  const searchTrigger = useRef<HTMLButtonElement>(null)
  const [outline, setOutline] = useState(() => window.innerWidth >= 1180)
  const [outlineQuery, setOutlineQuery] = useState('')
  const flows = useMemo(() => appFlows(generic ? scenarios.map(row => ({ ...row, viewport: { width: viewport.width, height: viewport.height } })) : scenarios, project), [scenarios, generic, viewport.width, viewport.height])
  const { pathTarget, setPathTarget, appSelected, focused, setFocused, expanded, setExpanded, viewed, overview, canvasDetail, setCanvasDetail, compactFlows, crossEdges, internalEdges, overviewEdges, sharedPaths, bundleSelection, setBundleSelection, worldHeight, worldWidth, stage, scene, edgeScene, motion, pan, setPan, panning, changeZoom, controls, size, zoom, navigator, cameraNavigation, focus, focusScreen, fit, fitApp, fitSelected, interactScreen, focusedFlow, selectedScreen } = useCanvasSelection({ flows, initialFlow: extension.guidedFlow ?? '', outline, initialized, viewport, stopFollowing: () => { guided.follow.current = false } })
  const session = usePreviewSession({ flows, generic, viewport, focusScreen: screen => focusScreen(screen) })
  const { preview, previewFrame, adapterMode, adapterScreen, adapterVisits, adapterError, queued, replaying, replayFromStart } = session
  const browsingLive = live && (!preview || scenarios.find(row => row.id === preview.scenario)?.preview === 'live-read-only')
  const previewLabel = browsingLive ? 'Live app · browse only' : 'Private synthetic preview'
  const [pane, setPane] = useState<WorkspacePanel | null>(() => { const params = new URLSearchParams(location.search); return params.has('feedback') || params.get('view') === 'review' ? 'review' : params.get('view') === 'contract' ? 'contract' : null })
  useEffect(() => {
    const collapse = () => { if (window.innerWidth < 1180) setOutline(false) }
    window.addEventListener('resize', collapse)
    return () => window.removeEventListener('resize', collapse)
  }, [])
  useEffect(() => { if (pane && window.innerWidth < 1180) setOutline(false) }, [pane])
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
  const selectedLiveFrame = guidedSelected && viewed === guided.current ? guided.frame.current : (adapterMode ? adapterScreen : preview?.id) === viewed ? previewFrame.current : null
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
    const a = { x: flow.x + flowContent.x + screen.x!, y: flow.y + flowContent.y + screen.y! }, b = { x: destinationFlow.x + flowContent.x + destination.x!, y: destinationFlow.y + flowContent.y + destination.y! }
    const points = internalEdges[flow.id]?.find(path => path.id === target.id)?.points.map(point => ({ x: flow.x + flowContent.x + point.x, y: flow.y + flowContent.y + point.y })) ?? crossEdges.find(path => path.id === target.id)?.points ?? []
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
    { id: 'settings', label: 'CIVIC settings', keywords: 'appearance theme system light dark preferences', icon: Settings2, opensDialog: true, run: () => setSettingsOpen(true) },
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
  return <main className="rehearsal app-rehearsal civic-workspace" data-application-root={applicationRoot} data-preview-state={frameReadiness.state} data-preview-source={frameReadiness.source}>
      <WorkspaceSettings open={settingsOpen} setOpen={setSettingsOpen} frame={selectedLiveFrame} canvasDetail={canvasDetail} changeDetail={changeDetail} projectName={project.app?.name ?? project.name} onConnections={() => projectPicker.current?.open('sources')} />
      <WorkspaceSearch open={searchOpen} setOpen={setSearchOpen} name={project.app?.name ?? project.name} flows={flows} actions={searchActions} loading={!bridge.data && !bridge.error} frame={selectedLiveFrame} canvas={stage} trigger={searchTrigger} focusFlow={id => { setOutlineQuery(''); focus(id); if (window.innerWidth < 1180) setOutline(false) }} focusScreen={screen => { setOutlineQuery(''); focusScreen(screen); if (window.innerWidth < 1180) setOutline(false) }} />
      <WorkspaceHeader desktop={desktop} openPicker={openProjectPicker} projects={<ProjectPicker ref={projectPicker} readiness={frameReadiness} hideTrigger={Boolean(window.civicDesktop)} returnFocus={desktopPickerTrigger} tabDirty={blocked || guided.running || !!preview} onSearch={() => setSearchOpen(true)} searchOpen={searchOpen} selectedScreen={scenarios.find(row => row.id === selectedScreen?.scenario)} focusScreen={id => { const screen = flows.flatMap(flow => flow.screens).find(screen => screen.scenario === id); if (screen) { focusScreen(screen); session.start(screen, true) } }} blocked={blocked} activeRun={guided.running || !!preview} />}
        searchTrigger={searchTrigger} onSearch={() => setSearchOpen(true)} onSettings={() => setSettingsOpen(true)} playLabel={failedPreview ? 'Retry preview' : 'Play'} playPressed={!guidedSelected || guided.mode === 'play'} playDisabled={guided.saving || generic && !project.preview || failedPreview && blocked} onPlay={playSelection}
        showEdit={guidedSelected || guided.mode === 'edit'} editPressed={guidedSelected && guided.mode === 'edit'} editDisabled={!guidedSelected} onEdit={() => { guided.setMode('edit'); setPane('inspect') }}
        pane={pane} setPane={setPane} proposals={proposals} />
      {!generic && guided.notices}{adapterError && <Alert variant="destructive"><AlertDescription>{adapterError}</AlertDescription></Alert>}
      {discovered && <p className="rh-status">Synthetic navigation · state carried by CIVIC · app behavior unverified</p>}
      {bridge.error && <Alert variant="destructive" className="civic-shell-alert"><AlertDescription>{bridge.error} Checking again automatically.</AlertDescription></Alert>}{viewportError && <Alert variant="destructive"><AlertDescription>{viewportError}</AlertDescription></Alert>}
      {queued && <Alert className="rh-confirm"><h2>Replace the open synthetic preview?</h2><p>Its unsaved draft will be replaced. {guided.labels.retained}</p><Button variant="outline" disabled={blocked} onClick={() => session.replace(blocked)}>Open selected screen</Button><Button variant="outline" onClick={session.cancelReplacement}>Keep current preview</Button></Alert>}
      <WorkspaceBody className={`rh-layout ${pane ? 'has-inspector' : ''} ${outline ? '' : 'outline-closed'}`}><WorkspaceRail side="left" open={outline} onOpenChange={setOutline} title="Journey outline" id="civic-journey-outline" ref={navigator} className="rh-journeys civic-workspace-rail cv:absolute cv:gap-2 cv:p-2 cv:shadow-none cv:data-[side=left]:w-64 cv:data-closed:hidden" aria-label="App flow navigator">
        <JourneyOutline flows={flows} sections={project.navigation} query={outlineQuery} setQuery={setOutlineQuery} focused={focused} expanded={expanded} viewed={viewed} liveScreen={guided.running ? guided.current : undefined} focus={focus} focusScreen={screen => { focusScreen(screen); if (window.innerWidth < 1180) setOutline(false) }} close={() => setOutline(false)} />
        <SharedNavigation flows={flows} group={selectedBundle} select={selectConnection} />
      </WorkspaceRail>
        <section className="rh-map-area"><WorkspaceMapBar outline={outline} toggleOutline={() => setOutline(!outline)} onApp={() => fitApp()} flowLabel={appSelected ? 'All journeys' : focusedFlow?.label ?? 'Application map'} onFlow={() => focus(focused)} selectedLabel={selectedScreen?.label} onSelection={fitSelected} viewport={viewport} busy={viewportBusy} disabled={!generic || viewportUnavailable} reason={viewportReason} changeViewport={size => void changeViewport(size)} resumeLabel={guided.running ? guided.state?.dirty ? `App draft · ${guided.active?.label ?? guided.current}` : 'Resume run' : undefined} onResume={resume} />
          {focusedFlow && !appSelected && focusedFlow.screens.length > 1 && !internalEdges[focusedFlow.id]?.length && !crossEdges.some(edge => focusedFlow.screens.some(screen => screen.id === edge.from || screen.id === edge.to)) && <div className="civic-connection-notice" role="status"><span>No paths registered for this journey.</span><Button variant="link" size="sm" onClick={() => setPane('coverage')}>Review coverage</Button></div>}{guidedSelected && guided.running && selectedScreen.id !== guided.current && <Alert role="status" className="rh-selection">Your run is on {guided.active?.label ?? guided.current}. <Button variant="outline" onClick={resume}>Resume run</Button><Button variant="outline" disabled={!guided.canStartAt(selectedScreen.id) || guided.state?.pending} onClick={() => guided.requestStart(selectedScreen.id)}>Start here…</Button></Alert>}
          <div className={`rh-canvas rh-infinite-canvas ${panning ? 'is-panning' : ''} ${zoom < .5 ? 'is-zoomed-out' : ''}`} ref={stage} aria-label="Entire application canvas" {...controls} onWheelCapture={() => { cameraNavigation.current = true; guided.follow.current = false }} onPointerDownCapture={(event) => { if (panning || event.button === 1 || !(event.target as Element).closest('button,input,select,iframe')) { cameraNavigation.current = true; guided.follow.current = false; } controls.onPointerDownCapture?.(event) }}>
            {!bridge.data && !bridge.error && <div className="civic-canvas-message" role="status" aria-label="Loading project"><Skeleton className="cv:h-8 cv:w-44" /><Skeleton className="cv:h-44 cv:w-64" /><p>Loading journeys…</p></div>}{bridge.data && !scenarios.length && <Empty className="civic-canvas-message" role="status"><EmptyHeader><EmptyMedia variant="icon"><FolderOpen aria-hidden="true" /></EmptyMedia><EmptyTitle>No screens registered yet</EmptyTitle><EmptyDescription>Connect a scenario registry to explore this app’s screens and paths.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => setPane('coverage')}>Review coverage</Button></EmptyContent></Empty>}<CanvasStage flows={flows} compactFlows={compactFlows} crossEdges={crossEdges} internalEdges={internalEdges} overviewEdges={overviewEdges} overview={overview} worldWidth={worldWidth} worldHeight={worldHeight} scene={scene} edgeScene={edgeScene} zoom={zoom} focused={focused} viewed={viewed} pan={pan} panning={panning} source={source} active={initialized.current && desktop.visible} viewport={viewport} generic={generic} previewLabel={previewLabel} selectedPath={pathTarget?.id} bundleSelection={bundleSelection} session={session} guided={guided} focus={focus} focusScreen={focusScreen} interactScreen={interactScreen} resume={resume} selectConnection={selectConnection} selectBundle={selectBundle} observed={observed} openScreen={openScreen} onEditProposal={() => setPane('inspect')} captureScreen={screen => { focusScreen(screen); setPane('review'); reviewPanel.current?.capture({ kind: 'screen', id: screen.id, screen: screen.id, flow: flows.find(flow => flow.screens.some(row => row.id === screen.id))?.id, label: screen.label }, liveGuidedScreen?.id === screen.id ? guided.frame.current : (adapterMode ? adapterScreen : preview?.id) === screen.id ? previewFrame.current : null) }} />
          </div><CanvasControls stage={stage} pan={pan} setPan={chooseTool} motion={motion} changeZoom={zoomTo} fitApp={() => fitApp()} fitFlow={() => focus(focused)} fitSelection={fitSelected} /><footer className="rh-foot"><ConnectionLegend /><span>{adapterMode ? adapterVisits.length : guided.visits.length} captured visits · {browsingLive ? 'Live app · read only' : 'Private synthetic run'}</span></footer>
        </section>
        <WorkspaceInspector pane={pane} setPane={setPane} editing={guided.mode === 'edit' && guidedSelected} scope={reviewTarget.label}
          inspect={<PreviewInspector frame={selectedLiveFrame} viewportController={viewportController} guidedSelected={guidedSelected} guidedContent={guided.inspector} selectedScreen={selectedScreen} generic={generic} live={live} previewAvailable={project.preview} adapterMode={adapterMode} visits={adapterVisits} replaying={replaying} onPlay={openScreen} onReplay={replayFromStart} onDestination={id => { const screen = flows.flatMap(flow => flow.screens).find(screen => screen.id === id); if (screen) focusScreen(screen) }} onRetryCapture={id => { void session.retryCapture(id) }} />}
          review={<ReviewPanel ref={reviewPanel} project={project} selected={selectedScreen ?? null} flowScreens={focusedFlow?.screens ?? []} allScreens={flows.flatMap((flow) => flow.screens)} frame={selectedLiveFrame} target={reviewTarget} canvas={stage.current} fixture={{ source, snapshot: fixtureSnapshot, ...(generic ? { viewport } : {}) }} focus={focusReviewTarget} navigationReady={initialized.current} />}
          contract={pane === 'contract' && <ContractPanel selected={selectedScreen ?? null} scenarios={scenarios} openReviewPane={() => setPane('review')} />}
          coverage={<CoveragePanel bridge={bridge} focus={(scenario) => { const screen = flows.flatMap((flow) => flow.screens).find((screen) => screen.scenario === scenario); if (screen) focusScreen(screen) }} />}
        />
      </WorkspaceBody>
    </main>
}
