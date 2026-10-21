import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useCanvasCamera } from '@civic/shell/use-canvas-camera'
import { revealNavigation } from '@civic/shell/reveal-navigation'
import { crossFlowEdges, flowEdges, flowAtCenter, screenAtCenter, overviewFlows, flowContent, screenSize, type AppFlow, type MapScreen } from './app-map'
import { overviewConnections } from './app-overview'
import { connectionBounds, connectionBundles } from './connection-routing'
import type { ReviewTarget } from './review-panel'
import type { PreviewViewport } from './viewport-presets'

export function useCanvasSelection({ flows, initialFlow, outline, initialized, viewport, stopFollowing }: {
  flows: AppFlow[]; initialFlow: string; outline: boolean; initialized: RefObject<boolean>; viewport: PreviewViewport; stopFollowing: () => void
}) {
  const [pathTarget, setPathTarget] = useState<ReviewTarget | null>(null)
  const [appSelected, setAppSelected] = useState(true)
  const [focused, setFocused] = useState(initialFlow)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [viewed, setViewed] = useState<string | null>(null)
  const [overview, setOverview] = useState(false)
  const [canvasDetail, setCanvasDetail] = useState(() => { try { return localStorage.getItem('rehearsal-canvas-detail') === 'all' ? 'all' : 'compact' } catch { return 'compact' } })
  const compactFlows = useMemo(() => overviewFlows(flows), [flows])
  const crossEdges = useMemo(() => crossFlowEdges(flows), [flows])
  const internalEdges = useMemo(() => Object.fromEntries(flows.map((flow) => [flow.id, flowEdges(flow)])), [flows])
  const overviewEdges = useMemo(() => overviewConnections(compactFlows), [compactFlows])
  const sharedPaths = useMemo(() => connectionBundles(overview ? overviewEdges : [...Object.values(internalEdges).flat(), ...crossEdges]), [overview, overviewEdges, internalEdges, crossEdges])
  const [bundleSelection, setBundleSelection] = useState<string | null>(null)
  const displayedFlows = overview ? compactFlows : flows
  const { width: detailWidth, height: detailHeight } = useMemo(() => connectionBounds(flows, crossEdges), [flows, crossEdges])
  const { width: overviewWidth, height: overviewHeight } = useMemo(() => connectionBounds(compactFlows, overviewEdges), [compactFlows, overviewEdges])
  const worldHeight = overview ? overviewHeight : detailHeight
  const worldWidth = overview ? overviewWidth : detailWidth
  const { stage, scene, edgeScene, motion, camera, setCamera, pan, setPan, panning, changeZoom, controls, size } = useCanvasCamera({ x: 20, y: 20, zoom: .25 }, { width: worldWidth, height: worldHeight })
  const zoom = camera.zoom

  const navigator = useRef<HTMLDivElement>(null)
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

  const focus = (id: string) => {
    cameraNavigation.current = false
    setBundleSelection(null)
    setPathTarget(null); setAppSelected(false)
    stopFollowing()
    const flow = flows.find((flow) => flow.id === id); if (!flow) return
    setOverview(false); setFocused(id); setExpanded(id); setViewed(null); fit(flow.x, flow.y, flow.width, flow.height)
  }
  const focusScreen = (screen: MapScreen) => {
    cameraNavigation.current = false
    setBundleSelection(null)
    setPathTarget(null); setAppSelected(false)
    stopFollowing()
    const flow = flows.find((entry) => entry.screens.some((node) => node.id === screen.id)); if (!flow) return
    setOverview(false); setFocused(flow.id); setExpanded(flow.id); setViewed(screen.id)
    fit(flow.x + flowContent.x + screen.x!, flow.y + flowContent.y + screen.y!, screenSize(screen).width, screenSize(screen).height)
  }

  const focusedFlow = flows.find((flow) => flow.id === focused)
  const selectedScreen = focusedFlow?.screens.find((screen) => screen.id === viewed)
  const fitApp = (detail = canvasDetail) => {
    cameraNavigation.current = false
    setBundleSelection(null)
    const canvas = stage.current; if (!canvas) return
    setPathTarget(null); setAppSelected(true)
    stopFollowing(); setViewed(null); setOverview(detail === 'compact')
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
    if (flow && element) setCamera({ x: element.clientWidth / 2 - screenSize(screen).width / 2 - flow.x - flowContent.x - screen.x!, y: 20 - flow.y - flowContent.y - screen.y!, zoom: 1 })
  }

  return { pathTarget, setPathTarget, appSelected, focused, setFocused, expanded, setExpanded, viewed, overview, canvasDetail, setCanvasDetail, compactFlows, crossEdges, internalEdges, overviewEdges, sharedPaths, bundleSelection, setBundleSelection, worldHeight, worldWidth, stage, scene, edgeScene, motion, pan, setPan, panning, changeZoom, controls, size, zoom, navigator, cameraNavigation, focus, focusScreen, fit, fitApp, fitSelected, interactScreen, focusedFlow, selectedScreen }
}
