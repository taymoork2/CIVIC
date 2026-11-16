import { useEffect, useEffectEvent } from 'react'

export function useWindowEvent<K extends keyof WindowEventMap>(name: K, listener: (event: WindowEventMap[K]) => void, enabled = true) {
  const handle = useEffectEvent(listener)
  useEffect(() => {
    if (!enabled) return
    window.addEventListener(name, handle)
    return () => window.removeEventListener(name, handle)
  }, [name, enabled])
}
