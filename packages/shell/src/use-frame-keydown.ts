import { useEffect, useEffectEvent } from 'react'

export function useFrameKeydown(frame: HTMLIFrameElement | null, onKeydown: (event: KeyboardEvent) => void) {
  const shortcut = useEffectEvent(onKeydown)
  useEffect(() => {
    let win: Window | null = null
    const unbind = () => {
      try { win?.removeEventListener('keydown', shortcut, true) } catch {
        // Navigation can revoke access to the previous document.
      }
      win = null
    }
    const bind = () => {
      unbind()
      try { win = frame?.contentWindow ?? null; win?.addEventListener('keydown', shortcut, true) } catch {
        // Cross-origin previews cannot share shell shortcuts.
      }
    }
    bind(); frame?.addEventListener('load', bind)
    return () => { unbind(); frame?.removeEventListener('load', bind) }
  }, [frame])
}
