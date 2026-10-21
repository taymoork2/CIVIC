import { useEffect, useEffectEvent, useRef, useState, type HTMLAttributes } from 'react'
import { containCamera, panCamera, zoomCamera, type Camera } from './canvas-camera'

export type CameraZoom = { subscribe: (listener: () => void) => () => void; getSnapshot: () => number }

export function useCanvasCamera(initial: Camera, world: { width: number; height: number }) {
  const stage = useRef<HTMLDivElement>(null)
  const scene = useRef<HTMLDivElement>(null)
  const edgeScene = useRef<SVGGElement>(null)
  const [camera, setRawCamera] = useState(initial)
  const [pan, setPan] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const current = useRef(camera)
  const viewport = useRef({ width: 0, height: 0 })
  const wheelOrigin = useRef({ x: 0, y: 0 })
  const frame = useRef<number | null>(null)
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [listeners] = useState(() => new Set<() => void>())
  const [motion] = useState<CameraZoom>(() => ({
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => current.current.zoom,
  }))
  const bounds = useRef(world)
  bounds.current = world
  const paint = () => {
    const next = current.current
    if (scene.current) scene.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.zoom})`
    edgeScene.current?.setAttribute('transform', `translate(${next.x} ${next.y}) scale(${next.zoom})`)
    if (stage.current) stage.current.style.backgroundPosition = `${next.x}px ${next.y}px`
    listeners.forEach(listener => listener())
  }
  const finish = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    if (idle.current !== null) clearTimeout(idle.current)
    frame.current = null; idle.current = null
    paint()
    stage.current?.classList.remove('is-navigating')
    setRawCamera(current.current)
    stage.current?.dispatchEvent(new Event('civic-camera-settled'))
  }
  const contained = (next: Camera, extent = bounds.current) => {
    const element = stage.current
    if (!viewport.current.width && element) viewport.current = { width: element.clientWidth, height: element.clientHeight }
    return element ? containCamera(next, viewport.current, extent) : next
  }
  const setCamera = (next: Camera, extent = bounds.current) => {
    const element = stage.current
    if (element) viewport.current = { width: element.clientWidth, height: element.clientHeight }
    current.current = contained(next, extent)
    finish()
  }
  const moveCamera = (next: Camera) => {
    current.current = contained(next)
    // Move the scene once per display frame; publish selection only when the gesture settles.
    stage.current?.classList.add('is-navigating')
    if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; paint() })
    if (idle.current !== null) clearTimeout(idle.current)
    idle.current = setTimeout(finish, 140)
  }
  const [space, setSpace] = useState(false)
  const drag = useRef<{ x: number; y: number; camera: Camera } | null>(null)
  const resizeCamera = useEffectEvent(setCamera)
  const navigate = useEffectEvent(moveCamera)
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    if (idle.current !== null) clearTimeout(idle.current)
  }, [])
  useEffect(() => {
    const element = stage.current; if (!element) return
    let previous = { width: element.clientWidth, height: element.clientHeight }
    const observer = new ResizeObserver(() => {
      const next = { width: element.clientWidth, height: element.clientHeight }
      if (!next.width || !next.height) return
      viewport.current = next
      resizeCamera(panCamera(current.current, (next.width - previous.width) / 2, (next.height - previous.height) / 2))
      previous = next; setSize(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const element = stage.current; if (!element?.clientWidth || !element.clientHeight) return
    const next = containCamera(current.current, { width: element.clientWidth, height: element.clientHeight }, world)
    if (next.x !== current.current.x || next.y !== current.current.y) resizeCamera(next)
  }, [world.width, world.height])
  useEffect(() => {
    const element = stage.current; if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      if (idle.current === null) {
        const rect = element.getBoundingClientRect()
        wheelOrigin.current = { x: rect.left, y: rect.top }
      }
      const next = event.ctrlKey || event.metaKey
        ? zoomCamera(current.current, Math.max(.003, Math.min(2, current.current.zoom * Math.exp(-event.deltaY * .005))), { x: event.clientX - wheelOrigin.current.x, y: event.clientY - wheelOrigin.current.y })
        : panCamera(current.current, event.shiftKey ? -event.deltaY : -event.deltaX, event.shiftKey ? 0 : -event.deltaY)
      navigate(next)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])
  const changeZoom = (zoom: number) => {
    const element = stage.current; if (!element) return
    setCamera(zoomCamera(current.current, zoom, { x: element.clientWidth / 2, y: element.clientHeight / 2 }))
  }
  const controls: HTMLAttributes<HTMLDivElement> = {
    tabIndex: 0,
    onKeyDown(event) {
      if ((event.target as Element).closest('input,select,textarea,button,[role=button],[contenteditable=true]')) return
      if (event.code === 'Space') { event.preventDefault(); setSpace(true) }
      if (event.code === 'Escape') setPan(false)
    },
    onKeyUp(event) { if (event.code === 'Space') setSpace(false) },
    onBlur() { setSpace(false) },
    onPointerDownCapture(event) {
      if (event.button !== 0 && event.button !== 1) return
      if (!pan && !space && event.button !== 1 && (event.target as Element).closest('button,[role=button],input,select,iframe')) return
      event.preventDefault(); event.stopPropagation()
      stage.current!.focus({ preventScroll: true }); stage.current!.setPointerCapture(event.pointerId)
      const rect = stage.current!.getBoundingClientRect()
      wheelOrigin.current = { x: rect.left, y: rect.top }
      drag.current = { x: event.clientX, y: event.clientY, camera: current.current }
    },
    onPointerMove(event) {
      if (drag.current) moveCamera(panCamera(drag.current.camera, event.clientX - drag.current.x, event.clientY - drag.current.y))
    },
    onPointerUp() { if (drag.current) { drag.current = null; finish() } },
    onPointerCancel() { if (drag.current) { drag.current = null; finish() } },
  }
  return { stage, scene, edgeScene, motion, camera, setCamera, pan, setPan, panning: pan || space, changeZoom, controls, size }
}
