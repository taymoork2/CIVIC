import { useEffect, useMemo, useRef, useState } from 'react'
import { appFlows, crossFlowEdges, flowAtCenter, screenAtCenter, journeySections, type MapScenario, type MapScreen } from './app-map'
import { useTowelSession } from './canvas'
import { ReviewPanel } from './review-panel'
import { ContractPanel } from './contract-panel'
import type { ScenarioEvidence } from '@civic/shell/contract'
import { useCanvasCamera } from '@civic/shell/use-canvas-camera'
import { revealNavigation } from '@civic/shell/reveal-navigation'
import { CanvasControls, CanvasIcon } from '@civic/shell/canvas-controls'
import '@civic/shell/styles/canvas.css'
import '@civic/shell/styles/app-canvas.css'
import '@civic/shell/styles/canvas-chrome.css'

export function AppCanvas() {
  const [scenarios, setScenarios] = useState<(MapScenario & ScenarioEvidence)[]>([])
  const [source, setSource] = useState('')
  const [ready, setReady] = useState(false)
  const [missing, setMissing] = useState<string[]>([])
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [outline, setOutline] = useState(() => window.innerWidth >= 1180)
  const [coverage, setCoverage] = useState('all')
  const [focused, setFocused] = useState('towel')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [viewed, setViewed] = useState<string | null>(null)
  const flows = useMemo(() => appFlows(scenarios), [scenarios])
  const worldHeight = Math.max(0, ...flows.map((flow) => flow.y + flow.height)) + 60
  const worldWidth = Math.max(0, ...flows.map((flow) => flow.x + flow.width)) + 60
  const { stage, camera, setCamera, pan, setPan, panning, changeZoom, controls, size } = useCanvasCamera({ x: 20, y: 20, zoom: .25 }, { width: worldWidth, height: worldHeight })
  const zoom = camera.zoom
  const [preview, setPreview] = useState<MapScreen | null>(null)
  const [queued, setQueued] = useState<MapScreen | null>(null)
  const [pane, setPane] = useState<'inspect' | 'review' | 'contract' | null>(() => { const params = new URLSearchParams(location.search); return params.has('feedback') || params.get('view') === 'review' ? 'review' : params.get('view') === 'contract' ? 'contract' : null })
  const towel = useTowelSession(viewed)
  const previewFrame = useRef<HTMLIFrameElement>(null)
  const navigator = useRef<HTMLElement>(null)
  const initialized = useRef(false)
  const matches = (screen: MapScreen) => screen.label.toLowerCase().includes(query.toLowerCase()) && (coverage === 'all' || (coverage === 'partial') === screen.partial)
  useEffect(() => { revealNavigation(navigator.current) }, [focused, viewed, expanded, size.width, size.height])
  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/review/index'); if (!response.ok) throw Error('App inventory could not be loaded.')
        const index = await response.json(); setScenarios(index.scenarios)
        const snapshots = await fetch('/api/review/snapshots', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope: 'app' }) })
        if (!snapshots.ok) throw Error('Screen snapshots could not be prepared. Reload to retry.')
        const receipt = await snapshots.json(); setSource(receipt.source); setMissing(receipt.errors); setReady(true)
      } catch (caught) { setError((caught as Error).message) }
    }
    void load()
  }, [])
  useEffect(() => {
    const canvas = stage.current; if (!canvas?.clientWidth || !canvas.clientHeight) return
    const x = (canvas.clientWidth / 2 - camera.x) / zoom, y = (canvas.clientHeight / 2 - camera.y) / zoom
    const flow = flowAtCenter(flows, x, y)
    if (flow && zoom >= .04) { setFocused(flow.id); setExpanded(flow.id); setViewed(zoom >= .5 ? screenAtCenter(flow, x, y)?.id ?? null : null) }
  }, [camera, flows, zoom])
  const fit = (x: number, y: number, width: number, height: number, maximum = 1.25) => {
    const canvas = stage.current; if (!canvas) return
    const next = Math.max(.003, Math.min(maximum, (canvas.clientWidth - 48) / width, (canvas.clientHeight - 112) / height))
    setCamera({ x: (canvas.clientWidth - width * next) / 2 - x * next, y: (canvas.clientHeight - height * next) / 2 - y * next, zoom: next })
  }
  useEffect(() => {
    if (!initialized.current && scenarios.length && size.width && size.height) { initialized.current = true; const params = new URLSearchParams(location.search); const target = flows.flatMap((flow) => flow.screens).find((screen) => screen.scenario === params.get('scenario') && (!params.has('care') || screen.id === `care:${params.get('care')}`)); const first = flows[0]!; if (target) focusScreen(target); else if (size.width < 760) focusScreen(first.screens[0]!); else { setFocused(first.id); setExpanded(first.id); fit(first.x, first.y, first.width, first.height) } }
  }, [flows, scenarios.length, size.width, size.height])
  const focus = (id: string) => {
    towel.follow.current = false
    const flow = flows.find((flow) => flow.id === id); if (!flow) return
    setFocused(id); setExpanded(id); setViewed(null); fit(flow.x, flow.y, flow.width, flow.height)
  }
  const focusScreen = (screen: MapScreen) => {
    towel.follow.current = false
    const flow = flows.find((entry) => entry.screens.some((node) => node.id === screen.id)); if (!flow) return
    setFocused(flow.id); setExpanded(flow.id); setViewed(screen.id)
    fit(flow.x + 36 + screen.x!, flow.y + 132 + screen.y!, 271, 737)
  }
  const openScreen = (screen: MapScreen) => {
    const flow = flows.find((entry) => entry.screens.some((node) => node.id === screen.id))!
    focusScreen(screen)
    if (flow.id === 'towel') {
      if (!towel.running) towel.requestStart(screen.id)
      else if (screen.id !== towel.current) towel.requestStart(screen.id)
      towel.follow.current = screen.id === towel.current || !towel.running
    } else if (preview && preview.id !== screen.id) setQueued(screen)
    else setPreview(screen)
  }

  const focusedFlow = flows.find((flow) => flow.id === focused)
  const selectedScreen = focusedFlow?.screens.find((screen) => screen.id === viewed)
  const fitApp = () => { towel.follow.current = false; setViewed(null); fit(0, 0, worldWidth, worldHeight) }
  const fitSelected = () => selectedScreen ? focusScreen(selectedScreen) : focus(focused)
  const interactScreen = (screen: MapScreen) => {
    focusScreen(screen)
    const flow = flows.find((entry) => entry.screens.some((node) => node.id === screen.id)), element = stage.current
    if (flow && element) setCamera({ x: element.clientWidth / 2 - 135.5 - flow.x - 36 - screen.x!, y: 20 - flow.y - 132 - screen.y!, zoom: 1 })
  }
  const towelFlow = flows.find((flow) => flow.id === 'towel')
  const liveTowelScreen = towelFlow?.screens.find((screen) => screen.id === towel.currentNode.id)
  const towelSelected = focused === 'towel' && selectedScreen !== undefined
  const resume = () => {
    if (liveTowelScreen) { focusScreen(liveTowelScreen); towel.follow.current = true }
  }
  useEffect(() => {
    if (towel.running && towel.follow.current && towel.active && liveTowelScreen) {
      focusScreen(liveTowelScreen); towel.follow.current = true
    }
  }, [towel.current, towel.generation, towel.running])
  const selectedLiveFrame = towelSelected && viewed === towel.current ? towel.frame.current : preview?.id === viewed ? previewFrame.current : null
  const liveScreen = towel.running ? liveTowelScreen : undefined
  return <main className="rehearsal app-rehearsal">
      <header className="rh-brand"><button className="rh-outline-toggle" aria-label="Toggle journey outline" aria-expanded={outline} onClick={() => setOutline(!outline)}><CanvasIcon name="outline" /></button><strong>Rehearsal</strong><span>Laundry App</span><div className="rh-tools"><div className="rh-mode" aria-label="Canvas mode"><button aria-pressed={!towelSelected || towel.mode === 'play'} disabled={towel.saving} onClick={() => { if (towelSelected) towel.play(); if (selectedScreen && (!towelSelected || !towel.running)) openScreen(selectedScreen) }}>Play</button><button aria-pressed={towelSelected && towel.mode === 'edit'} disabled={!towelSelected} onClick={() => { towel.setMode('edit'); setPane('inspect') }}>Edit proposal</button></div><button aria-expanded={pane === 'inspect'} onClick={() => setPane(pane === 'inspect' ? null : 'inspect')}>Inspect</button><button aria-expanded={pane === 'review'} onClick={() => setPane(pane === 'review' ? null : 'review')}>Review</button><button aria-expanded={pane === 'contract'} onClick={() => setPane(pane === 'contract' ? null : 'contract')}>Contract</button></div></header>
      {towel.notices}
      {error && <p role="alert" className="rh-alert">{error}</p>}
      {queued && <section className="rh-confirm"><h2>Replace the open synthetic preview?</h2><p>Its unsaved draft will be replaced. The towel run stays separate and is retained.</p><button onClick={() => { setPreview(queued); setQueued(null) }}>Open selected screen</button><button onClick={() => setQueued(null)}>Keep current preview</button></section>}
      <div className={`rh-layout ${pane ? 'has-inspector' : ''} ${outline ? '' : 'outline-closed'}`}><aside ref={navigator} className="rh-journeys" aria-label="App flow navigator" hidden={!outline}><div className="rh-outline-heading"><h2>App journey</h2><button aria-label="Close journey outline" onClick={() => setOutline(false)}>×</button></div><label className="rh-search">Search the app<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search flows or screens…" /></label><label className="rh-search">Coverage<select value={coverage} onChange={(event) => setCoverage(event.target.value)}><option value="all">All registered screens</option><option value="working">Working fixtures</option><option value="partial">Partial specimens</option></select></label>{journeySections.map((section) => {
        const children = flows.filter((flow) => flow.section === section && (flow.screens.some(matches) || query.length > 0 && flow.label.toLowerCase().includes(query.toLowerCase())))
        return children.length > 0 && <section className="app-nav-section" key={section}><h3>{section}</h3><ol>{children.map((flow) => <li key={flow.id}><button aria-expanded={expanded === flow.id} aria-current={focused === flow.id ? 'location' : undefined} onClick={() => focus(flow.id)}><span>{expanded === flow.id ? '⌄' : '›'} {flow.label}</span><small>{flow.screens.length}</small></button>{expanded === flow.id && <ol className="app-screen-outline">{flow.screens.filter((screen) => matches(screen) || flow.label.toLowerCase().includes(query.toLowerCase())).map((screen, index) => <li key={screen.id}><button aria-current={viewed === screen.id ? 'page' : undefined} onClick={() => focusScreen(screen)}><small>{String(index + 1).padStart(2, '0')}</small><span>{screen.label}</span>{flow.id === 'towel' && towel.running && towel.current === screen.id && <small className="rh-live-label">Live</small>}</button></li>)}</ol>}</li>)}</ol></section>
      })}<p className="rh-muted">Drag background to pan · Space or Pan over screens · Pinch to zoom</p></aside>
        <section className="rh-map-area"><div className="rh-map-bar"><nav className="rh-breadcrumb" aria-label="Canvas location"><button onClick={fitApp}>App</button><span>›</span><button onClick={() => focus(focused)}>{focusedFlow?.label ?? 'Application map'}</button>{selectedScreen && <><span>›</span><button onClick={fitSelected}>{selectedScreen.label}</button></>}</nav><span className={`rh-preview-badge ${selectedLiveFrame ? 'is-live' : ''}`}>{selectedLiveFrame ? towelSelected && (towel.candidate || towel.mode === 'edit') ? `Proposal ${towel.dirtyProposal ? 'draft' : `v${towel.proposal.version}`}` : 'Live preview' : 'Snapshots'}</span>{towel.running && <button className="rh-resume" onClick={resume}>{towel.state?.dirty ? `App draft · ${towel.active?.label ?? towel.current}` : 'Resume run'}</button>}<span className="rh-muted">{ready ? missing.length ? `${missing.length} unavailable` : '' : 'Preparing snapshots…'}</span></div>
          {towelSelected && towel.running && selectedScreen.id !== towel.current && <div className="rh-selection">Your run is on {towel.active?.label ?? towel.current}. <button onClick={resume}>Resume run</button><button disabled={selectedScreen.id === 'saved' || towel.state?.pending} onClick={() => towel.requestStart(selectedScreen.id)}>Start here…</button></div>}
          <div className={`rh-canvas rh-infinite-canvas ${panning ? 'is-panning' : ''} ${zoom < .5 ? 'is-zoomed-out' : ''}`} ref={stage} aria-label="Entire application canvas" style={{ backgroundPosition: `${camera.x}px ${camera.y}px` }} {...controls} onWheelCapture={() => { towel.follow.current = false }} onPointerDownCapture={(event) => { if (panning || event.button === 1 || !(event.target as Element).closest('button,input,select,iframe')) towel.follow.current = false; controls.onPointerDownCapture?.(event) }}>
            <div className="app-camera-layer"><div className="app-scene" style={{ width: worldWidth, height: worldHeight, transform: `translate(${camera.x}px, ${camera.y}px) scale(${zoom})` }}>{flows.map((flow) => <section key={flow.id} className={`app-flow ${focused === flow.id ? 'is-focused' : ''}`} aria-label={`${flow.label} flow`} style={{ left: flow.x, top: flow.y, width: flow.width, height: flow.height }}><header><div><h2>{flow.label}</h2><p>{flow.screens.length} screens · {flow.screens.every((screen) => screen.partial) ? 'Partial specimens · paths unverified' : flow.id === 'towel' ? 'Both ownership branches · continuous run & captured inputs' : 'Working fixtures · end-to-end recording not yet connected'}</p></div><button onClick={() => focus(flow.id)}>Fit whole flow</button>{flow.id === 'towel' && <button className="rh-primary" onClick={() => towel.running ? resume() : openScreen(flow.screens[0]!)}>{towel.running ? 'Resume run' : 'Play towel journey'}</button>}</header>
              <svg className="app-flow-edges" width={flow.width - 72} height={flow.height - 132} aria-label={`Declared paths in ${flow.label}`}><defs><marker id={`arrow-${flow.id.replace(/[^a-z0-9]/gi, '')}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#526880" /></marker></defs>{flow.screens.flatMap((screen, i) => screen.edges.map((edge) => {
                const j = flow.screens.findIndex((node) => node.id === edge.destination); if (j < 0) return null
                const to = flow.screens[j]!, x1 = screen.x! + 271, x2 = to.x!, y1 = screen.y! + 370, y2 = to.y! + 370
                const observed = flow.id === 'towel' && towel.visits.some((visit) => visit.runId === towel.runId && visit.from === screen.id && visit.to === edge.destination)
                const bypass = j > i + 1, lane = 1320
                const d = screen.id === 'origin' && bypass || screen.id === 'intake.pack.origin' && bypass ? `M ${x1} ${y1} H ${x2}` : bypass ? `M ${x1} ${y1} H ${x1 + 24} V ${lane} H ${x2 - 24} V ${y2} H ${x2}` : `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}`
                return <g key={`${screen.id}-${edge.destination}`}><path d={d} fill="none" stroke={observed ? '#bd3907' : '#526880'} strokeWidth={observed ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" markerEnd={`url(#arrow-${flow.id.replace(/[^a-z0-9]/gi, '')})`} />{screen.edges.length > 1 && <text x={x1 + 30} y={bypass && screen.id !== 'origin' && screen.id !== 'intake.pack.origin' ? lane - 12 : !bypass && (screen.id === 'origin' || screen.id === 'intake.pack.origin') ? y1 + 110 : y1 - 16} fontSize="18" fill="#526880">{edge.action}</text>}</g>
              }))}</svg>
              <div className="app-screen-grid">{flow.screens.map((screen, index) => <article key={screen.id} style={{ left: screen.x, top: screen.y }} className={`app-screen ${viewed === screen.id ? 'is-viewed' : ''} ${matches(screen) || query.length > 0 && flow.label.toLowerCase().includes(query.toLowerCase()) ? '' : 'is-filtered'}`}><button onClick={() => focusScreen(screen)} disabled={pan}><strong>{String(index + 1).padStart(2, '0')} {screen.label}</strong><small>{flow.id === 'towel' && liveScreen && liveScreen.id === screen.id || preview?.id === screen.id ? 'Live · private synthetic preview' : screen.partial ? 'Partial specimen' : 'Real app fixture'}</small></button>{flow.id === 'towel' && liveScreen && liveScreen.id === screen.id ? <div className="app-screen-placeholder" aria-hidden="true" /> : preview?.id === screen.id ? <div className="app-live-screen"><iframe ref={previewFrame} onLoad={() => setPreview((current) => current ? { ...current } : null)} title={`Live ${screen.label}`} src={`/review-frame.html?scenario=${encodeURIComponent(screen.scenario)}`} />{(zoom < .5 || viewed !== screen.id) && <button className="rh-interact-shield" onClick={() => interactScreen(screen)}>Zoom to interact</button>}</div> : ready && !missing.includes(screen.id) ? <button className="app-screen-picture" disabled={pan} onClick={() => focusScreen(screen)}><img src={flow.id === 'towel' && towel.snapshots.get(screen.id)?.capture || `/api/review/fixture.png?screen=${encodeURIComponent(screen.id)}&source=${source}`} alt={`${screen.label} actual screen snapshot`} loading="lazy" /></button> : <div className="app-screen-placeholder">{ready ? 'Snapshot unavailable. Open to inspect the real state.' : 'Preparing saved snapshot…'}</div>}{viewed === screen.id && !(flow.id === 'towel' && liveScreen?.id === screen.id) && preview?.id !== screen.id && <button className="app-play-screen" disabled={pan || screen.id === 'saved' && !towel.running} onClick={() => openScreen(screen)}>Play this screen</button>}</article>)}</div>
            </section>)}<svg className="app-cross-flow-edges" width={worldWidth} height={worldHeight} aria-label="Declared paths between flows"><defs><marker id="cross-flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#526880" /></marker></defs>{flows.slice(0, -1).map((flow, index) => <g key={`navigation-${flow.id}`}><path d={`M ${flow.x + flow.width} ${flow.y + 100} H ${flows[index + 1]!.x}`} fill="none" stroke="#526880" strokeWidth="1.5" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" markerEnd="url(#cross-flow-arrow)" /><text x={flow.x + flow.width + 35} y={flow.y + 80} fill="#526880" fontSize="18">Navigation order</text></g>)}{crossFlowEdges(flows).map((edge) => <g key={edge.id}><path d={edge.d} fill="none" stroke="#526880" strokeWidth="1.5" vectorEffect="non-scaling-stroke" markerEnd="url(#cross-flow-arrow)" /><text x={edge.x} y={edge.y} fill="#526880" fontSize="18">{edge.action}</text></g>)}</svg>{liveScreen && towelFlow && <article className="app-screen app-towel-live" aria-label="Live towel session" style={{ left: towelFlow.x + 36 + liveScreen.x!, top: towelFlow.y + 132 + liveScreen.y! }}><button onClick={resume}><strong>{towel.active?.label ?? (towel.current === 'closed' ? 'Run ended' : `Unmapped screen · ${towel.current}`)}</strong><small>{towel.candidate || towel.mode === 'edit' ? `Proposal ${towel.dirtyProposal ? 'draft' : `v${towel.proposal.version}`} · not in app` : 'Live · baseline'}</small></button><div className="app-live-screen"><iframe key={towel.generation} ref={towel.frame} title="Live towel journey" src={towel.src} onLoad={towel.attach} />{(zoom < .65 || viewed !== towel.current) && <button className="rh-interact-shield" onClick={() => { interactScreen(liveScreen); towel.follow.current = true }}>Zoom to interact</button>}{towel.mode === 'edit' && viewed === towel.current && zoom >= .65 && <button className="rh-edit-surface" aria-label="Select screen or action to edit" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); towel.setProperty((event.clientY - rect.top) / rect.height > .87 ? 'action' : 'screen'); setPane('inspect') }} />}</div></article>}</div></div>
          </div><CanvasControls stage={stage} pan={pan} setPan={(value) => { towel.follow.current = false; setPan(value) }} zoom={zoom} changeZoom={(value) => { towel.follow.current = false; changeZoom(value) }} fitApp={fitApp} fitFlow={() => focus(focused)} fitSelection={fitSelected} /><footer className="rh-foot"><span>Dashed: navigation order · Solid: declared actions</span><span>{towel.visits.length} captured visits · Private synthetic run</span></footer>
        </section>
        <aside className="rh-inspector" aria-label="Contextual panel" hidden={!pane}><div className="rh-inspector-title"><h2>{pane === 'review' ? 'Review' : pane === 'contract' ? 'Product contract' : towel.mode === 'edit' && towelSelected ? 'Edit proposal' : 'Inspect'}</h2><button aria-label="Close panel" onClick={() => setPane(null)}>Close</button></div><div className="rh-panel-tabs"><button aria-pressed={pane === 'inspect'} onClick={() => setPane('inspect')}>{towel.mode === 'edit' ? 'Proposal' : 'Properties'}</button><button aria-pressed={pane === 'review'} onClick={() => setPane('review')}>Reviews</button><button aria-pressed={pane === 'contract'} onClick={() => setPane('contract')}>Contract</button></div><p className="rh-panel-scope">{selectedScreen?.label ?? focusedFlow?.label ?? 'App'}</p><div className="rh-inspect-content" hidden={pane !== 'inspect'}>{towelSelected ? towel.inspector : <><p>{selectedScreen ? 'Select a towel screen to edit its supported proposal properties.' : 'Select a screen to inspect its properties.'}</p>{selectedScreen && <><p>{selectedScreen.partial ? 'Partial specimen · paths unverified' : 'Working app fixture'}</p><p>Scenario: {selectedScreen.scenario}</p><button onClick={() => openScreen(selectedScreen)}>Play selected screen</button></>}</>}</div><div hidden={pane !== 'contract'}>{pane === 'contract' && <ContractPanel selected={selectedScreen ?? null} scenarios={scenarios} openReviewPane={() => setPane('review')} />}</div><div hidden={pane !== 'review'}><ReviewPanel selected={selectedScreen ?? null} flowScreens={focusedFlow?.screens ?? []} allScreens={flows.flatMap((flow) => flow.screens)} frame={selectedLiveFrame} focus={focusScreen} /></div></aside>
      </div>
    </main>
}
