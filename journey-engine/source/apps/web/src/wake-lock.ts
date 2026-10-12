import { useEffect, useState } from 'react'

type WakeLockSentinel = { release: () => Promise<void>; addEventListener: (type: 'release', listener: () => void) => void }
type WakeLockApi = { request: (type: 'screen') => Promise<WakeLockSentinel> }

/**
 * Keeps the screen on while `wanted` is true and the page is visible (the browser drops the
 * lock when the tab is hidden; it is re-taken on return). Returns whether it is supported/held.
 */
export function useWakeLock(wanted: boolean): { supported: boolean; held: boolean } {
  const api = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (!wanted || api === undefined) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || sentinel !== null) return
      try {
        sentinel = await api.request('screen')
        if (cancelled) {
          await sentinel.release()
          return
        }
        setHeld(true)
        sentinel.addEventListener('release', () => {
          sentinel = null
          setHeld(false)
        })
      } catch {
        setHeld(false)
      }
    }
    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      void sentinel?.release()
      setHeld(false)
    }
  }, [wanted, api])

  return { supported: api !== undefined, held }
}
