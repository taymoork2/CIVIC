import { useEffect, useRef, useState, type HTMLAttributes } from 'react'
import { containCamera, panCamera, zoomCamera, type Camera } from './canvas-camera'

export function useCanvasCamera(initial: Camera, world: { width: number; height: number }) {
  const stage = useRef<HTMLDivElement>(null)
  const [camera, setRawCamera] = useState(initial)
  const [pan, setPan] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const current = useRef(camera)
  const bounds = useRef(world)
  bounds.current = world
  const setCamera = (next: Camera) => {
    const element = stage.current
    const contained = element ? containCamera(next, { width: element.clientWidth, height: element.clientHeight }, bounds.current) : next
    current.current = contained; setRawCamera(contained)
  }
  const [space, setSpace] = useState(false)
  const drag = useRef<{ x: number; y: number; camera: Camera } | null>(null)
  useEffect(() => { current.current = camera }, [camera])
  useEffect(() => {
    const element = stage.current; if (!element) return
    let previous = { width: element.clientWidth, height: element.clientHeight }
    const observer = new ResizeObserver(() => {
      const next = { width: element.clientWidth, height: element.clientHeight }
      if (!next.width || !next.height) return
      setCamera(panCamera(current.current, (next.width - previous.width) / 2, (next.height - previous.height) / 2))
      previous = next; setSize(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const element = stage.current; if (!element?.clientWidth || !element.clientHeight) return
    const next = containCamera(current.current, { width: element.clientWidth, height: element.clientHeight }, world)
    if (next.x !== current.current.x || next.y !== current.current.y) setCamera(next)
  }, [world.width, world.height])
  useEffect(() => {
    const element = stage.current; if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const next = event.ctrlKey || event.metaKey
        ? zoomCamera(current.current, Math.max(.003, Math.min(2, current.current.zoom * Math.exp(-event.deltaY * .005))), { x: event.clientX - rect.left, y: event.clientY - rect.top })
        : panCamera(current.current, event.shiftKey ? -event.deltaY : -event.deltaX, event.shiftKey ? 0 : -event.deltaY)
      setCamera(next)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])
  const changeZoom = (zoom: number) => {
    const element = stage.current; if (!element) return
    setCamera(zoomCamera(camera, zoom, { x: element.clientWidth / 2, y: element.clientHeight / 2 }))
  }
  const controls: HTMLAttributes<HTMLDivElement> = {
    tabIndex: 0,
    onKeyDown(event) {
      if ((event.target as Element).closest('input,select,textarea,button,[contenteditable=true]')) return
      if (event.code === 'Space') { event.preventDefault(); setSpace(true) }
      if (event.code === 'Escape') setPan(false)
    },
    onKeyUp(event) { if (event.code === 'Space') setSpace(false) },
    onBlur() { setSpace(false) },
    onPointerDownCapture(event) {
      if (event.button !== 0 && event.button !== 1) return
      if (!pan && !space && event.button !== 1 && (event.target as Element).closest('button,input,select,iframe')) return
      event.preventDefault(); event.stopPropagation()
      stage.current!.focus(); stage.current!.setPointerCapture(event.pointerId)
      drag.current = { x: event.clientX, y: event.clientY, camera: current.current }
    },
    onPointerMove(event) {
      if (drag.current) setCamera(panCamera(drag.current.camera, event.clientX - drag.current.x, event.clientY - drag.current.y))
    },
    onPointerUp() { drag.current = null },
    onPointerCancel() { drag.current = null },
  }
  return { stage, camera, setCamera, pan, setPan, panning: pan || space, changeZoom, controls, size }
}
