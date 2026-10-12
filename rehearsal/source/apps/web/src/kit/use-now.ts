import { useEffect, useState } from 'react'

/** The clock also catches up when iOS brings the app back into view. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = window.setInterval(tick, intervalMs)
    const visible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('pageshow', tick)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('pageshow', tick)
      window.removeEventListener('focus', tick)
    }
  }, [intervalMs])
  return now
}
