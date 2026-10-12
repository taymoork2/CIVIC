import { useConvex, useConvexConnectionState } from 'convex/react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/**
 * How long the backend socket may be down before the app treats itself as offline. The socket
 * reconnects after every unlock, which can take a while on laundry-room signal; a short grace
 * would flip the screen to offline each time the phone is picked up.
 */
const stallMs = 15_000

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/**
 * Online means the backend is actually reachable, not just that the device has a network.
 * A phone can sit on laundry-room Wi-Fi with no route to the server; after a short grace
 * period without a live Convex connection the app falls back to its saved, read-only copy.
 */
export function useOnline(): boolean {
  const browserOnline = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  const client = useConvex()
  const subscribeToBackend = useCallback((changed: () => void) => client.subscribeToConnectionState(changed), [client])
  const readBackend = useCallback(() => client.connectionState().isWebSocketConnected, [client])
  // The server cannot observe this device's socket; do not create one during SSR.
  const isWebSocketConnected = useSyncExternalStore(subscribeToBackend, readBackend, () => true)
  const [stalled, setStalled] = useState(false)
  useEffect(() => {
    if (isWebSocketConnected) {
      setStalled(false)
      return
    }
    const timer = window.setTimeout(() => setStalled(true), stallMs)
    return () => window.clearTimeout(timer)
  }, [isWebSocketConnected])
  return browserOnline && !stalled
}

/**
 * A step was recorded on this phone and the server has not confirmed it yet: Convex holds the
 * mutation in memory and sends it when the connection returns. Closing the app before then loses it.
 */
export function useUnsynced(): boolean {
  const { isWebSocketConnected, inflightMutations } = useConvexConnectionState()
  return inflightMutations > 0 && !isWebSocketConnected
}
