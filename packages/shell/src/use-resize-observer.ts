import { useEffect, useEffectEvent, type RefObject } from 'react'

export function useResizeObserver(target: RefObject<HTMLElement | null>, resized: (element: HTMLElement, entry: ResizeObserverEntry) => void) {
  const handle = useEffectEvent(resized)
  useEffect(() => {
    const element = target.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => { if (entry) handle(element, entry) })
    observer.observe(element)
    return () => observer.disconnect()
  }, [target])
}
