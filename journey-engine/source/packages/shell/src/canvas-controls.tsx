import { useEffect, useRef, type RefObject } from 'react'

export function CanvasIcon({ name }: { name: 'select' | 'hand' | 'outline' | 'fit' | 'inspect' | 'review' | 'coverage' | 'contract' | 'play' | 'edit' | 'chevron' }) {
  const paths = {
    select: 'M5 3v16l4-5 5 7 3-2-5-7 6-1Z',
    hand: 'M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 4-2 7-6 7h-2c-2 0-3-1-4-3l-4-6a2 2 0 0 1 3-2l1 1Z',
    outline: 'M4 4h16v16H4ZM9 4v16M12 8h5M12 12h5M12 16h5',
    fit: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
    inspect: 'M4 4h16v16H4ZM14 4v16M7 8h4M7 12h4',
    review: 'M4 4h16v12H9l-5 4ZM8 8h8M8 12h5',
    coverage: 'M8 4h12M8 12h12M8 20h12M2 4l1 1 2-2M2 12l1 1 2-2M2 20l1 1 2-2',
    contract: 'M6 3h9l4 4v14H6ZM15 3v4h4M9 12l2 2 4-4M9 17h6',
    play: 'M7 4l13 8-13 8Z',
    edit: 'M4 16l12-12 4 4L8 20H4ZM13 7l4 4',
    chevron: 'M6 9l6 6 6-6',
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

export function canvasShortcut(event: { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }, editable: boolean) {
  if (editable || event.metaKey || event.ctrlKey || event.altKey) return null
  if (event.shiftKey && !['+', '='].includes(event.key)) return ({ '!': 'app', '1': 'app', '@': 'selection', '2': 'selection', ')': 'actual', '0': 'actual' } as Record<string, 'app' | 'selection' | 'actual'>)[event.key] ?? null
  return ({ v: 'select', h: 'hand', Escape: 'select', '+': 'in', '=': 'in', '-': 'out' } as Record<string, 'select' | 'hand' | 'in' | 'out'>)[event.key] ?? null
}

export function CanvasControls({ stage, pan, setPan, zoom, changeZoom, fitApp, fitSelection, fitFlow }: {
  stage: RefObject<HTMLDivElement | null>; pan: boolean; setPan: (pan: boolean) => void; zoom: number;
  changeZoom: (zoom: number) => void; fitApp: () => void; fitSelection: () => void; fitFlow: () => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null)
  const tool = (hand: boolean) => { setPan(hand); stage.current?.focus({ preventScroll: true }) }
  useEffect(() => {
    const root = stage.current?.closest('main'); if (!root) return
    const keydown = (event: KeyboardEvent) => {
      const action = canvasShortcut(event, Boolean((event.target as Element).closest('input,textarea,select,[contenteditable=true]')))
      if (!action) return
      event.preventDefault()
      if (action === 'select' || action === 'hand') tool(action === 'hand')
      else if (action === 'app') fitApp()
      else if (action === 'selection') fitSelection()
      else changeZoom(action === 'actual' ? 1 : Math.max(.003, Math.min(2, zoom * (action === 'in' ? 1.25 : .8))))
    }
    root.addEventListener('keydown', keydown)
    return () => root.removeEventListener('keydown', keydown)
  }, [zoom, fitApp, fitSelection, changeZoom])
  const fit = (action: () => void) => { action(); if (menu.current) menu.current.open = false; stage.current?.focus({ preventScroll: true }) }
  return <>
    <div className="rh-canvas-tools" role="toolbar" aria-label="Canvas tools">
      <button aria-label="Select tool" aria-pressed={!pan} title="Select · V" onClick={() => tool(false)}><CanvasIcon name="select" /><span>Select</span><kbd>V</kbd></button>
      <button aria-label="Hand tool" aria-pressed={pan} title="Hand · H · hold Space to pan" onClick={() => tool(true)}><CanvasIcon name="hand" /><span>Hand</span><kbd>H</kbd></button>
    </div>
    <div className="rh-camera-controls" aria-label="Canvas zoom">
      <button aria-label="Zoom out" title="Zoom out · −" onClick={() => changeZoom(Math.max(.003, zoom * .8))}>−</button>
      <details ref={menu} className="rh-zoom-menu"><summary aria-label="Zoom options">{zoom < .01 ? (zoom * 100).toFixed(1) : Math.round(zoom * 100)}% <span aria-hidden="true">⌄</span></summary>
        <div><button onClick={() => fit(fitApp)}>Fit app<kbd>⇧ 1</kbd></button><button onClick={() => fit(fitFlow)}>Fit whole flow</button><button onClick={() => fit(fitSelection)}>Fit selected screen<kbd>⇧ 2</kbd></button><button onClick={() => fit(() => changeZoom(1))}>100%<kbd>⇧ 0</kbd></button><p>Scroll to pan · Pinch to zoom<br />Hold Space to move over screens</p></div>
      </details>
      <button aria-label="Zoom in" title="Zoom in · +" onClick={() => changeZoom(Math.min(2, zoom * 1.25))}>+</button>
      <button aria-label="Fit whole flow" title="Fit whole flow" onClick={fitFlow}><CanvasIcon name="fit" /></button>
    </div>
  </>
}
